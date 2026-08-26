/**
 * lib/columnas.ts — columnas explícitas para tablas con privilegio por columna.
 *
 * `productos`, `ventas` y `ventas_items` le tienen revocado el `SELECT` de
 * tabla a `authenticated`: los costos y los márgenes solo se otorgan columna
 * por columna (ver supabase/schema.sql, sección M1). Postgres NO reduce un
 * `SELECT *` a las columnas otorgadas — lo rechaza directo si falta una sola
 * columna del total. Por eso todo `select()` contra estas tablas tiene que
 * nombrar las columnas explícitamente, nunca `"*"`.
 *
 * Sin `server-only`: lo usa tanto el servidor (lib/admin.ts) como el
 * sincronizador del POS en el navegador (lib/db/sync.ts).
 */

export const COLUMNAS_PRODUCTO =
  "id, comercio_id, categoria_id, proveedor_id, nombre, nombre_norm, alias, descripcion, codigo_barras, tipo_producto, tipo_venta, precio_venta_centavos, precio_por_kg_centavos, controla_stock, stock_actual, stock_minimo, factor_compra, unidad_compra, vence, fecha_vencimiento, visible_en_vidriera, color, emoji, imagen_url, activo, creado_en, actualizado_en" as const;

export const COLUMNAS_VENTA =
  "id, comercio_id, numero, usuario_id, dispositivo_id, caja_sesion_id, cliente_id, subtotal_centavos, descuento_centavos, total_centavos, estado, origen, anulada_por, anulada_en, motivo_anulacion, creado_en, sincronizado_en" as const;

export const COLUMNAS_VENTA_ITEM =
  "id, venta_id, producto_id, descripcion, tipo_venta, cantidad, precio_unitario_centavos, total_centavos" as const;
