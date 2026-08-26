# 07 · Negocio: precios, propuesta y crecimiento

> Todo lo de este documento es **recomendación basada en el mercado argentino de
> agosto 2026**, no una regla. El número final depende de tu zona, tu relación con
> el cliente y de cuánto soporte estés dispuesto a dar.

## 1. El mercado

| Producto | Modelo | Precio | Observación |
|---|---|---|---|
| [Commercy](https://commercy.com.ar/blog/mejores-software-para-kioscos) | SaaS | desde **USD 29/mes** | POS + stock + ARCA, 0% comisión |
| [Fudo](https://fu.do/es-ar/precios/) | SaaS | **USD 29-300/mes** por sucursal | Gastronomía, no kiosco |
| [Xubio / Colppy](https://ecosystem.rqlsistemas.com.ar/blog/cuanto-cuesta-sistema-gestion-argentina) | SaaS | USD 8-20 por usuario/mes | Contable, no sirve en el mostrador |
| Líder Gestión | Licencia perpetua | Sin precio público | Escritorio Windows, sin abono |
| Tango | Licencia perpetua | ARS 500.000-1.500.000 + 20% anual | Fuera del alcance de un kiosco |
| [GestionGratis](https://www.gestiongratis.com.ar/) | Gratis | $0 | Escritorio, sin nube, sin soporte |

**Lectura**: el techo de lo que un kiosco de barrio paga hoy está alrededor de
**USD 29/mes**, y por ese precio recibe un POS con stock. Nadie en ese segmento
ofrece arqueo ciego, venta por peso bidireccional ni canal de pedidos propio.

**Ahí está el espacio.** No se compite por precio contra GestionGratis; se compite
por las tres funciones que ninguno tiene.

## 2. Precios SaaS recomendados

Cotizar en **equivalente USD, facturado en pesos, con ajuste trimestral** escrito
en el contrato. Con inflación argentina, un precio en pesos fijo se licúa en seis
meses y renegociar cada vez desgasta la relación.

| Plan | USD/mes | Incluye |
|---|:--:|---|
| **Básico** | 12–18 | POS, caja + arqueo ciego, stock, 1 usuario, 1 dispositivo |
| **Pro** ← el que se vende | 25–35 | + fiados, modo balanza, reportes, precios masivos, 3 usuarios |
| **Full** | 45–60 | + Vidriera Digital, pedidos, combos, multi-dispositivo |
| **Setup inicial** | 150–350 (una vez) | Carga de catálogo, configuración, 2 h de capacitación |

### Tres decisiones de pricing y su porqué

**El setup fee no es opcional.** Cumple dos funciones: cubre las horas reales de la
carga inicial (que es donde se va el tiempo) y **filtra al cliente que no lo va a
usar**. Alguien que no pone $200 de entrada tampoco va a cargar el stock.

**El plan Pro es el ancla.** El Básico existe para que el Pro parezca razonable.
La mayoría va a comprar Pro, y el Pro es el que contiene los diferenciales.

**La Vidriera va en el plan más caro** porque es el único módulo que le hace ganar
plata al cliente, no ahorrarle tiempo. Ahorrar tiempo se paga poco; ganar plata se
paga bien. Cuando el kiosco vea que le entran 15 pedidos por semana sin pagar
comisión, el salto de plan se vende solo.

## 3. Pago único

| Modalidad | Precio sugerido |
|---|---|
| Desarrollo a medida (este primer cliente) | **USD 1.200–2.000** |
| Licencia perpetua a clientes posteriores | **USD 700–1.200 + USD 8-12/mes obligatorio** |

### No vendas pago único puro

Supabase, Vercel, el dominio, los backups y el soporte se pagan **todos los meses,
para siempre**. Una licencia perpetua sin abono es una deuda que crece con cada
cliente nuevo: al décimo, estás manteniendo diez instalaciones gratis.

Si el cliente insiste en pago único, el abono de hosting y soporte va igual, aparte
y por escrito. Es un servicio, no una licencia.

## 4. La jugada con este cliente

Este es el primer cliente y también el laboratorio del producto. La propuesta que
maximiza las dos cosas:

> **USD 1.200–1.500 de desarrollo a medida**, con abono bonificado o reducido por
> 12 meses, **a cambio de que quede explícito por escrito que el código, el
> producto y todos sus derechos son tuyos, y que podés licenciarlo a otros
> comercios.**

Por qué conviene a las dos partes:
- **Para el cliente**: paga bastante menos que un desarrollo a medida real y
  arranca su kiosco con un sistema hecho para él.
- **Para vos**: el primer cliente te financia el producto, te da un caso real con
  capturas y testimonios, y te deja el activo.

**Lo que no puede faltar en el acuerdo:**
1. Propiedad intelectual y derecho de reventa, explícitos.
2. Alcance cerrado (las fases 0-8) y precio de las fases 9-11 aparte.
3. Qué incluye el soporte y qué no (horario, tiempo de respuesta).
4. Qué pasa con los datos si deja de pagar (se exportan, no se borran).
5. Que ARCA, multi-sucursal y las integraciones no están incluidas.

## 5. Unit economics

| Comercios | Ingreso mensual (Pro USD 30) | Costo infra | Margen |
|:--:|---|---|---|
| 1 | USD 30 | USD 0 | ~100% |
| 5 | USD 150 | USD 0 | ~100% |
| 10 | USD 300 | USD 45 | 85% |
| 25 | USD 750 | USD 45 | 94% |
| 50 | USD 1.500 | USD 80 | 95% |

**El costo marginal por comercio es casi cero.** El costo real no es la
infraestructura: es el **soporte**. A partir del comercio 15-20, el cuello de
botella sos vos atendiendo WhatsApps.

Por eso, desde el principio:
- Documentación y videos cortos dentro de la app.
- Onboarding autoservicio (catálogo semilla, import, tour guiado).
- Soporte por un canal, con horario definido, no por WhatsApp personal a toda hora.

## 6. Cómo conseguir los primeros 10 clientes

1. **El piloto como demostración.** Un kiosco funcionando con capturas reales vale
   más que cualquier landing.
2. **Los proveedores como canal.** El distribuidor que recorre 40 kioscos por
   semana es el mejor comercial posible. Comisión de referido o un mes gratis.
3. **Zona primero.** Diez kioscos del mismo barrio: el soporte se hace caminando y
   el boca a boca es inmediato.
4. **La Vidriera como caballo de Troya.** Ofrecer solo la vidriera gratis por 30
   días; el kiosco que empieza a recibir pedidos quiere el resto.
5. **Grupos de kiosqueros.** Facebook y WhatsApp tienen comunidades activas de
   maxikiosqueros. Aportar antes de vender.

## 7. Funciones que le hacen ganar plata al kiosco

Ordenadas por impacto real sobre la facturación de un kiosco nuevo:

### 1. Delivery propio (Vidriera + WhatsApp)
PedidosYa y Rappi se llevan 20-30%. Con el QR en la puerta, en las bolsas y en el
estado de WhatsApp, el kiosco arma su canal a costo cero. **El que más plata mueve
de toda la lista.**

### 2. Combos armados con nombre
"Combo Previa" (2 cervezas + papas + hielo), "Combo Mate", "Combo Merienda".
Sube el ticket promedio sin bajar precios, y hace que el cliente compre cuatro
cosas en vez de una. Un combo bien armado deja más margen que los cuatro productos
sueltos.

### 3. Fiado administrado
En barrio, el fiado con control es lealtad pura. Sin control, es cómo se funde un
kiosco nuevo. El módulo convierte un riesgo en una ventaja competitiva.

### 4. Servicios que traen gente
Recargas, SUBE, cobro de servicios. Margen chico, pero **meten gente al local que
después compra una gaseosa**. El módulo de servicios mide bien la comisión, así
que se puede decidir con datos si conviene.

### 5. Cross-sell en el POS
Al agregar cerveza, sugerir hielo y snacks. Una sugerencia contextual configurable
por producto, no intrusiva, en el momento exacto en que el cliente todavía está
decidiendo.

### 6. Análisis de horas pico
¿A qué hora abro? ¿Cuándo necesito una segunda persona? ¿Sirve abrir el domingo?
Un kiosco nuevo lo adivina durante meses y pierde plata en las dos direcciones.

### 7. Detección de productos muertos
Lo que no rota es capital inmovilizado. Liquidarlo y comprar lo que sí rota es
plata inmediata, sin vender una unidad más.

### 8. Lista de difusión de WhatsApp
Con el consentimiento explícito del checkout de la Vidriera, se junta una base de
teléfonos para la oferta del día. Costo cero, conversión alta.

### 9. Productos gancho bien ubicados
Cigarrillos, pan y gaseosa tienen margen bajo pero traen gente. El reporte de
rentabilidad muestra cuáles son, para poner al lado los de margen alto.

## 8. Roadmap comercial post-MVP

| Addon | Precio sugerido | Complejidad |
|---|---|---|
| **Facturación ARCA** (Factura C monotributo) | +USD 10-15/mes o USD 250 una vez | Alta — WSAA, certificados, `CondicionIVAReceptorId` obligatorio desde 09/2026 |
| Multi-sucursal | +USD 15/mes por sucursal | Media |
| Fidelización por puntos | +USD 5/mes | Baja |
| Lector de código de barras (cámara o USB) | Incluido | Baja |
| Integración Mercado Pago QR | +USD 8/mes | Media |
| Marca blanca para distribuidores | A convenir | Media |
