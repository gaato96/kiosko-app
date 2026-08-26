-- ============================================================================
-- 003 · Quién vendió
-- ============================================================================
--
-- El panel mostraba cuánto se vendió y a qué hora, pero no QUIÉN. En un kiosco
-- con dos o tres personas rotando eso es la mitad de la pregunta: el dueño
-- quiere saber cuánto movió cada turno, y sobre todo cuánto EFECTIVO pasó por
-- las manos de cada uno, que es contra lo que después cierra el arqueo.
--
-- Se agrupa por `ventas.usuario_id`, que es el OPERADOR que estaba activo al
-- cobrar (el que entró con PIN), no la cuenta con la que está abierta la
-- sesión del navegador. Es lo correcto: la tablet queda abierta con el usuario
-- del dueño y quien cobra se identifica con el PIN.
--
-- Solo el dueño. Un empleado no puede ver lo que vendieron los demás.
-- ============================================================================

create or replace function public.ventas_por_operador(p_desde date, p_hasta date)
returns table (
  usuario_id uuid,
  nombre text,
  rol text,
  tickets bigint,
  total_centavos bigint,
  efectivo_centavos bigint,
  ticket_promedio_centavos bigint,
  anuladas bigint
)
language plpgsql stable security definer set search_path = public as $fn$
declare v_comercio uuid := public.exigir_tenant(null);
begin
  perform public.exigir_dueno();

  return query
  with del_periodo as (
    select ve.id, ve.usuario_id, ve.total_centavos, ve.estado
      from ventas ve
     where ve.comercio_id = v_comercio
       -- El día del negocio es en hora argentina. Una venta de las 21:30 del
       -- martes NO es del miércoles, aunque en UTC lo parezca.
       and (ve.creado_en at time zone 'America/Argentina/Buenos_Aires')::date
           between p_desde and p_hasta
  ),
  efectivo as (
    select d.usuario_id, sum(vp.monto_centavos) as monto
      from del_periodo d
      join ventas_pagos vp on vp.venta_id = d.id
     where d.estado = 'COMPLETADA' and vp.medio = 'EFECTIVO'
     group by d.usuario_id
  )
  select
    d.usuario_id,
    coalesce(uc.nombre, 'Sin identificar')::text,
    coalesce(uc.rol::text, '—')::text,
    count(*) filter (where d.estado = 'COMPLETADA'),
    coalesce(sum(d.total_centavos) filter (where d.estado = 'COMPLETADA'), 0)::bigint,
    coalesce(max(e.monto), 0)::bigint,
    case when count(*) filter (where d.estado = 'COMPLETADA') = 0 then 0::bigint
         else round(
           coalesce(sum(d.total_centavos) filter (where d.estado = 'COMPLETADA'), 0)::numeric
           / count(*) filter (where d.estado = 'COMPLETADA')
         )::bigint end,
    count(*) filter (where d.estado = 'ANULADA')
  from del_periodo d
  left join usuarios_comercio uc on uc.id = d.usuario_id
  left join efectivo e on e.usuario_id is not distinct from d.usuario_id
  group by d.usuario_id, uc.nombre, uc.rol
  order by 5 desc;
end $fn$;

grant execute on function public.ventas_por_operador(date, date) to authenticated;
