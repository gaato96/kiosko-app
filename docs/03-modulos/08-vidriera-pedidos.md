# M8 · Vidriera Digital y pedidos por WhatsApp

> El tercer diferencial, y el único módulo que **genera ingresos** en vez de
> ahorrar tiempo. Es el argumento que justifica el abono mensual.

## Objetivo

Que el kiosco tenga su propio canal de pedidos a domicilio, con stock y precios
reales, **sin pagar 20-30% de comisión a las apps de delivery**.

## 1. Cómo funciona

```
QR en la puerta / link en el estado de WhatsApp
        ↓
/t/kiosco-la-esquina   (público, sin login, sin instalar nada)
        ↓
Catálogo por categoría, precios y stock al día
        ↓
Changuito → Checkout (nombre, teléfono, dirección, retiro o envío)
        ↓
[ CONFIRMAR PEDIDO ]
        ↓
1. Se GUARDA el pedido en la base       ← la diferencia con un link wa.me suelto
2. Se abre WhatsApp con el mensaje armado
        ↓
El dueño lo ve en la bandeja "Pedidos" con badge
        ↓
[ Aceptar ] → se convierte en venta y descuenta stock
```

### Por qué se guarda antes de abrir WhatsApp

Un `wa.me` solo depende de que el mensaje llegue y de que el dueño lo encuentre
entre cuarenta chats. No descuenta stock, no deja histórico, no se puede medir y
no se puede reclamar. Guardándolo primero:

- El pedido existe aunque el cliente no llegue a mandar el mensaje.
- Se convierte en venta con un toque, descontando stock.
- Hay métricas reales de cuánto vende el canal.
- El dueño ve un badge, no depende de mirar WhatsApp.

## 2. La vidriera pública

**Ruta**: `/t/[slug]` — Server Component con ISR (`revalidate: 60`).
Datos desde la vista `vidriera_productos`, que no expone costos, márgenes, stock
exacto ni proveedores.

```
┌─────────────────────────────────────┐
│  🏪 Kiosco La Esquina               │
│  Abierto ahora · Envíos en el barrio│
├─────────────────────────────────────┤
│ [Todo][Bebidas][Golosinas][Fiambres]│
├─────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐         │
│  │  🥤      │  │  🍫      │         │
│  │ Coca 500 │  │ Alfajor  │         │
│  │  $1.200  │  │   $1.300 │         │
│  │   [ + ]  │  │   [ + ]  │         │
│  └──────────┘  └──────────┘         │
├─────────────────────────────────────┤
│  🛒 4 productos · $8.400   [ VER ]  │
└─────────────────────────────────────┘
```

- **Mobile-first**: el 95% entra desde el celular.
- Grilla de 2 columnas, tarjetas con foto si hay, emoji o color de categoría si no.
- Sin stock: según `config.mostrar_sin_stock`, se oculta o se muestra en gris con
  "Sin stock" y sin botón.
- **Productos por peso**: se piden en gramos con opciones (100 g / 250 g / 500 g /
  1 kg) y precio estimado, con la aclaración *"el precio final depende del peso
  exacto"*.
- Buscador arriba, sticky.
- Changuito en `localStorage`, sobrevive a recargar la página.
- Banner de "Cerrado ahora — abrimos a las 8:00" según `vidriera_horarios`,
  permitiendo dejar el pedido igual.

**Rendimiento**: es la cara pública del kiosco y se abre en 4G.
Objetivo: LCP < 2 s, sin JS bloqueante, imágenes WebP y lazy.

## 3. Checkout

Un solo paso, la menor cantidad de campos posible:

| Campo | Obligatorio |
|---|---|
| Nombre | Sí |
| Teléfono | Sí |
| Retiro / Envío | Sí |
| Dirección | Solo si es envío |
| Zona de envío | Solo si es envío (define el costo) |
| Notas | No ("sin hielo", "tocar timbre 2B") |
| ☐ Quiero recibir las ofertas del día | No — **consentimiento explícito, sin tildar por defecto** |

Validaciones: monto mínimo por zona, teléfono argentino, changuito no vacío.

## 4. El mensaje de WhatsApp

