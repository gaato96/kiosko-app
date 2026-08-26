# Fase 10 — Reportes, métricas y precios masivos

```
Leé docs/03-modulos/09-reportes-metricas.md y docs/03-modulos/07-precios-inflacion.md.

Dos módulos en una fase porque comparten el mismo usuario (el dueño) y la misma
pantalla de entrada (el panel).

Principio rector: un kiosquero no lee dashboards. CADA NÚMERO VIENE CON UNA ACCIÓN
AL LADO. "Vendiste $340.000" no sirve; "vendiste $340.000, 12% menos que el sábado
pasado" sirve, y "8 productos no se venden hace 30 días [Ver lista]" sirve más.

PARTE A — ACTUALIZACIÓN MASIVA DE PRECIOS

1. Pantalla con: alcance (todos / categoría / proveedor / selección manual),
   porcentaje, redondeo a $1 / $10 / $50 / $100, y checkbox para actualizar
   también el costo.

2. VISTA PREVIA OBLIGATORIA antes de aplicar, con el precio final YA REDONDEADO
   producto por producto, y posibilidad de destildar individualmente.

3. RPC actualizar_precios_masivo(filtros, pct, redondeo) transaccional. Cada
   producto genera una fila en precios_historial con motivo 'masivo' y un lote_id
   común.

4. Botón DESHACER disponible 24 h: revierte al precio anterior de cada producto del
   lote. Las ventas ya hechas conservan su precio (los items lo congelaron).

5. Alerta de margen: fila roja con badge "vendés a pérdida" si
   precio_venta <= precio_costo, ámbar si está por debajo del margen objetivo.
   Badge permanente en el panel: "5 productos con margen bajo".

6. Precio sugerido por margen objetivo:
   redondear(costo × (1 + margen_objetivo/100), redondeo). Siempre editable.

7. Historial de precios por producto: gráfico de precio y costo en el tiempo con la
   variación acumulada. Vista agregada "cuánto me aumentaron" por proveedor a
   30/60/90 días.

PARTE B — REPORTES

8. Panel de inicio del dueño, exactamente como el diagrama de la spec:
   venta de hoy con comparación CONTRA EL MISMO DÍA DE LA SEMANA PASADA (no contra
   ayer: un martes no se compara con un domingo), tickets, ticket promedio,
   desglose por medio de pago, y las alertas accionables (para reponer, margen
   bajo, deudores viejos, pedidos nuevos).

9. Ventas: serie diaria/semanal/mensual, HEATMAP DE VENTAS POR HORA Y DÍA DE LA
   SEMANA (responde a qué hora abrir y cuándo hace falta otra persona), desglose
   por medio de pago, ticket promedio, ventas por usuario y turno.

10. Rentabilidad: margen bruto usando el COSTO CONGELADO DEL ITEM, no el costo
    actual del producto. Top por rentabilidad y no por unidades. Identificación de
    productos gancho (alta rotación, margen bajo). Margen por categoría.
    Los productos SERVICIO computan SOLO la comisión como ingreso.

11. Gastos: CRUD simple con categoría, monto, fecha y recurrente.
    Rentabilidad neta = margen bruto - gastos del período. Sin esto el reporte
    muestra facturación disfrazada de ganancia.

12. Inventario: productos muertos (sin ventas en 30/60/90 días) con el capital
    inmovilizado, rotación por producto, valorización del stock a costo y a venta,
    historial de merma por motivo.

13. Clientes: total fiado, antigüedad de la deuda (0-30 / 30-60 / +60), clientes
    que más compran, deuda incobrable estimada.

14. Exportar a CSV y Excel: ventas, productos, movimientos de stock y cuentas
    corrientes. No es un extra: el dueño necesita sentir que los datos son suyos.

IMPLEMENTACIÓN
- Vistas materializadas para los agregados pesados (mv_ventas_diarias,
  mv_rentabilidad_producto), refrescadas cada 15 min
- recharts cargado con dynamic() — NUNCA en el bundle del POS
- Rango por defecto: últimos 30 días

CRITERIOS DE ACEPTACIÓN
- Un +8% con redondeo a $50 sobre 47 productos se aplica en una transacción y
  genera 47 filas de historial
- Deshacer restaura los precios anteriores exactos
- El panel carga en menos de 1,5 s con 10.000 ventas
- La comparativa es contra el mismo día de la semana anterior
- El margen usa el costo congelado del item
- Un empleado no accede a ninguna ruta de reportes (verificado por RLS)
- recharts NO aparece en el bundle de la ruta del POS (verificar con next build)
```
