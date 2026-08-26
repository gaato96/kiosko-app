# M7 · Precios e inflación

> Este módulo no estaba en el planteo original y en Argentina es, junto al POS, el
> que más se va a usar. Un kiosco que tarda dos horas en reprecificar pierde plata
> en silencio todas las semanas.

## Objetivo

Que actualizar 80 precios sea una operación de 30 segundos, con vista previa,
redondeo automático y posibilidad de volver atrás.

## 1. Actualización masiva

```
┌──────────────────────────────────────────────┐
│  ACTUALIZAR PRECIOS                          │
├──────────────────────────────────────────────┤
│  Aplicar a:                                  │
│   ( ) Todos los productos                    │
│   (•) Categoría:  [ Golosinas       ▾ ]      │
│   ( ) Proveedor:  [                 ▾ ]      │
│   ( ) Selección manual (12 elegidos)         │
│                                              │
│  Aumentar   [ + 8 ] %                        │
│  Redondear a  ( )$1 ( )$10 (•)$50 ( )$100    │
│  ☑ Actualizar también el precio de costo     │
├──────────────────────────────────────────────┤
│  VISTA PREVIA — 47 productos                 │
│  Alfajor Jorgito     $1.200  →  $1.300       │
│  Chupetín Pico Dulce   $450  →    $500       │
│  Rocklets            $2.100  →  $2.250       │
│  ...                                         │
│                                              │
│  [ Cancelar ]        [ APLICAR A 47 ]        │
└──────────────────────────────────────────────┘
```

### Reglas
1. **Siempre hay vista previa.** Nunca se aplica un cambio masivo a ciegas.
2. Se puede destildar producto por producto dentro de la vista previa.
3. Todo se hace en una transacción (`actualizar_precios_masivo`) y cada producto
   genera una fila en `precios_historial` con `motivo = 'masivo'`.
4. Los productos de peso se actualizan sobre `precio_por_kg_centavos`.
5. Porcentajes negativos = liquidación. Mismo flujo.
6. **Deshacer**: la operación queda agrupada por un `lote_id`; el botón "Deshacer"
   revierte al precio anterior de cada producto. Disponible 24 horas.

## 2. Alerta de margen

`margen % = (precio_venta − precio_costo) / precio_costo × 100`

| Estado | Condición | Señal |
|---|---|---|
| Pérdida | `precio_venta <= precio_costo` | 🔴 Fila roja, badge "vendés a pérdida" |
| Margen bajo | Menor al margen objetivo del comercio | 🟡 Ámbar |
| OK | Igual o mayor | Sin señal |

El disparo típico: se carga una compra, sube el costo, y el precio de venta queda
viejo. **Al terminar de cargar una compra, el sistema muestra directamente la
lista de los productos que quedaron con margen bajo y propone los precios
nuevos.** El dueño acepta con un toque o los edita. No los cambia solo.

Panel del dueño: badge permanente "5 productos con margen bajo".

## 3. Precio sugerido por margen objetivo

`config_comercio.margen_objetivo_pct` (default 35%).

```
precio_sugerido = redondear(costo × (1 + margen_objetivo/100), redondeo)
```

Se ofrece al crear un producto y al recibir mercadería con costo nuevo.
Siempre como sugerencia editable.

## 4. Historial de precios

Por producto: gráfico simple de precio y costo en el tiempo, con la variación
porcentual acumulada.

Sirve para la conversación real: *"este proveedor me aumentó 40% en tres meses,
al otro le compro más barato"*. Es información que hoy nadie tiene.

Vista agregada (Fase 2): **"Cuánto me aumentaron"** por proveedor en los últimos
30/60/90 días.

## 5. Redondeo

Helper único, `lib/money.ts`:

```ts
export function redondear(centavos: number, unidadCentavos: number): number {
  if (unidadCentavos <= 1) return centavos;
  return Math.round(centavos / unidadCentavos) * unidadCentavos;
}
```

Se usa en: cálculo por peso, precios sugeridos, actualización masiva y vuelto.
**Nunca duplicar esta lógica en otro archivo.**

## Datos

`productos` (`precio_venta_centavos`, `precio_por_kg_centavos`,
`precio_costo_centavos`), `precios_historial`, `config_comercio`
(`redondeo_centavos`, `margen_objetivo_pct`), `auditoria`.

## Casos borde

| Caso | Comportamiento |
|---|---|
| Producto sin costo cargado | Se actualiza el precio igual; no se puede calcular margen y se marca como "sin costo". |
| Aumento que da menos de $1 | Se aplica el redondeo mínimo hacia arriba. |
| Cambio de precio con ventas offline sin sincronizar | Sin conflicto: los items ya congelaron su precio. |
| Deshacer después de que hubo ventas al precio nuevo | Se permite; las ventas ya hechas conservan su precio. Se avisa. |
| Dos usuarios actualizando a la vez | La transacción del RPC serializa. La segunda ve el resultado de la primera. |

## Criterios de aceptación

- [ ] Un +8% con redondeo a $50 sobre 47 productos se aplica en una transacción y
      genera 47 filas de historial.
- [ ] La vista previa muestra el precio final ya redondeado, no el bruto.
- [ ] Deshacer restaura los precios anteriores exactos.
- [ ] Cargar una compra que sube el costo por encima del precio dispara la alerta.
- [ ] El redondeo usa `lib/money.ts` y no hay una segunda implementación en el repo.