```
🛒 *PEDIDO* — Kiosco La Esquina

*Cliente:* Gastón Pérez
*Teléfono:* 11 2233-4455
*Entrega:* Envío a Belgrano 1234, timbre 2B

• 2× Coca 500 ml — $2.400
• 1× Alfajor Jorgito — $1.300
• 250 g Jamón cocido — $4.600 (aprox.)

Subtotal: $8.300
Envío: $1.500
*TOTAL: $9.800*

Pedido #142
```

Se codifica con `encodeURIComponent` y se abre en `wa.me/<telefono_comercio>`.
El WhatsApp que recibe es el del **dueño**, configurable.

## 5. Bandeja de pedidos (lado del dueño)

```
┌────────────────────────────────────────┐
│  PEDIDOS                    ● 3 nuevos │
├────────────────────────────────────────┤
│ 🔴 #142  Gastón Pérez    $9.800  14:32 │
│    Envío · Belgrano 1234               │
│    [ Aceptar ]  [ Rechazar ]           │
├────────────────────────────────────────┤
│ 🟡 #141  María López     $4.200  14:10 │
│    Retiro · Preparando                 │
│    [ Marcar entregado ]                │
└────────────────────────────────────────┘
```

Estados: `NUEVO → ACEPTADO → PREPARANDO → ENTREGADO`, más `RECHAZADO`.

- **Realtime de Supabase** para que aparezcan solos, con sonido y badge.
- **Aceptar** ejecuta `convertir_pedido_en_venta`: crea la venta con
  `origen = 'VIDRIERA'`, descuenta stock, la asocia al pedido.
- **Rechazar** pide motivo y ofrece un mensaje de WhatsApp para avisarle al cliente.
- Si un producto quedó sin stock entre el pedido y la aceptación, se avisa antes de
  convertir y se puede quitar la línea.

## 6. QR imprimible

Generador dentro de la app: hoja A4 lista para imprimir con el QR grande, el
nombre del kiosco y un texto configurable ("Escaneá y pedí sin salir de tu casa").
Formatos: A4 para la puerta, y una tira de tarjetas chicas para meter en las
bolsas.

El QR apunta a `https://<dominio>/t/<slug>?src=qr` — el parámetro permite después
medir de dónde vienen los pedidos.

## 7. Seguridad de la ruta pública

- La `anon key` solo puede leer `vidriera_productos` y `categorias` de comercios
  con `vidriera_activa`.
- `INSERT` permitido en `pedidos_vidriera` y `pedidos_items`, nada más.
- **Rate limit**: máximo 5 pedidos por hora por teléfono y 20 por IP.
- **El total se recalcula del lado del servidor** al crear el pedido. Nunca se
  confía en el total que manda el cliente.
- Honeypot anti-bot en el formulario.

## Datos

`pedidos_vidriera`, `pedidos_items`, `zonas_envio`, `config_comercio`,
vista `vidriera_productos`, `ventas` (`origen = 'VIDRIERA'`).

## Casos borde

| Caso | Comportamiento |
|---|---|
| El cliente no manda el mensaje de WhatsApp | El pedido igual está en la bandeja. Ese es el punto. |
| Producto agotado entre el pedido y la aceptación | Aviso al aceptar, con opción de quitar la línea o aceptar igual. |
| Cambia el precio entre el pedido y la aceptación | El pedido congela el precio. Si la diferencia supera un umbral, se avisa. |
| Pedido fuera del horario | Se acepta y queda marcado "fuera de horario". |
| Monto menor al mínimo de la zona | El checkout lo bloquea con un mensaje claro y cuánto falta. |
| Vidriera desactivada | La ruta devuelve 404. |

## Criterios de aceptación

- [ ] La vidriera carga en < 2 s en 4G simulado (Lighthouse mobile).
- [ ] `vidriera_productos` no expone costo, margen, proveedor ni stock exacto.
- [ ] Un pedido creado aparece en la bandeja del dueño **sin recargar**.
- [ ] Aceptar un pedido crea la venta y descuenta el stock exacto.
- [ ] El mensaje de WhatsApp llega bien formateado, con emojis y saltos de línea.
- [ ] El total del pedido se calcula en el servidor, no se toma del cliente.
- [ ] El QR generado abre la vidriera correcta.
