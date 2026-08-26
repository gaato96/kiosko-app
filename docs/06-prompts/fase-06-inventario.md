# Fase 6 — Inventario, reposición y compras

```
Leé docs/03-modulos/04-inventario.md completo.

Objetivo: que el dueño sepa qué reponer sin recorrer las góndolas, arme el pedido
a cada proveedor desde el celular, y actualice el stock al recibir la mercadería
sin volver a cargar producto por producto.

TAREAS

1. Vista "Para reponer" usando la vista productos_a_reponer,
   AGRUPADA POR PROVEEDOR (no una lista única: el pedido se manda a cada proveedor
   por separado). Cada fila: stock actual, mínimo, faltante y sugerencia de compra
   expresada en unidades de compra.
   Los productos de peso se muestran en kg aunque internamente sean gramos.

2. Botón "Enviar por WhatsApp" por cada grupo de proveedor. Genera texto plano
   (sin markdown, WhatsApp no lo renderiza) con las cantidades en unidades de
   COMPRA, y abre wa.me/<telefono>?text=<encoded>. Si el proveedor no tiene
   teléfono, copia al portapapeles.
   Formato exacto en la spec, sección 2.

3. Módulo de reposición rápida — el flujo de "ya compré":
   - La misma lista con checkbox y campo de cantidad
   - Muestra la equivalencia en vivo: "2 packs x6 = 12 unidades"
   - Campo opcional de costo total de la compra
   - Botón "+ Agregar producto que no está en la lista" con alta rápida, sin
     salir del flujo
   - RPC aplicar_compra(payload) en una sola transacción:
     crea compras + compras_items, inserta movimientos_stock con
     delta = cantidad_compra × factor_compra y motivo COMPRA, actualiza el costo
     si se cargó, y deja historial de precios

4. Al terminar de cargar una compra, si algún producto quedó con margen por debajo
   del objetivo, mostrar la lista con los precios de venta propuestos.
   El dueño acepta con un toque o los edita. EL SISTEMA NO CAMBIA PRECIOS SOLO.

5. Ajustes y merma: pantalla propia con motivos MERMA, ROTURA, VENCIMIENTO,
   CONSUMO_INTERNO, AJUSTE, CARGA_INICIAL. Producto, delta, motivo, nota, usuario.
   Los de peso se ingresan en gramos. Siempre auditado.

6. Conteo físico: modo lista para recorrer una categoría tipeando el stock real.
   El sistema calcula los deltas y los inserta como un lote de AJUSTE.

7. Vista "Por vencer": productos con vence = true dentro de
   dias_alerta_vencimiento. Acción sugerida: precio de liquidación y agregarlo a
   las teclas rápidas.

8. Historial de movimientos por producto: filtrable por motivo y fecha, con el
   saldo acumulado en cada fila.

9. (Opcional en esta fase, ideal si entra) Sugerencia inteligente de compra:
   promedio_diario = ventas de los últimos 14 días / 14
   sugerido = ceil(promedio_diario × dias_cobertura - stock_actual)
   redondeado hacia arriba al múltiplo de factor_compra
   con dias_cobertura según los dias_visita del proveedor.

CRITERIOS DE ACEPTACIÓN
- Producto con factor_compra = 24: comprar 2 sube el stock en 48
- Producto de peso con factor_compra = 4000: comprar 1 horma sube 4000 g
- La lista se agrupa por proveedor y genera un mensaje por grupo
- Recibir 5 productos de un proveedor toma 10 toques o menos desde la lista
- Un ajuste por merma queda con motivo y usuario en movimientos_stock
- Sumar todos los delta de un producto da exactamente su stock_actual
  (escribir un test que lo verifique con 100 movimientos aleatorios)
```
