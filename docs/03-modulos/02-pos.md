# M2 · POS (Punto de venta)

> El módulo más importante. Todo lo demás se puede usar mal un rato; esto se usa
> 200 veces por día con gente esperando.

## Objetivo

Cobrar rápido. **Meta medible: una venta de 3 productos en efectivo en ≤ 8 toques
y menos de 15 segundos**, sin conexión a internet.

## Layout (tablet horizontal, 1024×768 de referencia)

```
┌──────────────────────────────────────────────┬─────────────────────┐
│ [Buscar producto...]        ● En línea  ⚙ 👤 │  TICKET             │
├──────────────────────────────────────────────┤  ─────────────────  │
│ ⚡ TECLAS RÁPIDAS                             │  Coca 500      $1200│
│ ┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐   │  Marlboro      $3500│
│ │Coca ││Marl ││Pan  ││Alfa ││Cerv ││Agua │   │  Jamón 250g    $4600│
│ └─────┘└─────┘└─────┘└─────┘└─────┘└─────┘   │                     │
├──────────────────────────────────────────────┤  ─────────────────  │
│ [Todas][Bebidas][Cigarrillos][Golosinas][+]  │  TOTAL      $9.300  │
│ ┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐          │                     │
│ │     ││     ││     ││     ││     │          │  ┌───────────────┐  │
│ └─────┘└─────┘└─────┘└─────┘└─────┘          │  │    COBRAR     │  │
│ ┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐          │  └───────────────┘  │
│ │     ││     ││     ││     ││     │          │  [⚖ Balanza] [🗑]   │
└──────────────────────────────────────────────┴─────────────────────┘
```

En celular vertical: el ticket colapsa a una barra inferior con el total y se
expande al tocarla.

## Componentes

### Buscador
- **Siempre enfocado** al abrir el POS. Escribir un carácter ya filtra.
- Busca sobre `nombre_norm` (sin acentos, minúsculas) **y sobre `alias`**. El
  empleado escribe "coca", no "Coca-Cola Sabor Original 500 ml".
- Corre **local sobre Dexie**, nunca sale a la red. Objetivo < 50 ms con 1.000
  productos.
- Enter agrega el primer resultado. Es también el punto de entrada para un lector
  de código de barras futuro (que se comporta como teclado + Enter).
- Si no hay resultados: botón **"Crear «lo que escribió» y agregar"** → nombre +
  precio en un paso y sigue vendiendo. Sin esto, el empleado anota en un papel y
  el sistema empieza a mentir.

### Teclas rápidas
Grilla fija de 8-12 productos configurables por el dueño, siempre visible. Un
toque = al ticket. Son el 60-70% de las ventas de un kiosco: cigarrillos, pan,
gaseosa, alfajor, cerveza, agua.
Si el dueño no las configuró, se autocompletan con los más vendidos de los
últimos 30 días y se lo avisa.

### Grilla de productos
Tarjetas grandes (mínimo 96×96) con color de categoría, emoji o inicial, nombre
en dos líneas y precio en tipografía tabular.
**La foto es opcional siempre**: pedir fotos es la fricción que hace abandonar la
carga del catálogo.
Chips de categoría arriba, scroll horizontal.

### Ticket
Cada línea: descripción, cantidad, total, y `−  cant  +`. Deslizar a la izquierda
elimina. Tocar la línea abre el editor de cantidad o de peso.
Total en grande, tipografía tabular, siempre visible.

## Flujo de cobro

1. **COBRAR** → pantalla de pago a pantalla completa.
2. Total en grande arriba.
3. Botonera de medios de pago, 6 botones grandes:
   `EFECTIVO` · `TRANSFERENCIA` · `DÉBITO` · `CRÉDITO` · `QR` · `FIADO`
4. **Efectivo**: campo "Paga con" + numpad, más botones de billete rápido
   `$2.000 · $5.000 · $10.000 · $20.000 · JUSTO`.
   El **vuelto se calcula en vivo mientras tipea**, en verde, enorme.
   Si "paga con" < total → el botón de confirmar queda deshabilitado y se ofrece
   pago mixto.
5. **Pago mixto**: "Agregar otro medio de pago" divide el total. Se van sumando
   filas hasta cubrirlo. El botón de confirmar solo se habilita cuando
   `sum(pagos) == total`.
6. **Fiado**: selector de cliente con búsqueda. Muestra saldo actual, límite y
   disponible. Si la venta lo supera → bloqueo (ver M6).
7. **Confirmar** → escritura local instantánea, pantalla de éxito con el vuelto en
   grande durante 2 segundos, vuelta al POS con el ticket limpio.

