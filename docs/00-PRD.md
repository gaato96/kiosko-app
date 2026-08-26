# 00 · PRD — Kiosko App

## 1. El problema

Un kiosco de barrio administra tres cosas al mismo tiempo, y hoy las tres viven
en la cabeza del dueño o en un cuaderno:

1. **Cobrar rápido** con tres personas esperando en el mostrador.
2. **Saber qué queda** y qué hay que reponer antes de quedarse sin el producto
   que más rota.
3. **Saber quién le debe plata** y cuánto.

Cuando además se vende por peso (fiambrería, panificados), aparece un cuarto
problema que es el más caro de todos: **el cálculo mental**. Cuánto son 250 g de
un jamón que está $18.400 el kilo, con gente esperando, es la operación donde se
regala plata todos los días — siempre para el mismo lado.

Los sistemas existentes fallan por uno de tres motivos:
- Son de escritorio, atados a una PC con Windows (Líder Gestión, GestionGratis).
- Son para gastronomía y traen 200 funciones que un kiosco no usa (Fudo, Maxirest).
- Son contables y no sirven en el mostrador (Xubio, Colppy, Bejerman).

Y todos comparten el mismo agujero: **ninguno resuelve bien la venta por peso, el
control de caja contra el empleado, ni el canal de pedidos por WhatsApp.**

## 2. La propuesta

Una **PWA offline-first** que se instala en una tablet o celular, sin hardware
adicional, que cubre el ciclo completo del kiosco: vender → controlar caja →
reponer → cobrar fiados → vender más.

### Los tres diferenciales sobre los que se construye la propuesta comercial

| # | Diferencial | Por qué gana |
|---|---|---|
| 1 | **Modo Balanza bidireccional** | Gramos → importe *y* importe → gramos, con corrección del peso real. Ningún sistema barato lo resuelve con esta UX. |
| 2 | **Arqueo ciego auditable** | El empleado declara el efectivo sin ver lo esperado, y el registro queda inmutable. Es un control anti-faltante que los sistemas para kiosco no traen. |
| 3 | **Vidriera + pedidos por WhatsApp** | Delivery propio sin pagar 20-30% de comisión a las apps. Convierte al sistema de gasto en generador de ingresos. |

## 3. Usuarios

### Dueño (`rol = dueño`)
Abre y cierra el negocio, compra la mercadería, decide precios, controla al
empleado. Usa el celular más que la tablet. **No es técnico**: si algo requiere
más de dos pasos para entenderse, no lo va a usar.

Necesita: ver cuánto vendió hoy sin abrir un reporte, saber qué reponer sin
recorrer las góndolas, detectar si falta plata en la caja, y saber quién le debe.

### Empleado (`rol = empleado`)
Está en el mostrador. Puede ser alguien de la familia o un empleado nuevo que
arranca hoy. **Tiene que poder usar el POS sin capacitación previa.**

Puede: vender, cobrar, consultar precios, abrir y cerrar su caja, cargar fiado a
un cliente existente.
No puede: ver costos, márgenes, reportes, el efectivo esperado de la caja, ni
modificar precios o límites de crédito.

### Cliente final (sin cuenta)
Escanea un QR en la puerta o recibe un link por WhatsApp. Mira el catálogo con
precios reales, arma un pedido y lo manda. **No se registra, no paga online, no
instala nada.**

## 4. Alcance del MVP

| Módulo | Incluye |
|---|---|
| M1 Auth + RBAC | Login, roles dueño/empleado, PIN rápido de cambio de usuario |
| M2 POS | Grilla táctil, buscador, teclas rápidas, ticket, medios de pago, vuelto, pago mixto, anulación |
| M3 Modo Balanza | Gramos↔importe con confirmación de peso real |
| M4 Inventario | Stock, mínimos, reposición por proveedor, export WhatsApp, compras, ajustes y merma |
| M5 Caja | Apertura, movimientos, arqueo ciego, diferencias |
| M6 Cuentas corrientes | Clientes, límite de crédito, bloqueo, cobros, recordatorio WhatsApp |
| M7 Precios | Actualización masiva por %, historial, alerta de margen negativo |
| — | Catálogo semilla argentino + import CSV + sincronización offline |

## 5. Fuera del alcance del MVP (explícito)

- Facturación electrónica ARCA. *Los campos fiscales existen en la base; la
  integración WSAA/WSFEv1 es un addon posterior.*
- Multi-sucursal (el modelo lo soporta, la UI no se construye en v1).
- Pasarela de pago online en la vidriera. **Los pedidos se cierran por WhatsApp,
  no se cobran online.**
- Integración con balanza, lector de código de barras USB o impresora térmica.
  *El campo `codigo_barras` queda en la base para cuando haga falta.*
- App nativa en las tiendas. Es PWA instalable.
- Contabilidad, libro IVA, sueldos.

## 6. Fase 2 (upsell comercial, post-MVP)

- **M8 Vidriera Digital + bandeja de pedidos + QR imprimible**
- **M9 Reportes y métricas** (rentabilidad, horas pico, productos muertos, gastos)
- **M10 Combos y promos**

## 7. Criterios de éxito

### Producto
- Cobrar una venta de 3 productos en efectivo: **≤ 8 toques, < 15 segundos**.
- Vender 250 g de fiambre desde cero: **≤ 5 toques**.
- El POS abre y vende **con el modo avión activado**.
- Un empleado nuevo cobra su primera venta **sin que nadie le explique nada**.
- Lighthouse: Performance ≥ 90, PWA instalable, First Load JS del POS < 200 kB.

### Negocio
- El kiosco piloto sigue usándolo **a los 30 días** (la métrica que realmente
  importa: la mayoría de estos sistemas se abandonan en la primera semana).
- El dueño arma el pedido a proveedor desde la app en vez de recorrer las góndolas.
- Al menos 1 pedido por semana entra por la Vidriera en el primer mes.

## 8. El riesgo principal, y cómo se mitiga

**La carga inicial del catálogo es lo que mata a estos productos.** Nadie carga
400 productos a mano antes de vender el primero.

Mitigación, en orden:
1. **Catálogo semilla argentino precargado** (~400 productos reales de kiosco con
   marca y presentación: Coca 500 ml, Marlboro Box, Alfajor Jorgito, Pan de mesa,
   Cerveza Quilmes 1 L…). El dueño solo tilda lo que vende y le pone precio.
2. **Alta express desde el POS**: si escribe un producto que no existe, un botón
   lo crea con nombre + precio en el momento, sin salir de la venta.
3. **Import desde CSV/Excel** para quien ya tenga una lista.

## 9. Glosario (para no ambigüedad en el código)

| Término | Significado |
|---|---|
| **Comercio** | El tenant. Un kiosco. |
| **Ticket / Venta** | Una operación de cobro completa, con N items y N pagos. |
| **Fiado / Cuenta corriente** | Venta a crédito de un cliente conocido. |
| **Arqueo** | Conteo del efectivo al cierre de caja. |
| **Arqueo ciego** | Arqueo donde quien cuenta no ve el monto esperado. |
| **Merma** | Pérdida de mercadería (recorte, rotura, vencimiento). |
| **Vuelto** | El cambio que se le devuelve al cliente. |
| **Reposición** | Volver a llenar el stock de productos que ya existen. |
| **Producto gancho** | Bajo margen, alta rotación; trae gente al local. |
| **Vidriera** | El catálogo público al que se accede por QR. |
