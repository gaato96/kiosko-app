# M9 · Reportes, métricas y panel

## Objetivo

Que el dueño entienda su negocio en 10 segundos desde el celular, y que las
decisiones que hoy toma por intuición (qué reponer, cuándo abrir, qué liquidar)
las tome con datos.

## Principio

**Un kiosquero no lee dashboards.** Cada número tiene que venir con una acción al
lado. "Vendiste $340.000" no sirve; "vendiste $340.000, 12% menos que el sábado
pasado" sirve. Y "hay 8 productos que no vendés hace 30 días [Ver lista]" sirve más.

## 1. Panel de inicio (lo primero que ve el dueño)

```
┌──────────────────────────────────────────┐
│  HOY                                     │
│  $340.500                    ▲ 12% vs.   │
│  62 tickets · promedio $5.492   ayer     │
├──────────────────────────────────────────┤
│  Efectivo    $198.000    Transf. $92.500 │
│  Tarjeta      $38.000    Fiado   $12.000 │
├──────────────────────────────────────────┤
│  ⚠ 23 productos para reponer      [Ver]  │
│  ⚠ 5 productos con margen bajo    [Ver]  │
│  ⚠ 3 clientes deben hace +30 días [Ver]  │
│  🔴 2 pedidos nuevos               [Ver]  │
└──────────────────────────────────────────┘
```

**La comparación correcta es contra el mismo día de la semana pasada**, no contra
ayer a secas. Un martes no se compara con un domingo, y ese es el error que hace
que las métricas de estos sistemas no signifiquen nada.

## 2. Ventas

- Serie diaria / semanal / mensual con comparativa.
- **Ventas por hora del día** (heatmap semanal). Responde: ¿a qué hora abro?
  ¿cuándo necesito una segunda persona? ¿tiene sentido abrir el domingo a la
  mañana? Un kiosco nuevo lo adivina durante meses.
- Desglose por medio de pago (para conciliar transferencias y liquidaciones de
  tarjeta).
- Ticket promedio y su evolución.
- Ventas por usuario y por turno.

## 3. Rentabilidad — no solo volumen

```
margen_bruto = Σ (total_item − costo_unitario × cantidad)
```

Los items congelan el costo al momento de la venta, así que el margen histórico es
real y no se distorsiona con cambios de precio posteriores.

- **Top por rentabilidad**, no por unidades vendidas. El producto que más se vende
  casi nunca es el que más deja: los cigarrillos son el 30% de la facturación y el
  5% de la ganancia.
- **Productos gancho**: alta rotación y margen bajo. Se identifican explícitamente,
  porque son estratégicos aunque no rindan.
- Margen por categoría.
- **Rentabilidad neta**: margen bruto − gastos del período. Sin cargar los gastos,
  el reporte muestra facturación disfrazada de ganancia.

### Servicios
Los `tipo_producto = SERVICIO` computan **solo la comisión** como ingreso. El
monto total aparece en el flujo de caja, no en la facturación. Ver
[02-MODELO-DATOS §4](../02-MODELO-DATOS.md).

## 4. Inventario

- **Productos muertos**: sin ventas en 30/60/90 días, con el capital inmovilizado
  que representan. Acción: liquidar.
- **Rotación** por producto (unidades vendidas / stock promedio).
- Valorización del stock a costo y a precio de venta.
- Historial de merma por motivo. Si la merma de fiambrería es del 8% mensual, hay
  un problema de manejo que se puede corregir.

## 5. Clientes

- Total fiado del negocio (número que suele sorprender).
- Antigüedad de la deuda: 0-30 / 30-60 / +60 días.
- Clientes que más compran.
- Deuda incobrable estimada (sin movimiento hace más de 90 días).

## 6. Caja

- Historial de arqueos con diferencias.
- **Diferencia acumulada por empleado y por mes** — la métrica del módulo M5.
- Egresos por motivo.

## 7. Exportar

CSV y Excel de ventas, productos, movimientos de stock y cuentas corrientes.

> Esto no es un extra: **el dueño necesita sentir que los datos son suyos.** Un
> sistema del que no se puede sacar la información genera desconfianza, y la
> desconfianza es lo que hace que no lo carguen bien.

## 8. Implementación

- Vistas materializadas para los agregados pesados
  (`mv_ventas_diarias`, `mv_rentabilidad_producto`), refrescadas cada 15 min.
- Gráficos con `recharts`, cargados con `dynamic()` — **nunca en el bundle del POS**.
- Todas las consultas filtradas por `comercio_id` vía RLS.
- Rango de fechas por defecto: los últimos 30 días.
- Los reportes requieren conexión (no se cachean offline).

## Casos borde

| Caso | Comportamiento |
|---|---|
| Comercio recién creado, sin datos | Estado vacío útil: "Cuando empieces a vender vas a ver acá tus métricas", no un gráfico en cero. |
| Productos sin costo cargado | Se excluyen del margen y se avisa cuántos son. |
| Ventas anuladas | Nunca entran en ningún reporte, pero sí en un contador aparte de anulaciones (que también es una métrica de control). |
| Período sin ventas | Se muestra el cero explícito, no un error. |

## Criterios de aceptación

- [ ] El panel carga en < 1,5 s con 10.000 ventas.
- [ ] La comparativa es contra el mismo día de la semana anterior.
- [ ] El margen usa el costo congelado del item, no el costo actual del producto.
- [ ] Los servicios computan solo la comisión como ingreso.
- [ ] Un empleado no puede acceder a ninguna ruta de reportes (verificado por RLS).
- [ ] `recharts` no aparece en el bundle de la ruta del POS.
