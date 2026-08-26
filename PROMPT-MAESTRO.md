# PROMPT MAESTRO — Kiosko App

> Versión condensada de toda la especificación, en un solo bloque portable.
> Para construir en serio, usá `CLAUDE.md` + `docs/` + los prompts por fase de
> `docs/06-prompts/`: una IA trabajando de a una fase produce mucho mejor
> resultado que con un prompt gigante de una sola vez.

---

```
Construí una PWA de gestión integral para kioscos y maxikioscos argentinos.
Es un SaaS multi-comercio, offline-first y táctil.

## STACK
Next.js 15 (App Router) + TypeScript strict + Tailwind + shadcn/ui + lucide-react.
Supabase (Postgres + Auth + RLS + Realtime + Storage). Dexie.js (IndexedDB) para
offline. Serwist para PWA. Zustand + TanStack Query. Zod. Deploy en Vercel.

## REGLAS INNEGOCIABLES
1. Plata en CENTAVOS (bigint), peso en GRAMOS (bigint). Nunca floats para dinero.
2. El stock es un LIBRO MAYOR (movimientos_stock con deltas), no un número que el
   cliente sobrescribe. productos.stock_actual es un agregado cacheado por trigger.
3. El POS escribe primero en IndexedDB y NUNCA espera a la red.
4. IDs generados en el cliente (UUID v7) para que la sincronización sea idempotente.
5. Toda tabla de negocio lleva comercio_id + política RLS. Los permisos se validan
   en el servidor, no escondiendo botones.
6. Las ventas son append-only: no se editan ni se borran, se anulan.
7. Español rioplatense (vuelto, fiado, arqueo, mercadería). Voseo.
8. Targets táctiles de 64×64 px mínimo en el POS.

## MODELO DE DATOS — LAS DECISIONES QUE IMPORTAN

FRACCIONAMIENTO: dos atributos ortogonales, NO relación padre/hijo.
  - tipo_venta = UNIDAD (stock en unidades, precio_venta_centavos)
                 o PESO (stock en GRAMOS, precio_por_kg_centavos)
  - factor_compra = cuántas unidades de venta hay en una unidad de compra
                    (Caja x24 -> 24; Horma de 4 kg -> 4000)
  Con esto una horma de queso nunca necesita existir como producto separado:
  comprás 1 horma y el stock sube 4000 g; vendés 250 g y baja 250.

MERMA: motivos de movimiento VENTA, COMPRA, AJUSTE, MERMA, ROTURA, VENCIMIENTO,
  CONSUMO_INTERNO, DEVOLUCION, CARGA_INICIAL. Sin poder registrar la pérdida, el
  stock teórico se despega del real en dos semanas y el dueño abandona el sistema.

PAGOS: ventas_pagos es una TABLA 1:N, no un campo. El pago mixto ("$5.000 en
  efectivo y el resto por transferencia") pasa todos los días en un kiosco.

SERVICIOS (recargas, SUBE): tipo_producto = SERVICIO. Mueven el monto total en
  caja pero el margen es SOLO la comisión. Si no se separa, los reportes de
  rentabilidad mienten por decenas de miles de pesos.

REDONDEO: config_comercio.redondeo_centavos ($1/$10/$50/$100). En Argentina las
  monedas no circulan. Un único helper en lib/money.ts, jamás duplicado.

Tablas: comercios, config_comercio, usuarios_comercio, dispositivos, categorias,
proveedores, productos, precios_historial, teclas_rapidas, catalogo_base,
movimientos_stock, compras(+items), clientes, cuenta_corriente_movimientos,
ventas(+items,+pagos), caja_sesiones, caja_movimientos, arqueos, gastos,
zonas_envio, pedidos_vidriera(+items), auditoria.

## MÓDULOS

M1 AUTH/RBAC — Roles dueño y empleado. comercio_id y rol en el JWT vía custom
access token hook. PIN de 4 dígitos (bcrypt, validado en el servidor) para cambiar
de operador sin logout y para autorizar anulaciones, descuentos y excesos de
crédito. El empleado NO ve costos, márgenes, reportes ni el efectivo esperado.

M2 POS — Grilla táctil por categorías, buscador predictivo local sobre Dexie
(nombre normalizado + alias, <50 ms), 8-12 TECLAS RÁPIDAS fijas, ticket lateral.
Pagos: EFECTIVO (campo "paga con" + vuelto en vivo + botones $2.000/$5.000/
$10.000/$20.000), TRANSFERENCIA, DÉBITO, CRÉDITO, QR, FIADO, y PAGO MIXTO.
Anulación con motivo + PIN. Alta express de producto desde el buscador cuando no
existe. META: 3 productos + efectivo en 8 toques y menos de 15 segundos.

M3 MODO BALANZA — La balanza pesa, el sistema calcula. Dos modos:
  A) Gramos -> Importe: tipea 250 g, sale $4.600 (redondeado).
  B) Importe -> Gramos EN DOS PASOS: tipea $2.000, dice "pesá ~148 g", va a la
     balanza, y en el PASO 2 ingresa el peso real (152 g) y se recalcula el precio
     exacto. El paso 2 es la clave: sin él se regala plata veinte veces por día.
importeDesdeGramos = redondear(round(gramos * precioPorKg / 1000), redondeo)
gramosDesdeImporte = round(importe * 1000 / precioPorKg)   // sin redondear
Cada pesada es su propia línea del ticket. Todo en enteros.

M4 INVENTARIO — Stock mínimo por producto. Vista "Para reponer" AGRUPADA POR
PROVEEDOR (no una lista única: el pedido se le manda a cada uno por separado), con
botón "Enviar por WhatsApp" que genera texto plano con las cantidades en unidades
de COMPRA. Reposición rápida: la misma lista con checkbox + cantidad, un toque
actualiza el stock sin recargar productos. Ajustes con motivo. Vencimientos.
Alta de productos: catálogo semilla > import CSV > manual.

M5 CAJA Y ARQUEO CIEGO — Apertura con fondo inicial, movimientos manuales de
ingreso y egreso. Cierre: el empleado declara el efectivo contado (con desglose de
billetes) SIN ver el esperado, y el registro queda INMUTABLE (trigger que rechaza
el UPDATE). La política RLS permite INSERT pero no SELECT al empleado, así el
esperado nunca viaja a su dispositivo. El dueño ve esperado, declarado, diferencia
y la DIFERENCIA ACUMULADA POR EMPLEADO EN EL MES.
esperado = fondo + efectivo de ventas + ingresos + cobros de fiado en efectivo
           - egresos

M6 CUENTAS CORRIENTES — Clientes con límite de crédito y saldo. Estados: al día /
con deuda / cerca del límite / al límite. Bloqueo en el POS al superar el
disponible, con override por PIN del dueño (auditado). El bloqueo le saca al
empleado la responsabilidad de decir que no. Cobros parciales y totales; SI EL
COBRO ES EN EFECTIVO TIENE QUE GENERAR UN INGRESO DE CAJA o el arqueo cierra mal.
Botón "Recordar por WhatsApp" con el detalle de la deuda.

M7 PRECIOS E INFLACIÓN — Actualización masiva por porcentaje filtrando por
categoría o proveedor, CON VISTA PREVIA, redondeo automático, historial y deshacer
por 24 h. Alerta de margen negativo cuando sube el costo. Precio sugerido por
margen objetivo. Historial de precios por producto y por proveedor.
En Argentina este es, después del POS, el módulo que más se usa.

M8 VIDRIERA DIGITAL — Ruta pública /t/[slug] con ISR, sin login. Catálogo por
categoría con precios y stock reales, changuito en localStorage, checkout express
(nombre, teléfono, dirección, retiro o envío, zonas con costo y mínimo).
CLAVE: el pedido SE GUARDA EN LA BASE ANTES de abrir WhatsApp, y el dueño lo ve en
una bandeja con realtime y badge; con un toque lo convierte en venta descontando
stock. Un wa.me suelto se pierde entre 40 chats y no descuenta stock.
Generador de QR imprimible. Es el único módulo que le hace GANAR plata al kiosco:
delivery propio sin pagar 20-30% de comisión.

M9 REPORTES — Panel con la venta de hoy comparada CONTRA EL MISMO DÍA DE LA SEMANA
PASADA (no contra ayer), tickets, ticket promedio, desglose por medio de pago.
Heatmap de ventas por hora (a qué hora abrir, cuándo poner otra persona). Top por
RENTABILIDAD y no por volumen, usando el costo congelado en el item. Productos
muertos sin venta en 30 días. Gastos para calcular rentabilidad neta. Export CSV.
Cada número viene con una acción al lado.

## DISEÑO
Tema oscuro en el POS (turno largo, menos fatiga). Targets de 64×64 px, numpad de
72×72. Números con font-variant-numeric: tabular-nums. Colores por categoría con
contraste AA. Feedback háptico y sonoro al agregar y al cobrar. Sin modales
anidados en el flujo de cobro. Estados vacíos que enseñan. La foto de producto es
SIEMPRE opcional: pedir fotos es la fricción que hace abandonar la carga del
catálogo. La Vidriera tiene su propio tratamiento visual, más aireado, siguiendo
el tema del dispositivo del visitante.

## RIESGO PRINCIPAL DEL PRODUCTO
Nadie carga 400 productos a mano antes de vender el primero. Por eso el CATÁLOGO
SEMILLA ARGENTINO precargado (~400 productos reales con marca y presentación, que
el dueño solo tilda y le pone precio) es requisito de MVP, no un extra. Sumado a
import CSV y a alta express desde el POS.

## FUERA DE ALCANCE EN V1
Facturación ARCA (los campos fiscales quedan en la base para el addon posterior),
multi-sucursal, pasarela de pago online, integración con balanza, lector USB o
impresora térmica, app nativa.

## ORDEN DE CONSTRUCCIÓN
0 setup y capa offline → 1 auth y RBAC → 2 catálogo → 3 POS → 4 balanza → 5 caja →
6 inventario → 7 fiados → 8 sync robusto  [hasta acá el MVP vendible]
→ 9 vidriera → 10 reportes y precios → 11 pulido

Construí de a una fase. Al terminar cada una, verificá los criterios de aceptación
antes de seguir.
```
