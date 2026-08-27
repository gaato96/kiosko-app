-- ============================================================================
-- 004 · Proveedores, imágenes y unidades de compra
-- ============================================================================
--
-- Lo que se tapa acá:
--
-- 1. `proveedores` existía en el esquema desde el día uno, con su RLS y su
--    columna en `productos`, pero NO había forma de cargar uno. Consecuencia:
--    la pantalla "Para reponer" agrupaba todo bajo "Sin proveedor" y el pedido
--    por WhatsApp no se le podía mandar a nadie.
--
-- 2. `factor_compra` y `unidad_compra` tampoco se podían editar. Son las dos
--    columnas con las que se arma el pedido ("3 cajas x24", no "72 latas"), y
--    `guardar_producto` ni las miraba: quedaban en 1 / 'Unidad' para siempre.
--
-- 3. No había dónde guardar imágenes. `productos.imagen_url` y
--    `comercios.logo_url` existían apuntando a la nada, y los usuarios no
--    tenían avatar.
--
-- Aplicar sobre una base que ya tiene schema.sql, 001, 002 y 003.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Avatar del usuario
-- ----------------------------------------------------------------------------
alter table usuarios_comercio add column if not exists avatar_url text;

-- La vista que lee el POS para el cambio de operador: ahora con la foto, que
-- es lo que hace reconocible al operador de un vistazo en una tablet.
create or replace view usuarios_pos with (security_invoker = off) as
  select id, comercio_id, nombre, rol, avatar_url, activo
    from usuarios_comercio
   where comercio_id = public.comercio_id() and activo;
grant select on usuarios_pos to authenticated;

