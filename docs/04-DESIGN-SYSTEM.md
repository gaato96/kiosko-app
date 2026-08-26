# 04 · Design System

## Contexto de uso (esto define todo lo demás)

El POS se usa **parado, con una mano, con luz de mediodía, con gente esperando y
a veces con las manos húmedas de manipular fiambre**. No es una app de escritorio
ni un dashboard. Cada decisión de diseño se juzga contra ese escenario.

La Vidriera se usa desde un celular ajeno, en 4G, por alguien que nunca vio la
marca. Se juzga contra otro escenario distinto y merece otro tratamiento visual.

## 1. Principios

1. **Un toque, una acción.** Nada de modales anidados en el flujo de cobro.
2. **El objetivo es grande.** Mínimo 64×64 px en el POS, 72×72 en el numpad.
3. **El número manda.** Precios y totales son el elemento visual dominante.
4. **Feedback inmediato**: visual + háptico + sonido corto. En un mostrador
   ruidoso, lo visual solo no alcanza.
5. **Nada decorativo, todo jerárquico.** Un gradiente, una sombra o una animación
   solo existen si comunican algo: qué es tocable, qué está elevado, qué acaba de
   cambiar. La elevación se construye con **superficie + borde + sombra** juntos,
   nunca con sombra sola — en tema oscuro la sombra no se ve.
6. **Estados vacíos que enseñan.** "Todavía no cargaste productos [Empezá con el
   catálogo]", nunca una pantalla en blanco.

## 2. Color

**Claro siempre. No hay tema oscuro y es a propósito**: el mostrador se usa con
luz de mediodía entrando por la vidriera, y ahí una pantalla oscura es un
espejo. El admin lo abre la misma persona, en el mismo local, muchas veces en la
misma tablet — dos temas serían dos superficies distintas para el mismo par de
ojos en el mismo día.

Toda la interfaz sale de dos materiales:

| Material | Qué es | Dónde |
|---|---|---|
| **La repisa** | superficies blancas sobre un lienzo azul-gris frío | todo lo funcional |
| **El papel** | papel tibio, monoespaciada, borde dentado | solo el ticket |

El papel es el único elemento con textura propia en toda la app. Es la firma
del diseño y no se replica en ningún otro lado: si el ticket se parece al papel
que va a salir de la impresora, el operador no tiene que aprender a leerlo.

### Un solo acento

El verde es plata y nada más: cobrar, confirmar un pago, saldo a favor. Si algo
es verde, es dinero. Esa asociación es lo que permite cobrar sin leer el botón.

**La navegación y el foco usan tinta, no color.** Un ítem de menú seleccionado
no puede competir visualmente con el botón de cobrar.

```css
:root {
  /* La repisa */
  --lienzo: #e9edf3;  --superficie: #ffffff;  --superficie-alt: #f3f5f9;
  --superficie-hundida: #e4e8f0;
  --borde: #dbe1ea;  --borde-fuerte: #bcc5d4;

  /* Tinta */
  --tinta: #131a26;  --texto-muted: #566175;  --texto-sutil: #616a79;

  /* El acento */
  --plata: #0e7c5a;  --plata-viva: #12946b;  --plata-honda: #0a5e44;
  --plata-tenue: #e2f2eb;

  /* El papel */
  --papel: #fcfbf7;  --papel-linea: #ded8c9;  --papel-tinta: #2b2822;

  /* Estados: informan, no invitan. No son acentos. */
  --alerta: #a35c07;  --peligro: #bf3026;  --dato: #11648f;
}
```

Cada estado tiene su par `-tenue` para fondos de píldora y de aviso. Un aviso
nunca es texto de color suelto: es texto sobre su fondo tenue con su borde.

### Colores de categoría
Paleta de tonos distinguibles entre sí, asignados a las categorías. Tiñen la
plaqueta y la ilustración de cada producto (§3b). **Nunca se usa solo el color
para comunicar estado**: siempre va acompañado de ícono o texto.

Contraste mínimo **WCAG AA (4.5:1)** en todo texto, incluidos los rótulos de
11 px, medido contra el lienzo y contra la superficie blanca.

### Elevación