> El vuelto se muestra **después de confirmar también**, porque el empleado lo lee
> mientras cuenta los billetes.

## Reglas de negocio

1. **Se escribe primero en local.** Ninguna acción del cobro espera a la red.
2. **Los precios se congelan en el item.** `precio_unitario_centavos` y
   `costo_unitario_centavos` se copian al ticket. Si mañana cambia el precio, el
   histórico y el margen no se distorsionan.
3. **El redondeo se aplica al total de cada línea calculada por peso**, no al
   total del ticket, usando `config_comercio.redondeo_centavos`.
4. Un producto agregado dos veces **incrementa la cantidad de la línea existente**,
   salvo los de peso, donde cada pesada es su propia línea.
5. **Stock negativo se permite** y se marca en la línea con un ícono. Bloquear una
   venta porque el sistema cree que no hay stock es el peor error posible en un
   mostrador.
6. **Descuentos**: por monto o porcentaje, sobre el total. Requiere PIN del dueño
   si el operador es empleado. Siempre auditado.
7. **Anulación**: solo de ventas del día en curso. Revierte stock y cuenta
   corriente. Exige motivo y PIN del dueño. Las ventas **no se editan ni se
   borran** nunca.
8. Los productos `SERVICIO` (recargas, SUBE) piden el monto al agregarse y no
   descuentan stock.

## Atajos de teclado (para cuando haya teclado o lector)

| Tecla | Acción |
|---|---|
| `/` | Foco en el buscador |
| `Enter` | Agregar el primer resultado |
| `F1`–`F12` | Teclas rápidas 1 a 12 |
| `+` / `-` | Cantidad de la última línea |
| `F9` | Cobrar |
| `Esc` | Cancelar / volver |

## Datos

Escribe en `ventas`, `ventas_items`, `ventas_pagos`, `movimientos_stock`,
`cuenta_corriente_movimientos`. Lee de Dexie: `productos`, `categorias`,
`clientes`, `teclas_rapidas`, `config_comercio`.

### Payload de `sync_venta`

```jsonc
{
  "id": "0192f3a1-...",          // uuid v7 del cliente
  "comercio_id": "...",
  "usuario_id": "...",
  "dispositivo_id": "...",
  "caja_sesion_id": "...",
  "cliente_id": null,
  "creado_en": "2026-08-24T14:32:11-03:00",
  "subtotal_centavos": 930000,
  "descuento_centavos": 0,
  "total_centavos": 930000,
  "items": [
    { "id": "...", "producto_id": "...", "descripcion": "Coca 500 ml",
      "tipo_venta": "UNIDAD", "cantidad": 1,
      "precio_unitario_centavos": 120000, "costo_unitario_centavos": 82000,
      "total_centavos": 120000 },
    { "id": "...", "producto_id": "...", "descripcion": "Jamón cocido",
      "tipo_venta": "PESO", "cantidad": 250,
      "precio_unitario_centavos": 1840000, "costo_unitario_centavos": 1200000,
      "total_centavos": 460000 }
  ],
  "pagos": [
    { "id": "...", "medio": "EFECTIVO", "monto_centavos": 930000,
      "recibido_centavos": 1000000, "vuelto_centavos": 70000 }
  ]
}
```

## Casos borde

| Caso | Comportamiento |
|---|---|
| Producto borrado después de vendido | `ventas_items.producto_id` es `null`, `descripcion` conserva el nombre. El histórico nunca se rompe. |
| Cobra sin caja abierta | Modal bloqueante: "Abrí la caja para empezar a vender", con el botón de apertura ahí mismo. |
| Se cierra la app con un ticket a medias | Se persiste en Dexie y se restaura al volver. Se pregunta "¿Seguís con este ticket?". |
| Paga con menos que el total | El confirmar queda bloqueado; se sugiere pago mixto o fiado. |
| Venta de $0 | Se permite (canje, obsequio) pero exige nota. |
| Pierde la conexión en medio del cobro | Nada cambia: ya escribía en local. Solo cambia la píldora de estado. |

## Criterios de aceptación

- [ ] Venta de 3 productos + efectivo + vuelto en **≤ 8 toques**.
- [ ] La búsqueda responde en **< 50 ms** con 1.000 productos.
- [ ] Con el modo avión activado, se pueden hacer 20 ventas seguidas sin errores.
- [ ] Reenviar 10 veces la misma venta produce **una sola** fila.
- [ ] Pago mixto de efectivo + transferencia queda registrado como dos filas en
      `ventas_pagos` y el arqueo cierra correcto.
- [ ] First Load JS de la ruta del POS **< 200 kB**.
