-- ============================================================================
-- 001 · La Vidriera deja de ser un catálogo y pasa a ser un canal de venta
-- ============================================================================
-- Tres cosas que le faltaban para vender de verdad:
--   1. OFERTAS      un precio tachado al lado del vigente es lo que empuja la
--                   compra por impulso, que es de lo que vive un kiosco.
--   2. MEDIO DE PAGO el pedido llegaba sin decir si paga en efectivo o ya
--                   transfirió. El del mostrador no sabía si tenía que
--                   preparar el vuelto.
--   3. MÁS VENDIDOS ordenar por lo que realmente sale ahorra scrolls y sube el
--                   ticket promedio. Se calcula de las ventas, no se carga a mano.
-- ============================================================================

-- ---------------------------------------------------------------- 1. Ofertas
alter table productos
  add column if not exists precio_oferta_centavos bigint,
  add column if not exists oferta_hasta timestamptz;

-- Una oferta que no es más barata que el precio normal es un error de carga,
-- no una promoción.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'productos_oferta_menor') then
    alter table productos add constraint productos_oferta_menor
      check (precio_oferta_centavos is null
             or precio_venta_centavos is null
             or precio_oferta_centavos < precio_venta_centavos);
  end if;
end $$;

comment on column productos.precio_oferta_centavos is
  'Precio promocional vigente. NULL = sin oferta. Siempre menor al precio normal.';
comment on column productos.oferta_hasta is
  'Cuándo caduca la oferta. NULL = sin vencimiento, se corta a mano.';

-- El precio que efectivamente se cobra hoy. Se usa en todos lados para no
-- repetir la lógica de "si hay oferta vigente..." en cada consulta.
create or replace function public.precio_vigente(p productos)
returns bigint language sql immutable as $fn$
  select case
    when p.precio_oferta_centavos is not null
     and (p.oferta_hasta is null or p.oferta_hasta > now())
    then p.precio_oferta_centavos
    else p.precio_venta_centavos
  end;
$fn$;

-- ------------------------------------------------------- 2. Medio de pago
alter table pedidos_vidriera
  add column if not exists medio_pago medio_pago,
  add column if not exists paga_con_centavos bigint;

comment on column pedidos_vidriera.medio_pago is
  'Cómo dice el cliente que va a pagar. NULL en pedidos viejos, previos a esta columna.';
comment on column pedidos_vidriera.paga_con_centavos is
  'Con cuánto paga, si es efectivo. Sirve para llevar el vuelto preparado.';

-- ------------------------------------------------------- 3. Más vendidos
-- Sale de las ventas reales de los últimos N días. Cuenta unidades, no plata:
-- lo "más vendido" es lo que más sale del estante, no lo más caro.
create or replace function public.mas_vendidos(p_comercio uuid, p_dias int default 30, p_limite int default 12)
returns table (producto_id uuid, unidades numeric)
language sql stable security definer set search_path = public as $fn$
  select vi.producto_id, sum(vi.cantidad)::numeric as unidades
    from ventas_items vi
    join ventas v on v.id = vi.venta_id
   where v.comercio_id = p_comercio
     and v.estado = 'COMPLETADA'
     and v.creado_en > now() - (p_dias || ' days')::interval
     and vi.producto_id is not null
   group by vi.producto_id
   order by unidades desc
   limit p_limite;
$fn$;

grant execute on function public.mas_vendidos(uuid, int, int) to anon, authenticated;
grant execute on function public.precio_vigente(productos) to anon, authenticated;

-- ------------------------------------------------- 4. La vista de la Vidriera
-- Se recrea para que exponga la oferta. Sigue sin exponer costo ni stock exacto:
-- el visitante anónimo no tiene por qué ver el margen del kiosco.
drop view if exists vidriera_productos;

create view vidriera_productos
with (security_invoker = off) as
  select p.id,
         p.comercio_id,
         p.nombre,
         p.descripcion,
         p.categoria_id,
         p.tipo_venta,
         p.precio_venta_centavos,
         p.precio_por_kg_centavos,
         p.precio_oferta_centavos,
         p.oferta_hasta,
         public.precio_vigente(p) as precio_vigente_centavos,
         (p.precio_oferta_centavos is not null
          and (p.oferta_hasta is null or p.oferta_hasta > now())) as en_oferta,
         p.color,
         p.emoji,
         p.imagen_url,
         (not p.controla_stock or p.stock_actual > 0) as disponible
    from productos p
    join comercios c on c.id = p.comercio_id
   where p.activo
     and p.visible_en_vidriera
     and c.vidriera_activa
     and c.activo;