| Token | Uso |
|---|---|
| `--sombra-1` | Tarjetas en reposo, inputs, botones secundarios |
| `--sombra-2` | Botones primarios, tarjeta con hover, el ticket |
| `--sombra-3` | Modales (`<Hoja>`), comprobante de venta cerrada |

Las sombras están teñidas al azul del lienzo. Nunca negro puro.

## 3. Tipografía

Tres familias, un trabajo cada una. Ninguna hace de comodín.

| Familia | Variable | Para qué |
|---|---|---|
| **Bricolage Grotesque** | `--font-display` | Titulares y **números**. Tiene la energía de un cartel pintado a mano; las cifras se leen a un metro parado frente a la caja. |
| **Public Sans** | `--font-sans` | Texto corrido. Callada, sin personalidad propia — que es exactamente lo que se le pide. |
| **JetBrains Mono** | `--font-mono` | El recibo. Las columnas de importes alinean solas sin anchos fijos que se rompan con un total de seis cifras. |

| Uso | Clase | Tamaño |
|---|---|---|
| Total del ticket | `.num` | 42 px, peso 800 |
| Vuelto en el comprobante | `.num` | 60 px, peso 800 |
| Renglón del recibo | `.num-recibo` | 13-15 px |
| Nombre de producto en grilla | — | 13 px, 2 líneas máx. |
| Rótulo de sección | `.rotulo` | 11 px, versalitas, `0.07em` |

**Regla dura**: todo número que pueda cambiar usa `.num` (display + tabular) o
`.num-recibo` (mono + tabular) dentro del papel. Sin `tabular-nums` los dígitos
bailan al actualizarse y el ojo no puede leerlos rápido.

Los renglones del recibo usan `.guia`, que dibuja los puntos entre el concepto y
el importe igual que un ticket impreso.

## 3b. Imagen de producto

Cada producto muestra, en este orden:

1. **Su foto** (`productos.imagen_url`), si la tiene. En producción la saca el
   dueño con el celular y va a Supabase Storage.
2. **La ilustración de su arquetipo**, si no.

Las fotos se muestran con `object-cover` en una plaqueta de proporción fija. No
es un detalle: las fotos de catálogo vienen con fondos, encuadres y relaciones
de aspecto distintos, y recortarlas todas igual es lo único que hace que la
grilla se vea pareja sin editar imagen por imagen.

