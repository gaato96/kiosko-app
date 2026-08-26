# M4 · Inventario, reposición y compras

## Objetivo

Que el dueño sepa qué reponer **sin recorrer las góndolas**, arme el pedido a cada
proveedor desde el celular, y actualice el stock al recibir la mercadería sin
volver a cargar producto por producto.

## Principio de base

**El stock es un libro mayor**, no un número (ver [02-MODELO-DATOS](../02-MODELO-DATOS.md)).
Toda variación inserta una fila en `movimientos_stock` con un motivo.
`productos.stock_actual` es un agregado cacheado.

## 1. Vista "Para reponer"

Filtra `productos_a_reponer` (`stock_actual <= stock_minimo`) y la **agrupa por
proveedor**.

> Mejora sobre el planteo original: una lista única no sirve. El pedido se le manda
> a Distribuidora Sur, a la panadería y al de golosinas por separado. Agrupar por
> proveedor convierte la lista en N mensajes listos para enviar.

```
┌───────────────────────────────────────────────┐
│  PARA REPONER                    23 productos │
├───────────────────────────────────────────────┤
│ ▸ Distribuidora Sur (8)      [📱 Enviar]      │
│   ☑ Coca 500 ml       tenés 3  · mín 24       │
│   ☑ Sprite 500 ml     tenés 0  · mín 12       │
│   ☐ Agua sin gas      tenés 8  · mín 12       │
├───────────────────────────────────────────────┤
│ ▸ Panadería Don José (2)     [📱 Enviar]      │
│ ▸ Sin proveedor (13)         [📱 Enviar]      │
└───────────────────────────────────────────────┘
```

Cada fila muestra stock actual, mínimo, faltante y **sugerencia de compra**.

### Sugerencia inteligente (Fase 2)
En vez de sugerir solo `mínimo − actual`, calcula sobre la venta real:

```
promedio_diario = ventas de los últimos 14 días / 14
sugerido = ceil((promedio_diario × dias_cobertura) - stock_actual)
redondeado hacia arriba al múltiplo de factor_compra
```

Con `dias_cobertura` según la frecuencia del proveedor (`dias_visita`).
Un producto que vende 8 por día y el proveedor viene cada 7 días necesita 56, no
"el mínimo". Esta es la diferencia entre no quedarse sin stock y no inmovilizar
capital.

## 2. Exportar a WhatsApp

Botón por proveedor. Genera texto plano, sin markdown (WhatsApp no lo renderiza
bien) y abre `wa.me/<telefono>?text=<encoded>`:

```
Hola! Te paso el pedido de Kiosco La Esquina:

• Coca 500 ml — 2 packs x6
• Sprite 500 ml — 1 pack x6
• Agua sin gas — 1 pack x12

Gracias!
```

Las cantidades se expresan en **unidades de compra** (`unidad_compra`), no en
unidades de venta. Al proveedor se le piden cajas, no unidades sueltas.
Si el proveedor no tiene teléfono cargado, el botón copia al portapapeles.

## 3. Reposición rápida (el flujo de "ya compré")

Después de comprar, el dueño **no vuelve a cargar productos**: abre la misma
lista, tilda lo que trajo y pone la cantidad.

```
┌──────────────────────────────────────────────┐
│  RECIBIR MERCADERÍA — Distribuidora Sur      │
├──────────────────────────────────────────────┤
│ ☑ Coca 500 ml      [ 2 ] packs x6   = 12 u   │
│ ☑ Sprite 500 ml    [ 1 ] pack x6    =  6 u   │
│ ☐ Agua sin gas     [ 0 ]                     │
├──────────────────────────────────────────────┤
│ Costo total (opcional):  [ $ 148.500 ]       │
│              [ CONFIRMAR INGRESO ]           │
└──────────────────────────────────────────────┘
```

Al confirmar (`aplicar_compra`), en una sola transacción:
1. Crea `compras` + `compras_items`.
2. Inserta `movimientos_stock` con `delta = cantidad_compra × factor_compra` y
   motivo `COMPRA`.
3. Si se cargó el costo, actualiza `precio_costo_centavos` y deja historial.
4. Si el costo subió y el margen quedó por debajo del configurado, **avisa y
   propone el precio de venta nuevo**. No lo cambia solo: el dueño decide.

### Producto nuevo dentro de la compra
Botón "+ Agregar producto que no está en la lista": abre alta rápida (nombre,
categoría, costo, precio, cantidad) sin salir del flujo.

## 4. Ajustes y merma

Pantalla propia, porque es lo que mantiene honesto al sistema.

| Motivo | Uso típico |
|---|---|
| `MERMA` | Recorte de fiambre, punta que se secó |
| `ROTURA` | Botella que se cayó |
| `VENCIMIENTO` | Lácteos vencidos |
| `CONSUMO_INTERNO` | El café que se tomó el empleado |
| `AJUSTE` | Conteo físico que no coincide |
| `CARGA_INICIAL` | Stock al arrancar con el sistema |

Cada ajuste: producto, delta, motivo, nota opcional, usuario. Siempre auditado.
El de peso se ingresa en gramos.

**Conteo físico**: modo lista donde se recorre una categoría y se tipea el stock
real; el sistema calcula los deltas y los inserta como un solo lote de `AJUSTE`.

## 5. Vencimientos

Productos con `vence = true` y `fecha_vencimiento`. Vista "Por vencer" con los
que caen dentro de `dias_alerta_vencimiento` (default 7).
Acción sugerida: aplicar precio de liquidación y ponerlo en las teclas rápidas.

## 6. Alta de productos

Tres caminos, por orden de fricción:

1. **Catálogo semilla** (el recomendado): buscar en `catalogo_base`, tildar lo que
   se vende, poner precio. 400 productos argentinos reales con marca y
   presentación. Es lo que evita el abandono en el día 2.
2. **Import CSV/Excel**: columnas `nombre, categoria, precio, costo, stock,
   stock_minimo, codigo_barras`. Vista previa antes de aplicar, con detección de
   duplicados.
3. **Alta manual** o **alta express desde el POS** (nombre + precio, se completa
   después).

## Datos

`productos`, `movimientos_stock`, `compras`, `compras_items`, `proveedores`,
`precios_historial`, vista `productos_a_reponer`, tabla global `catalogo_base`.

## Casos borde

| Caso | Comportamiento |
|---|---|
| Producto sin proveedor asignado | Cae en el grupo "Sin proveedor", que también se puede exportar. |
| `factor_compra` mal cargado | La previsualización muestra "1 caja = 24 unidades" antes de confirmar. El error se ve antes de aplicarse. |
| Se recibe menos de lo pedido | Se ingresa lo recibido, no lo pedido. La lista no es un compromiso. |
| Compra cargada dos veces | El resumen previo muestra el impacto en stock; además queda registrada como dos `compras` reversibles. |
| Stock negativo | Se muestra en rojo con un CTA directo a "Ajustar stock". |
| Producto de peso en la lista de reposición | Faltante y sugerencia se expresan en kg, aunque internamente sean gramos. |

## Criterios de aceptación

- [ ] Un producto con `factor_compra = 24`: comprar 2 sube el stock en 48.
- [ ] Un producto de peso con `factor_compra = 4000`: comprar 1 horma sube 4000 g.
- [ ] La lista de reposición se agrupa por proveedor y genera un mensaje por grupo.
- [ ] Recibir 5 productos de un proveedor toma **≤ 10 toques** desde la lista.
- [ ] Un ajuste por merma queda con motivo y usuario en `movimientos_stock`.
- [ ] Sumar todos los `delta` de un producto da exactamente su `stock_actual`.
