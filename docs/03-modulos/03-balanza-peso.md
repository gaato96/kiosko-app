# M3 · Modo Balanza (venta por peso)

> Uno de los tres diferenciales del producto. La balanza **pesa**; el sistema
> **calcula**. No hay integración por cable: el operador lee el visor y tipea.

## Objetivo

Eliminar el cálculo mental en el mostrador de fiambrería. Es la operación donde
se regala plata todos los días, y siempre para el mismo lado.

## Los dos modos

### Modo A — Gramos → Importe (el habitual)
El cliente pide "250 de jamón". Se pesa, se tipea el peso real, sale el precio.

```
┌────────────────────────────────────┐
│  Jamón cocido        $18.400 /kg   │
├────────────────────────────────────┤
│                                    │
│            2 5 0  g                │
│                                    │
│            $ 4.600                 │
│                                    │
├────────────────────────────────────┤
│   [1] [2] [3]    [100g] [250g]     │
│   [4] [5] [6]    [500g] [1 kg]     │
│   [7] [8] [9]                      │
│   [C] [0] [←]    [ AGREGAR ]       │
└────────────────────────────────────┘
```

### Modo B — Importe → Gramos (el que falta en todos lados)
El cliente pide "$2.000 de queso". El sistema dice cuánto pesar; el operador va a
la balanza, y **corrige con el peso real**.

```
Paso 1                          Paso 2 (confirmación)
┌──────────────────────────┐    ┌──────────────────────────┐
│ Queso cremoso $13.500/kg │    │ Pesaste:                 │
│                          │    │                          │
│      $ 2.000             │ →  │      1 5 2  g            │
│                          │    │                          │
│   Pesá aprox.  148 g     │    │   Precio real  $2.100    │
│                          │    │                          │
│      [ PESAR ]           │    │      [ AGREGAR ]         │
└──────────────────────────┘    └──────────────────────────┘
```

> **El paso 2 es la clave del módulo.** Sin él, el sistema cobra $2.000 por 152 g
> que en realidad valen $2.052, y esa diferencia, veinte veces por día, es plata
> que se va. Sale precargado con el peso sugerido, así que si el corte salió
> exacto, es un solo toque.

## Cálculos (`lib/peso.ts`)

```ts
// gramos -> centavos, con redondeo de configuración
export function importeDesdeGramos(
  gramos: number,
  precioPorKgCentavos: number,
  redondeoCentavos: number
): number {
  const bruto = Math.round((gramos * precioPorKgCentavos) / 1000);
  return redondear(bruto, redondeoCentavos);
}

// centavos -> gramos sugeridos (SIN redondear: es una sugerencia para la balanza)
export function gramosDesdeImporte(
  importeCentavos: number,
  precioPorKgCentavos: number
): number {
  return Math.round((importeCentavos * 1000) / precioPorKgCentavos);
}
```

**Todo en enteros.** `Math.round` una sola vez, al final. El redondeo de
presentación (`$100`) se aplica solo al importe, nunca al peso.

### Ejemplo verificable
Jamón a $18.400/kg = `1840000` centavos/kg.
- 250 g → `250 × 1840000 / 1000 = 460000` → **$4.600** exactos.
- 237 g → `237 × 1840000 / 1000 = 436080` → redondeo a $100 → `440000` → **$4.400**.
- $2.000 (`200000`) → `200000 × 1000 / 1840000 = 109` → **pesá ~109 g**.

## Reglas de negocio

1. Solo aplica a productos con `tipo_venta = 'PESO'`.
2. El stock se descuenta **en gramos exactos pesados**, no en los sugeridos.
3. Cada pesada es **una línea propia** del ticket, aunque sea el mismo producto:
   250 g de jamón y 180 g de jamón son dos cortes distintos y así se leen.
4. `precio_unitario_centavos` del item guarda **el precio por kilo** al momento de
   la venta, y `cantidad` los gramos. Así el histórico se puede reconstruir.
5. El redondeo sale de `config_comercio.redondeo_centavos`. Nunca hardcodeado.
6. Botones de peso frecuente configurables por producto (100 g / 250 g / 500 g /
   1 kg por defecto).
7. Si el peso ingresado supera el stock disponible, se avisa pero **no se bloquea**
   (el stock teórico de fiambrería siempre está algo desfasado).

## Acceso

Tres caminos, todos de un toque:
- Tocar un producto de peso en la grilla → abre el modo balanza directo.
- Botón **⚖ Balanza** del POS → elige el producto y después pesa.
- Teclas rápidas de fiambrería, si el dueño las configuró.

## Diseño

- Ocupa **toda la pantalla**. No es un modal chico: se usa con una mano y la otra
  sosteniendo el producto.
- Numpad de teclas de **mínimo 72×72 px**.
- El resultado ($ o g) en el tamaño más grande de la pantalla, tipografía tabular.
- Un solo toque para cambiar de modo: pestañas `GRAMOS` / `IMPORTE` arriba.
- El precio por kilo siempre a la vista, para que el operador pueda cantarlo.
- Feedback háptico al agregar.

## Casos borde

| Caso | Comportamiento |
|---|---|
| Producto de peso sin `precio_por_kg` | El constraint de base lo impide. Si aparece, se muestra "Falta cargar el precio por kilo" con acceso directo a editarlo. |
| Peso 0 o negativo | Botón de agregar deshabilitado. |
| Peso > 10 kg | Confirmación extra: "¿10,5 kg? Confirmá". Evita el cero de más. |
| Importe menor al precio de 1 g | Sugerencia mínima de 1 g y aviso. |
| Cambia el precio por kilo con el modo abierto | Se recalcula y se avisa con un toast. |
| El operador ignora el paso 2 | No puede: el botón AGREGAR está en el paso 2. El peso sugerido viene precargado, así que aceptar es un toque. |

## Criterios de aceptación

- [ ] Vender 250 g de un producto a $18.400/kg da exactamente $4.600.
- [ ] El `stock_g` baja exactamente 250.
- [ ] Ingresar $2.000 de un producto a $13.500/kg sugiere 148 g.
- [ ] Corregir a 152 g en el paso 2 recalcula el precio antes de agregar.
- [ ] Desde la grilla del POS, vender un fiambre toma **≤ 5 toques**.
- [ ] Ningún cálculo usa punto flotante para dinero.
