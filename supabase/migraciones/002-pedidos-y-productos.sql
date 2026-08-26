-- ============================================================================
-- 002 · El circuito del pedido y el alta de mercadería a mano
-- ============================================================================
--
-- Dos agujeros que se tapan acá:
--
-- 1. El pedido de la Vidriera no tenía circuito. `convertir_pedido_en_venta`
--    lo dejaba en ACEPTADO y no había forma de moverlo de ahí, así que el
--    pedido quedaba colgado para siempre en "en curso" del panel. Además el
--    cambio de estado se hacía con un UPDATE suelto desde el navegador, sin
--    validar la transición ni dejar rastro.
--
-- 2. No se podía dar de alta un producto a mano. Se podía importar el catálogo
--    y se podían cambiar precios, nada más. Un kiosco vende cosas que no están
--    en ningún catálogo: el pan de la panadería de al lado, el flete, la
--    recarga. Sin alta manual el sistema no sirve.
--
-- Aplicar sobre una base que ya tiene schema.sql y 001.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Circuito del pedido
-- ----------------------------------------------------------------------------
--
-- El pedido lo atiende quien esté en el mostrador. NO se exige dueño: el que
-- ve entrar el pedido es el empleado, y si tiene que llamar al dueño para
-- apretar "confirmar", el cliente ya se fue.
--
-- ENTREGADO y RECHAZADO son finales. Un pedido entregado que vuelve a
-- "preparando" es siempre un error de dedo, y arreglarlo a mano después es
-- peor que no dejarlo pasar.
create or replace function public.cambiar_estado_pedido(
  p_pedido_id uuid,
  p_estado text
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_comercio uuid := public.exigir_tenant(null);
  v_pedido pedidos_vidriera%rowtype;
  v_nuevo estado_pedido := p_estado::estado_pedido;
begin
  select * into v_pedido from pedidos_vidriera
   where id = p_pedido_id and comercio_id = v_comercio;
  if not found then raise exception 'El pedido no existe'; end if;

  if v_pedido.estado = v_nuevo then
    return jsonb_build_object('id', p_pedido_id, 'estado', v_nuevo, 'sin_cambios', true);
  end if;

  if v_pedido.estado in ('ENTREGADO', 'RECHAZADO') then
    raise exception 'El pedido #% ya está %, no se puede volver atrás',
      v_pedido.numero, lower(v_pedido.estado::text);
  end if;

  update pedidos_vidriera
     set estado = v_nuevo, actualizado_en = now()
   where id = p_pedido_id;

  insert into auditoria (comercio_id, usuario_id, entidad, entidad_id, accion,
                         datos_antes, datos_despues)
  values (v_comercio, auth.uid(), 'pedidos_vidriera', p_pedido_id, 'cambio_estado',
          jsonb_build_object('estado', v_pedido.estado),
          jsonb_build_object('estado', v_nuevo));

  return jsonb_build_object('id', p_pedido_id, 'estado', v_nuevo);
end $fn$;

grant execute on function public.cambiar_estado_pedido(uuid, text) to authenticated;

-- `convertir_pedido_en_venta` la puede correr cualquiera del comercio por el
-- mismo motivo: confirmar el pedido y descontar el stock es trabajo de
-- mostrador. Se deja explícito para que no se caiga por un grant faltante.
grant execute on function public.convertir_pedido_en_venta(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Alta y edición de mercadería
-- ----------------------------------------------------------------------------
--
-- Va por RPC y no por un INSERT suelto porque el alta son DOS escrituras que
-- tienen que pasar juntas: la fila del producto y el movimiento de stock
-- inicial. Regla de oro #3: el stock es un libro mayor. Si el alta escribiera
-- `stock_actual` directo, la primera sincronización lo pisaría y nadie sabría
-- de dónde salieron esas unidades.
create or replace function public.guardar_producto(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_comercio uuid := public.exigir_tenant(null);
  v_id uuid := nullif(payload ->> 'id', '')::uuid;
  v_alta boolean := false;
  v_tipo_venta tipo_venta := coalesce(nullif(payload ->> 'tipo_venta', ''), 'UNIDAD')::tipo_venta;
  v_controla boolean := coalesce((payload ->> 'controla_stock')::boolean, true);
  v_inicial bigint := coalesce((payload ->> 'stock_inicial')::bigint, 0);
  v_antes jsonb;
begin
  perform public.exigir_dueno();

  if coalesce(trim(payload ->> 'nombre'), '') = '' then
    raise exception 'El producto necesita un nombre';
  end if;

  if v_id is null then
    v_id := gen_random_uuid();
    v_alta := true;
  else
    select to_jsonb(p) - 'nombre_norm' into v_antes from productos p
     where id = v_id and comercio_id = v_comercio;
    if v_antes is null then raise exception 'Ese producto no existe'; end if;
  end if;

  -- Un precio en cero no es un producto cargado, es un producto a medio cargar
  -- que después cobra $0 en el mostrador sin que nadie se entere. En una
  -- edición que no toca el precio se mira el que ya tenía.
  if v_tipo_venta = 'UNIDAD' and coalesce(
       (case when payload ? 'precio_venta_centavos'
             then (payload ->> 'precio_venta_centavos')::bigint
             else (v_antes ->> 'precio_venta_centavos')::bigint end), 0) <= 0 then
    raise exception 'Poné el precio de venta';
  end if;
  if v_tipo_venta = 'PESO' and coalesce(
       (case when payload ? 'precio_por_kg_centavos'
             then (payload ->> 'precio_por_kg_centavos')::bigint
             else (v_antes ->> 'precio_por_kg_centavos')::bigint end), 0) <= 0 then
    raise exception 'Poné el precio por kilo';
  end if;

  -- El código de barras tiene que ser único entre los productos VIVOS: si se
  -- repite, la pistola del mostrador levanta cualquiera de los dos y el stock
  -- se rompe. Los archivados no cuentan, porque reemplazar un producto dado de
  -- baja por otro con el mismo código es exactamente lo que hace un kiosco
  -- cuando cambia de proveedor o de presentación.
  if coalesce(payload ->> 'codigo_barras', '') <> ''
     and exists (select 1 from productos
                  where comercio_id = v_comercio
                    and codigo_barras = payload ->> 'codigo_barras'
                    and activo
                    and id <> v_id) then
    raise exception 'Ya hay otro producto activo con ese código de barras';
  end if;

  insert into productos (
    id, comercio_id, categoria_id, proveedor_id, nombre, alias, descripcion,
    codigo_barras, tipo_producto, tipo_venta,
    precio_venta_centavos, precio_por_kg_centavos, precio_costo_centavos,
    precio_oferta_centavos, oferta_hasta,
    controla_stock, stock_minimo, visible_en_vidriera, imagen_url, activo
  ) values (
    v_id, v_comercio,
    nullif(payload ->> 'categoria_id', '')::uuid,
    nullif(payload ->> 'proveedor_id', '')::uuid,
    trim(payload ->> 'nombre'),
    coalesce((select array_agg(trim(x)) from jsonb_array_elements_text(payload -> 'alias') x
               where trim(x) <> ''), '{}'),
    nullif(trim(coalesce(payload ->> 'descripcion', '')), ''),
    nullif(trim(coalesce(payload ->> 'codigo_barras', '')), ''),
    coalesce(nullif(payload ->> 'tipo_producto', ''), 'FISICO')::tipo_producto,
    v_tipo_venta,
    nullif(payload ->> 'precio_venta_centavos', '')::bigint,
    nullif(payload ->> 'precio_por_kg_centavos', '')::bigint,
    coalesce((payload ->> 'precio_costo_centavos')::bigint, 0),
    nullif(payload ->> 'precio_oferta_centavos', '')::bigint,
    nullif(payload ->> 'oferta_hasta', '')::timestamptz,
    v_controla,
    coalesce((payload ->> 'stock_minimo')::bigint, 0),
    coalesce((payload ->> 'visible_en_vidriera')::boolean, true),
    nullif(trim(coalesce(payload ->> 'imagen_url', '')), ''),
    coalesce((payload ->> 'activo')::boolean, true)
  )
  -- Solo se pisa lo que VIENE en el payload. La diferencia entre "la clave no
  -- vino" y "la clave vino en null" es la que evita que una edición parcial
  -- borre el código de barras o el costo sin que nadie lo pida. Mandar null
  -- explícito sigue sirviendo para limpiar un campo.
  on conflict (id) do update set
    categoria_id = case when payload ? 'categoria_id'
      then excluded.categoria_id else productos.categoria_id end,
    proveedor_id = case when payload ? 'proveedor_id'
      then excluded.proveedor_id else productos.proveedor_id end,
    nombre = excluded.nombre,
    alias = case when payload ? 'alias' then excluded.alias else productos.alias end,
    descripcion = case when payload ? 'descripcion'
      then excluded.descripcion else productos.descripcion end,
    codigo_barras = case when payload ? 'codigo_barras'
      then excluded.codigo_barras else productos.codigo_barras end,
    tipo_producto = case when payload ? 'tipo_producto'
      then excluded.tipo_producto else productos.tipo_producto end,
    tipo_venta = excluded.tipo_venta,
    precio_venta_centavos = case when payload ? 'precio_venta_centavos'
      then excluded.precio_venta_centavos else productos.precio_venta_centavos end,
    precio_por_kg_centavos = case when payload ? 'precio_por_kg_centavos'
      then excluded.precio_por_kg_centavos else productos.precio_por_kg_centavos end,
    precio_costo_centavos = case when payload ? 'precio_costo_centavos'
      then excluded.precio_costo_centavos else productos.precio_costo_centavos end,
    precio_oferta_centavos = case when payload ? 'precio_oferta_centavos'
      then excluded.precio_oferta_centavos else productos.precio_oferta_centavos end,
    oferta_hasta = case when payload ? 'oferta_hasta'
      then excluded.oferta_hasta else productos.oferta_hasta end,
    controla_stock = case when payload ? 'controla_stock'
      then excluded.controla_stock else productos.controla_stock end,
    stock_minimo = case when payload ? 'stock_minimo'
      then excluded.stock_minimo else productos.stock_minimo end,
    visible_en_vidriera = case when payload ? 'visible_en_vidriera'
      then excluded.visible_en_vidriera else productos.visible_en_vidriera end,
    imagen_url = case when payload ? 'imagen_url'
      then excluded.imagen_url else productos.imagen_url end,
    activo = case when payload ? 'activo' then excluded.activo else productos.activo end,
    actualizado_en = now();

  -- El stock inicial entra como movimiento, nunca como número absoluto.
  if v_alta and v_controla and v_inicial <> 0 then
    insert into movimientos_stock (comercio_id, producto_id, delta, motivo, nota, usuario_id)
    values (v_comercio, v_id, v_inicial, 'CARGA_INICIAL', 'Alta del producto', auth.uid());
  end if;

  insert into auditoria (comercio_id, usuario_id, entidad, entidad_id, accion,
                         datos_antes, datos_despues)
  values (v_comercio, auth.uid(), 'productos', v_id,
          case when v_alta then 'alta_producto' else 'edicion_producto' end,
          v_antes, payload - 'id');

  return jsonb_build_object('id', v_id, 'alta', v_alta);
end $fn$;

grant execute on function public.guardar_producto(jsonb) to authenticated;

-- Bajar un producto es archivarlo, no borrarlo: sus ventas viejas siguen
-- necesitando la fila para que los reportes históricos no queden en "—".
create or replace function public.archivar_producto(p_id uuid)
returns void language plpgsql security definer set search_path = public as $fn$
declare v_comercio uuid := public.exigir_tenant(null);
begin
  perform public.exigir_dueno();
  update productos set activo = false, actualizado_en = now()
   where id = p_id and comercio_id = v_comercio;
  if not found then raise exception 'Ese producto no existe'; end if;

  insert into auditoria (comercio_id, usuario_id, entidad, entidad_id, accion)
  values (v_comercio, auth.uid(), 'productos', p_id, 'archivar_producto');
end $fn$;

grant execute on function public.archivar_producto(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Categorías
-- ----------------------------------------------------------------------------
create or replace function public.guardar_categoria(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_comercio uuid := public.exigir_tenant(null);
  v_id uuid := nullif(payload ->> 'id', '')::uuid;
begin
  perform public.exigir_dueno();

  if coalesce(trim(payload ->> 'nombre'), '') = '' then
    raise exception 'La categoría necesita un nombre';
  end if;

  if v_id is null then v_id := gen_random_uuid(); end if;

  insert into categorias (id, comercio_id, nombre, color, emoji, orden, activo)
  values (v_id, v_comercio, trim(payload ->> 'nombre'),
          coalesce(nullif(payload ->> 'color', ''), '#94a1bb'),
          nullif(trim(coalesce(payload ->> 'emoji', '')), ''),
          coalesce((payload ->> 'orden')::int,
                   (select coalesce(max(orden), 0) + 1 from categorias where comercio_id = v_comercio)),
          coalesce((payload ->> 'activo')::boolean, true))
  on conflict (id) do update set
    nombre = excluded.nombre,
    color = excluded.color,
    emoji = excluded.emoji,
    orden = excluded.orden,
    activo = excluded.activo,
    actualizado_en = now();

  return jsonb_build_object('id', v_id);
end $fn$;

grant execute on function public.guardar_categoria(jsonb) to authenticated;

-- No se borra: los productos que cuelgan de ella quedarían sin clasificar de
-- golpe. Se archiva y se deja de ofrecer.
create or replace function public.archivar_categoria(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_comercio uuid := public.exigir_tenant(null);
  v_cuantos int;
begin
  perform public.exigir_dueno();

  select count(*) into v_cuantos from productos
   where comercio_id = v_comercio and categoria_id = p_id and activo;

  update categorias set activo = false, actualizado_en = now()
   where id = p_id and comercio_id = v_comercio;
  if not found then raise exception 'Esa categoría no existe'; end if;

  return jsonb_build_object('id', p_id, 'productos_sueltos', v_cuantos);
end $fn$;

grant execute on function public.archivar_categoria(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- El pedido convertido tiene que registrar CÓMO se cobra
-- ----------------------------------------------------------------------------
--
-- `convertir_pedido_en_venta` insertaba la venta y sus items, pero nunca una
-- fila en `ventas_pagos`. Consecuencia: el panel arma "Por medio de pago"
-- leyendo esa tabla, así que TODA la plata que entraba por la Vidriera
-- desaparecía de ese corte. El total del día estaba bien y el desglose mentía.
--
-- Ahora que el pedido trae `medio_pago` desde el checkout, se registra. Si el
-- pedido es viejo y no lo tiene, se asume efectivo, que es lo que pasa cuando
-- se entrega en la puerta.
create or replace function public.convertir_pedido_en_venta(p_pedido_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_comercio uuid := public.exigir_tenant(null);
  v_pedido pedidos_vidriera%rowtype;
  v_venta uuid := gen_random_uuid();
  v_numero bigint;
  v_costo bigint := 0;
  v_medio medio_pago;
begin
  select * into v_pedido from pedidos_vidriera
   where id = p_pedido_id and comercio_id = v_comercio;
  if not found then raise exception 'El pedido no existe'; end if;
  if v_pedido.venta_id is not null then
    return jsonb_build_object('venta_id', v_pedido.venta_id, 'duplicada', true);
  end if;
  if v_pedido.estado = 'RECHAZADO' then
    raise exception 'El pedido #% está rechazado', v_pedido.numero;
  end if;

  v_numero := public.siguiente_numero_venta(v_comercio);
  v_medio := coalesce(v_pedido.medio_pago, 'EFECTIVO');

  insert into ventas (id, comercio_id, numero, usuario_id, subtotal_centavos,
                      total_centavos, estado, origen, creado_en)
  values (v_venta, v_comercio, v_numero, auth.uid(),
          v_pedido.total_centavos, v_pedido.total_centavos, 'COMPLETADA', 'VIDRIERA', now());

  insert into ventas_items (id, venta_id, producto_id, descripcion, tipo_venta,
                            cantidad, precio_unitario_centavos, costo_unitario_centavos, total_centavos)
  select gen_random_uuid(), v_venta, pi.producto_id, pi.descripcion, pi.tipo_venta,
         pi.cantidad, pi.precio_unitario_centavos,
         coalesce(public.costo_item(pi.producto_id, pi.tipo_venta, pi.cantidad), 0),
         pi.total_centavos
    from pedidos_items pi where pi.pedido_id = p_pedido_id;

  -- Sin esto la venta de la Vidriera no aparece en el desglose por medio de pago.
  insert into ventas_pagos (id, venta_id, medio, monto_centavos,
                            recibido_centavos, vuelto_centavos)
  values (gen_random_uuid(), v_venta, v_medio, v_pedido.total_centavos,
          case when v_medio = 'EFECTIVO' then v_pedido.paga_con_centavos end,
          case when v_medio = 'EFECTIVO' and v_pedido.paga_con_centavos is not null
               then greatest(v_pedido.paga_con_centavos - v_pedido.total_centavos, 0) end);

  select coalesce(sum(costo_unitario_centavos), 0) into v_costo
    from ventas_items where venta_id = v_venta;
  update ventas set costo_total_centavos = v_costo where id = v_venta;

  -- Descuenta stock, que es justamente lo que un wa.me suelto no hace.
  insert into movimientos_stock (comercio_id, producto_id, delta, motivo, referencia_id, usuario_id)
  select v_comercio, pi.producto_id, -pi.cantidad, 'VENTA', v_venta, auth.uid()
    from pedidos_items pi
    join productos p on p.id = pi.producto_id
   where pi.pedido_id = p_pedido_id and p.controla_stock and p.tipo_producto = 'FISICO';

  update pedidos_vidriera
     set venta_id = v_venta, estado = 'ACEPTADO', actualizado_en = now()
   where id = p_pedido_id;

  insert into auditoria (comercio_id, usuario_id, entidad, entidad_id, accion, datos_despues)
  values (v_comercio, auth.uid(), 'pedidos_vidriera', p_pedido_id, 'confirmar_pedido',
          jsonb_build_object('venta_id', v_venta, 'numero', v_numero, 'medio', v_medio));

  return jsonb_build_object('venta_id', v_venta, 'numero', v_numero);
end $fn$;

grant execute on function public.convertir_pedido_en_venta(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- El número del pedido no puede quedar en null
-- ----------------------------------------------------------------------------
--
-- Lo asignaba solamente `crear_pedido_vidriera`. Cualquier otro camino de
-- inserción dejaba `numero` en null y la pantalla mostraba "#—", que es
-- justamente el dato con el que el cliente llama por teléfono para preguntar
-- por su pedido. El número se asigna por comercio, no global: el kiosco cuenta
-- sus pedidos desde 1.
create or replace function public.tg_numero_pedido()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if new.numero is null then
    -- El mismo lock que usa la RPC: sin esto dos pedidos simultáneos se llevan
    -- el mismo número.
    perform pg_advisory_xact_lock(hashtext('pedido:' || new.comercio_id::text));
    select coalesce(max(numero), 0) + 1 into new.numero
      from pedidos_vidriera where comercio_id = new.comercio_id;
  end if;
  return new;
end $fn$;

drop trigger if exists numero_pedido on pedidos_vidriera;
create trigger numero_pedido before insert on pedidos_vidriera
for each row execute function public.tg_numero_pedido();

-- ----------------------------------------------------------------------------
-- Permiso de lectura sobre las columnas de oferta
-- ----------------------------------------------------------------------------
--
-- `productos` tiene el SELECT de tabla revocado y los privilegios se dan
-- COLUMNA POR COLUMNA, para que el costo no le llegue a un empleado. La
-- migración 001 agregó `precio_oferta_centavos` y `oferta_hasta` con un
-- `alter table`, que no otorga nada.
--
-- El efecto es traicionero: Postgres no recorta un SELECT a las columnas
-- permitidas, lo RECHAZA ENTERO si falta una sola. Apenas esas dos columnas se
-- sumaron a COLUMNAS_PRODUCTO, la pantalla de Productos quedó en blanco y el
-- POS dejó de bajar el catálogo. No es un permiso de más: es lo que hace que
-- la oferta se pueda leer donde se cobra.
grant select (precio_oferta_centavos, oferta_hasta) on public.productos to authenticated;