Para la demo, `scripts/fotos-demo.mjs` baja fotos reales de
[Open Food Facts](https://world.openfoodfacts.org) (CC BY-SA) al repo. Se bajan
en vez de enlazarse porque la app es offline-first: una foto que necesita
internet no sirve en un mostrador sin señal.

**El script valida cada match y no confía en la búsqueda.** Buscar "alfajor
jorgito" devuelve galletitas Jorgito, y "yerba playadito" devuelve una lata de
bebida energizante: la marca coincide, el producto no. Por eso cada entrada
lleva `requiere` y `excluye`, y prefiere dejar el producto sin foto antes que
ponerle la equivocada. Cuando ni así alcanza, se fija el código de barras.

### La ilustración de respaldo

Un dibujo **por arquetipo**, no por producto. "Coca-Cola 1,5 L" y "Sprite 1,5 L"
comparten la silueta de botella; lo que las distingue es el color de categoría y
el nombre. Eso alcanza para reconocer sin leer, que es todo lo que se le pide a
la grilla del POS.

**Por qué no fotos**: pedirle al dueño que fotografíe 260 productos es la
fricción que hace abandonar la carga del catálogo (regla del proyecto). Pero sin
nada visual, una grilla de 22 rectángulos de texto se lee de a un ítem por vez.

Implementación:

- `public/prod/productos.svg` — un sprite con ~55 símbolos de 64×64.
- Cada dibujo usa **solo `currentColor`** con opacidades escalonadas
  (1 / .5 / .28 / .14), así toma el color de su categoría sin versionarse.
- `lib/ilustraciones.ts` — reglas de palabra clave sobre el nombre del producto,
  con respaldo por categoría y, en último caso, `p-generico`. Cubierto por tests.
- `<Ilustracion>` referencia el sprite con `<use href="...#simbolo">`: una sola
  petición, cacheada por el service worker, **cero peso en el bundle de JS**.

Agregar un arquetipo nuevo es agregar un `<symbol>` y una regla. No requiere
tocar ningún componente.

## 4. Espaciado y layout

Escala de 4: `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64`.

| Breakpoint | Uso |
|---|---|
| < 640 px | Celular vertical — POS compacto, ticket en barra inferior |
| 640-1023 px | Tablet vertical |
| ≥ 1024 px | **Tablet horizontal — el layout de referencia del POS** |

Separación mínima entre botones táctiles: **8 px**. Un toque errado en el
mostrador cuesta más que en cualquier otra app.

## 5. Componentes clave

### `<ProductoCard>`
96×96 mínimo. Color de categoría de fondo, emoji o inicial grande, nombre en dos
líneas, precio abajo con `tabular-nums`. Estado sin stock: opacidad 50% + badge.
La imagen es opcional: si no hay, el color y el emoji cumplen la misma función de
reconocimiento rápido.

### `<Numpad>`
Teclas de 72×72. Dígitos, `C`, `←`. Variantes con atajos contextuales
(billetes en el cobro, pesos frecuentes en la balanza).

### `<TicketLine>`
Descripción, cantidad con `− n +`, total alineado a la derecha.
Swipe a la izquierda para eliminar, tap para editar.

### `<MontoGrande>`
El componente de un solo número enorme. Se usa para el total, el vuelto y el
resultado de la balanza. Recibe `variant: 'neutral' | 'exito' | 'peligro'`.

### `<EstadoSync>`
La píldora de estado. Tres estados, siempre visible en el POS:
`● En línea` · `◐ Sincronizando (n)` · `○ Sin conexión — n ventas guardadas`.

### `<BotonAccion>`
Alto mínimo 56 px, 64 px en las acciones primarias (COBRAR, AGREGAR, CONFIRMAR).
Nunca un botón primario de menos de 56 px de alto en el POS.

## 6. Movimiento

Mínimo y funcional.

| Interacción | Duración |
|---|---|
| Agregar al ticket | 150 ms slide-in + haptic ligero |
| Cambio de pantalla | 200 ms fade |
| Confirmación de venta | 300 ms scale-in del check |
| Toast | 2.500 ms, esquina inferior |

Respetar `prefers-reduced-motion`. **Nada de animaciones en la lista de productos**:
retrasan la lectura.

## 7. Sonido

Tres sonidos cortos, desactivables:
- **Agregar producto**: click de 40 ms.
- **Venta confirmada**: dos tonos ascendentes.
- **Error / bloqueo**: tono grave único.

Más un cuarto para la bandeja de pedidos (campanilla), separado del resto.

## 8. Iconografía

`lucide-react`, stroke 2, tamaño 20 o 24. Los emojis se usan solo como
identificador de categoría/producto, nunca en lugar de un ícono de interfaz.

## 9. Copy — español rioplatense

| Usar | No usar |
|---|---|
| Vuelto | Cambio |
| Fiado / Cuenta corriente | Crédito, financiación |
| Arqueo | Corte de caja |
| Mercadería | Artículos, mercancía |
| Changuito (Vidriera) | Carrito de compras |
| Plata | Dinero |
| Sacá / Cargá / Poné | Extraiga / Cargue / Ingrese |

Voseo en toda la interfaz. Mensajes cortos, directos, sin signos de exclamación
de más. Los errores dicen **qué hacer**, no qué falló:

- ❌ "Error: stock insuficiente"
- ✅ "No queda stock cargado. Podés vender igual y ajustar después."

## 10. Accesibilidad

- Contraste AA mínimo en todo, AAA en los números grandes del POS.
- Todo control operable con teclado (útil también para el lector de barras futuro).
- `aria-live` en el total del ticket y en el vuelto.
- Nunca color como único portador de información.
- Zonas táctiles de 64 px aunque el ícono sea de 24.

## 11. Vidriera — tratamiento propio

La Vidriera **no usa el tema del POS**. Es la cara pública del kiosco y tiene que
verse como un comercio, no como un sistema de gestión:

- Sigue el tema claro/oscuro del dispositivo del visitante.
- Color de acento configurable por comercio (default `--primary`).
- Header con logo, nombre y estado de apertura.
- Tarjetas más grandes, con más aire y más protagonismo de la foto.
- Tipografía un punto más grande: la lee alguien de cualquier edad, apurado, en la
  calle.