grant select on vidriera_productos to anon, authenticated;

-- ------------------------------- 5. El pedido respeta la oferta y el pago
-- Se recrea entera porque cambian dos cosas a la vez: el precio ahora sale de
-- precio_vigente() (si no, el cliente ve la oferta y le cobran el precio de
-- lista) y el pedido guarda cómo dice que va a pagar.
create or replace function public.crear_pedido_vidriera(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_comercio uuid;
  v_pedido uuid := gen_random_uuid();
  v_item jsonb;
  v_total bigint := 0;
  v_envio bigint := 0;
  v_numero bigint;
  v_precio bigint;
  v_unitario bigint;
  v_recientes integer;
begin
  select c.id into v_comercio from comercios c
   where c.slug = payload ->> 'slug' and c.vidriera_activa and c.activo;
  if v_comercio is null then raise exception 'Vidriera no disponible'; end if;

  -- Freno de spam por teléfono: 5 pedidos en 10 minutos ya es abuso.
  select count(*) into v_recientes from pedidos_vidriera
   where comercio_id = v_comercio and telefono = payload ->> 'telefono'
     and creado_en > now() - interval '10 minutes';
  if v_recientes >= 5 then
    raise exception 'Demasiados pedidos seguidos. Probá en unos minutos.';
  end if;

  if (payload ->> 'zona_id') is not null then
    select costo_centavos into v_envio from zonas_envio
     where id = (payload ->> 'zona_id')::uuid and comercio_id = v_comercio and activo;
  end if;

  perform pg_advisory_xact_lock(hashtext('pedido:' || v_comercio::text));
  select coalesce(max(numero), 0) + 1 into v_numero
    from pedidos_vidriera where comercio_id = v_comercio;

  insert into pedidos_vidriera (
    id, comercio_id, numero, nombre_cliente, telefono, direccion, tipo_entrega,
    zona_id, costo_envio_centavos, total_centavos, notas, estado, acepta_promos,
    medio_pago, paga_con_centavos)
  values (v_pedido, v_comercio, v_numero,
          payload ->> 'nombre_cliente', payload ->> 'telefono', payload ->> 'direccion',
          coalesce((payload ->> 'tipo_entrega')::tipo_entrega, 'RETIRO'),
          (payload ->> 'zona_id')::uuid, coalesce(v_envio, 0), 0,
          payload ->> 'notas', 'NUEVO',
          coalesce((payload ->> 'acepta_promos')::boolean, false),
          (payload ->> 'medio_pago')::medio_pago,
          (payload ->> 'paga_con_centavos')::bigint);

  -- Los precios se toman de la base, NUNCA del cliente.
  for v_item in select * from jsonb_array_elements(payload -> 'items') loop
    select case when p.tipo_venta = 'PESO'
                then round((v_item ->> 'cantidad')::numeric * p.precio_por_kg_centavos / 1000)
                else public.precio_vigente(p) * (v_item ->> 'cantidad')::bigint end,
           case when p.tipo_venta = 'PESO'
                then p.precio_por_kg_centavos
                else public.precio_vigente(p) end
      into v_precio, v_unitario
      from productos p
     where p.id = (v_item ->> 'producto_id')::uuid
       and p.comercio_id = v_comercio and p.activo and p.visible_en_vidriera;

    if v_precio is null then continue; end if;

    insert into pedidos_items (pedido_id, producto_id, descripcion, tipo_venta,
                               cantidad, precio_unitario_centavos, total_centavos)
    select v_pedido, p.id, p.nombre, p.tipo_venta, (v_item ->> 'cantidad')::bigint,
           v_unitario, v_precio
      from productos p where p.id = (v_item ->> 'producto_id')::uuid;

    v_total := v_total + v_precio;
  end loop;

  if v_total = 0 then raise exception 'El pedido quedó vacío'; end if;

  update pedidos_vidriera set total_centavos = v_total + coalesce(v_envio, 0)
   where id = v_pedido;

  return jsonb_build_object('id', v_pedido, 'numero', v_numero,
                            'total_centavos', v_total + coalesce(v_envio, 0),
                            'costo_envio_centavos', coalesce(v_envio, 0));
end $fn$;

grant execute on function public.crear_pedido_vidriera(jsonb) to anon, authenticated;
revoke execute on function public.crear_pedido_vidriera(jsonb) from public;