-- ----------------------------------------------------------------------------
-- Proveedores: alta, edición y baja
-- ----------------------------------------------------------------------------
--
-- Va por RPC como el resto del catálogo: exige dueño y deja rastro en
-- auditoría. La política RLS de tabla alcanza para leer, pero no distingue
-- dueño de empleado, y un empleado no tiene por qué reescribir la lista de
-- proveedores del kiosco.
create or replace function public.guardar_proveedor(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_comercio uuid := public.exigir_tenant(null);
  v_id uuid := nullif(payload ->> 'id', '')::uuid;
  v_alta boolean := false;
begin
  perform public.exigir_dueno();

  if coalesce(trim(payload ->> 'nombre'), '') = '' then
    raise exception 'El proveedor necesita un nombre';
  end if;

  if v_id is null then
    v_id := gen_random_uuid();
    v_alta := true;
  end if;

  insert into proveedores (id, comercio_id, nombre, telefono, contacto, dias_visita, notas, activo)
  values (
    v_id, v_comercio,
    trim(payload ->> 'nombre'),
    -- El teléfono se guarda solo con dígitos: es lo que espera wa.me y evita
    -- que "11 2233-4455" y "1122334455" sean dos proveedores distintos.
    nullif(regexp_replace(coalesce(payload ->> 'telefono', ''), '\D', '', 'g'), ''),
    nullif(trim(coalesce(payload ->> 'contacto', '')), ''),
    coalesce((select array_agg(trim(x)) from jsonb_array_elements_text(payload -> 'dias_visita') x
               where trim(x) <> ''), '{}'),
    nullif(trim(coalesce(payload ->> 'notas', '')), ''),
    coalesce((payload ->> 'activo')::boolean, true)
  )
  on conflict (id) do update set
    nombre = excluded.nombre,
    telefono = case when payload ? 'telefono' then excluded.telefono else proveedores.telefono end,
    contacto = case when payload ? 'contacto' then excluded.contacto else proveedores.contacto end,
    dias_visita = case when payload ? 'dias_visita' then excluded.dias_visita else proveedores.dias_visita end,
    notas = case when payload ? 'notas' then excluded.notas else proveedores.notas end,
    activo = case when payload ? 'activo' then excluded.activo else proveedores.activo end,
    actualizado_en = now();

  insert into auditoria (comercio_id, usuario_id, entidad, entidad_id, accion, datos_despues)
  values (v_comercio, auth.uid(), 'proveedores', v_id,
          case when v_alta then 'alta_proveedor' else 'edicion_proveedor' end,
          payload - 'id');

  return jsonb_build_object('id', v_id, 'alta', v_alta);
end $fn$;

grant execute on function public.guardar_proveedor(jsonb) to authenticated;

-- Se archiva, no se borra: los productos que cuelgan de él quedarían apuntando
-- a la nada y las compras viejas perderían de quién vino la mercadería.
create or replace function public.archivar_proveedor(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_comercio uuid := public.exigir_tenant(null);
  v_cuantos int;
begin
  perform public.exigir_dueno();

  select count(*) into v_cuantos from productos
   where comercio_id = v_comercio and proveedor_id = p_id and activo;

  update proveedores set activo = false, actualizado_en = now()
   where id = p_id and comercio_id = v_comercio;
  if not found then raise exception 'Ese proveedor no existe'; end if;

  insert into auditoria (comercio_id, usuario_id, entidad, entidad_id, accion)
  values (v_comercio, auth.uid(), 'proveedores', p_id, 'archivar_proveedor');

  return jsonb_build_object('id', p_id, 'productos_sueltos', v_cuantos);
end $fn$;

grant execute on function public.archivar_proveedor(uuid) to authenticated;

-- Asignar un proveedor a muchos productos de una sola pasada. Cargar el
-- proveedor producto por producto sobre un catálogo de 400 filas no lo hace
-- nadie, y sin proveedor asignado la pantalla de reposición no sirve.
create or replace function public.asignar_proveedor(
  p_proveedor_id uuid,
  p_productos uuid[]
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_comercio uuid := public.exigir_tenant(null);
  v_cuantos int;
begin
  perform public.exigir_dueno();

  if p_proveedor_id is not null and not exists (
    select 1 from proveedores where id = p_proveedor_id and comercio_id = v_comercio
  ) then
    raise exception 'Ese proveedor no existe';
  end if;

  update productos
     set proveedor_id = p_proveedor_id, actualizado_en = now()
   where comercio_id = v_comercio and id = any(p_productos);

  get diagnostics v_cuantos = row_count;
  return jsonb_build_object('actualizados', v_cuantos);
end $fn$;

grant execute on function public.asignar_proveedor(uuid, uuid[]) to authenticated;

-- ----------------------------------------------------------------------------
-- guardar_producto: unidades de compra e imagen
-- ----------------------------------------------------------------------------
--
-- Igual que la de 002 más `factor_compra`, `unidad_compra` y `alias`, que
-- hasta ahora no se podían tocar desde ninguna pantalla. El resto queda tal
-- cual: solo se pisa lo que VIENE en el payload.
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
    controla_stock, stock_minimo, factor_compra, unidad_compra,
    visible_en_vidriera, imagen_url, activo
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
    -- El factor nunca puede ser 0: dividir el faltante por 0 al armar el
    -- pedido rompe la pantalla de reposición entera.
    greatest(1, coalesce((payload ->> 'factor_compra')::int, 1)),
    coalesce(nullif(trim(coalesce(payload ->> 'unidad_compra', '')), ''), 'Unidad'),
    coalesce((payload ->> 'visible_en_vidriera')::boolean, true),
    nullif(trim(coalesce(payload ->> 'imagen_url', '')), ''),
    coalesce((payload ->> 'activo')::boolean, true)
  )
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
    factor_compra = case when payload ? 'factor_compra'
      then excluded.factor_compra else productos.factor_compra end,
    unidad_compra = case when payload ? 'unidad_compra'
      then excluded.unidad_compra else productos.unidad_compra end,
    visible_en_vidriera = case when payload ? 'visible_en_vidriera'
      then excluded.visible_en_vidriera else productos.visible_en_vidriera end,
    imagen_url = case when payload ? 'imagen_url'
      then excluded.imagen_url else productos.imagen_url end,
    activo = case when payload ? 'activo' then excluded.activo else productos.activo end,
    actualizado_en = now();

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

-- ----------------------------------------------------------------------------
-- "Para reponer": el faltante nunca es negativo
-- ----------------------------------------------------------------------------
--
-- `stock_minimo - stock_actual` daba negativo con stock negativo del otro lado
-- y 0 cuando el mínimo estaba sin configurar, y el panel terminaba sugiriendo
-- "pedir 1" de todo. Ahora sale la cantidad que de verdad falta para volver al
-- mínimo, y se ordena por proveedor para que el agrupado salga estable.
create or replace view productos_a_reponer as
  select p.id, p.comercio_id, p.nombre, p.tipo_venta,
         p.stock_actual, p.stock_minimo,
         greatest(p.stock_minimo - p.stock_actual, 0) as faltante,
         greatest(p.factor_compra, 1) as factor_compra,
         coalesce(p.unidad_compra, 'Unidad') as unidad_compra,
         p.proveedor_id, pr.nombre as proveedor_nombre, pr.telefono as proveedor_telefono
    from productos p
    left join proveedores pr on pr.id = p.proveedor_id
   where p.activo and p.controla_stock
     and p.tipo_producto = 'FISICO'
     and p.stock_actual <= p.stock_minimo
   order by pr.nombre nulls last, p.nombre;

-- ----------------------------------------------------------------------------
-- Storage: el bucket de imágenes
-- ----------------------------------------------------------------------------
--
-- Un solo bucket público para las tres cosas que se suben: la foto del
-- producto, el logo del kiosco y el avatar del usuario. Público de lectura
-- porque la Vidriera es una página sin login y tiene que poder mostrar las
-- fotos sin firmar cada URL.
--
-- La escritura está atada al tenant por la PRIMERA carpeta de la ruta:
--   {comercio_id}/productos/{uuid}.webp
--   {comercio_id}/logo/{uuid}.webp
--   {comercio_id}/usuarios/{uuid}.webp
-- Sin eso, cualquier usuario autenticado podría pisar las fotos de otro kiosco.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'imagenes', 'imagenes', true, 5242880,
  array['image/webp', 'image/jpeg', 'image/png', 'image/avif']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png', 'image/avif'];

drop policy if exists imagenes_lectura_publica on storage.objects;
create policy imagenes_lectura_publica on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'imagenes');

drop policy if exists imagenes_escritura_tenant on storage.objects;
create policy imagenes_escritura_tenant on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'imagenes'
    and (storage.foldername(name))[1] = public.comercio_id()::text
  );

drop policy if exists imagenes_actualizacion_tenant on storage.objects;
create policy imagenes_actualizacion_tenant on storage.objects for update
  to authenticated
  using (
    bucket_id = 'imagenes'
    and (storage.foldername(name))[1] = public.comercio_id()::text
  );

drop policy if exists imagenes_borrado_tenant on storage.objects;
create policy imagenes_borrado_tenant on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'imagenes'
    and (storage.foldername(name))[1] = public.comercio_id()::text
  );
