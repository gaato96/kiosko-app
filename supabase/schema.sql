-- ZONA HORARIA: todas las fechas de negocio (dia de venta, heatmap de horas,
-- historial de cajas) se calculan en America/Argentina/Buenos_Aires, no en UTC.
-- Sin eso, una venta de las 21:00 cae en el dia siguiente y el panel del dia
-- la pierde. El dominio es argentino: la zona esta fijada a proposito.
-- ============================================================================
-- Kiosko App — Esquema completo
-- Postgres 15+ / Supabase
--
-- Convenciones:
--   * Importes: bigint en CENTAVOS  (nunca float)
--   * Peso:     bigint en GRAMOS    (nunca decimales)
--   * cantidad y stock_actual se leen en unidades si tipo_venta = 'UNIDAD'
--     y en gramos si tipo_venta = 'PESO'
--   * Toda tabla de negocio lleva comercio_id + RLS
-- ============================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create extension if not exists unaccent;

-- unaccent() no es IMMUTABLE, hace falta un wrapper para usarlo en columnas
-- generadas e índices.
create or replace function public.f_unaccent(text)
returns text language sql immutable parallel safe strict as $fn$
  select public.unaccent('public.unaccent'::regdictionary, $1)
$fn$;

-- ============================================================================
-- ENUMS
-- ============================================================================
create type rol_usuario        as enum ('dueno', 'empleado');
create type tipo_producto      as enum ('FISICO', 'SERVICIO', 'COMBO');
create type tipo_venta         as enum ('UNIDAD', 'PESO');
create type motivo_stock       as enum ('VENTA','COMPRA','AJUSTE','MERMA','ROTURA',
                                        'VENCIMIENTO','CONSUMO_INTERNO','DEVOLUCION',
                                        'CARGA_INICIAL','ANULACION');
create type medio_pago         as enum ('EFECTIVO','TRANSFERENCIA','DEBITO','CREDITO','QR','FIADO');
create type estado_venta       as enum ('COMPLETADA','ANULADA');
create type origen_venta       as enum ('POS','VIDRIERA');
create type tipo_cc            as enum ('CARGO','PAGO','AJUSTE');
create type tipo_caja_mov      as enum ('INGRESO','EGRESO');
create type estado_caja        as enum ('ABIERTA','CERRADA');
create type estado_pedido      as enum ('NUEVO','ACEPTADO','PREPARANDO','ENTREGADO','RECHAZADO');
create type tipo_entrega       as enum ('RETIRO','ENVIO');

-- ============================================================================
-- HELPERS DE TENANT (leen el JWT, sin JOIN)
-- ============================================================================
create or replace function public.comercio_id()
returns uuid language sql stable as $fn$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'comercio_id', '')::uuid
$fn$;

create or replace function public.rol_actual()
returns text language sql stable as $fn$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'rol', 'anon')
$fn$;

create or replace function public.es_dueno()
returns boolean language sql stable as $fn$
  select public.rol_actual() = 'dueno'
$fn$;

-- ============================================================================
-- NÚCLEO DEL TENANT
-- ============================================================================
create table comercios (
  id                uuid primary key default gen_random_uuid(),
  nombre            text not null,
  slug              text not null unique,          -- /t/kiosco-la-esquina
  telefono_whatsapp text,                          -- 5491122334455 (sin +)
  direccion         text,
  logo_url          text,
  vidriera_activa   boolean not null default false,
  activo            boolean not null default true,
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now()
);

create table config_comercio (
  comercio_id           uuid primary key references comercios(id) on delete cascade,
  redondeo_centavos     integer not null default 10000,  -- $100
  margen_objetivo_pct   numeric(5,2) not null default 35.00,
  permite_stock_negativo boolean not null default true,
  dias_alerta_vencimiento integer not null default 7,
  -- Vidriera
  vidriera_titulo       text,
  vidriera_mensaje      text,
  vidriera_horarios     jsonb,       -- {"lun":["08:00","22:00"], ...}
  monto_minimo_envio_centavos bigint not null default 0,
  mostrar_sin_stock     boolean not null default true,
  -- Fiscal (preparado, sin uso en v1)
  cuit                  text,
  condicion_iva         text,
  punto_venta           integer,
  actualizado_en        timestamptz not null default now()
);

create table usuarios_comercio (
  id             uuid primary key references auth.users(id) on delete cascade,
  comercio_id    uuid not null references comercios(id) on delete cascade,
  nombre         text not null,
  rol            rol_usuario not null default 'empleado',
  pin_hash       text,                       -- bcrypt, 4 dígitos, validado en el servidor
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index on usuarios_comercio (comercio_id, activo);

create table dispositivos (
  id             uuid primary key,            -- generado en el cliente, persistido en IndexedDB
  comercio_id    uuid not null references comercios(id) on delete cascade,
  nombre         text not null default 'Dispositivo',
  ultimo_uso     timestamptz,
  creado_en      timestamptz not null default now()
);
create index on dispositivos (comercio_id);

-- ============================================================================
-- CATÁLOGO
-- ============================================================================
create table categorias (
  id             uuid primary key default gen_random_uuid(),
  comercio_id    uuid not null references comercios(id) on delete cascade,
  nombre         text not null,
  color          text not null default '#64748b',
  emoji          text,
  orden          integer not null default 0,
  activo         boolean not null default true,
  actualizado_en timestamptz not null default now()
);
create index on categorias (comercio_id, orden);

create table proveedores (
  id             uuid primary key default gen_random_uuid(),
  comercio_id    uuid not null references comercios(id) on delete cascade,
  nombre         text not null,
  telefono       text,                        -- para el pedido por WhatsApp
  contacto       text,
  dias_visita    text[],                      -- {'lunes','jueves'}
  notas          text,
  activo         boolean not null default true,
  actualizado_en timestamptz not null default now()
);
create index on proveedores (comercio_id, activo);

create table productos (
  id                      uuid primary key default gen_random_uuid(),
  comercio_id             uuid not null references comercios(id) on delete cascade,
  categoria_id            uuid references categorias(id) on delete set null,
  proveedor_id            uuid references proveedores(id) on delete set null,

  nombre                  text not null,
  nombre_norm             text generated always as (lower(public.f_unaccent(nombre))) stored,
  alias                   text[] not null default '{}',
  descripcion             text,
  codigo_barras           text,

  tipo_producto           tipo_producto not null default 'FISICO',
  tipo_venta              tipo_venta    not null default 'UNIDAD',

  precio_venta_centavos   bigint,             -- si tipo_venta = UNIDAD
  precio_por_kg_centavos  bigint,             -- si tipo_venta = PESO
  precio_costo_centavos   bigint not null default 0,   -- solo dueño

  controla_stock          boolean not null default true,
  stock_actual            bigint not null default 0,   -- unidades o gramos
  stock_minimo            bigint not null default 0,

  factor_compra           integer not null default 1,  -- unidades de venta por unidad de compra
  unidad_compra           text default 'Unidad',       -- 'Caja x24', 'Horma 4kg'

  vence                   boolean not null default false,
  fecha_vencimiento       date,

  -- solo para tipo_producto = SERVICIO
  comision_pct            numeric(5,2),
  comision_fija_centavos  bigint,

  visible_en_vidriera     boolean not null default true,
  color                   text,
  emoji                   text,
  imagen_url              text,

  activo                  boolean not null default true,
  creado_en               timestamptz not null default now(),
  actualizado_en          timestamptz not null default now(),

  constraint precio_segun_tipo check (
    (tipo_venta = 'UNIDAD' and precio_venta_centavos  is not null) or
    (tipo_venta = 'PESO'   and precio_por_kg_centavos is not null)
  ),
  constraint factor_compra_positivo check (factor_compra > 0)
);
create index on productos using gin (nombre_norm gin_trgm_ops);
create index on productos using gin (alias);
create index on productos (comercio_id, activo, categoria_id);
create index on productos (comercio_id, actualizado_en);
create index on productos (comercio_id, proveedor_id) where activo and controla_stock;
create unique index on productos (comercio_id, codigo_barras) where codigo_barras is not null;

create table precios_historial (
  id                     uuid primary key default gen_random_uuid(),
  comercio_id            uuid not null references comercios(id) on delete cascade,
  producto_id            uuid not null references productos(id) on delete cascade,
  precio_anterior_centavos bigint,
  precio_nuevo_centavos    bigint,
  costo_anterior_centavos  bigint,
  costo_nuevo_centavos     bigint,
  motivo                 text,               -- 'manual' | 'masivo' | 'compra'
  lote_id                uuid,               -- agrupa una actualización masiva (permite deshacer)
  usuario_id             uuid references usuarios_comercio(id) on delete set null,
  creado_en              timestamptz not null default now()
);
create index on precios_historial (comercio_id, producto_id, creado_en desc);

create table teclas_rapidas (
  id          uuid primary key default gen_random_uuid(),
  comercio_id uuid not null references comercios(id) on delete cascade,
  producto_id uuid not null references productos(id) on delete cascade,
  orden       integer not null default 0,
  unique (comercio_id, producto_id)
);

-- Catálogo semilla argentino. GLOBAL: sin comercio_id, lectura pública.
create table catalogo_base (
  id                uuid primary key default gen_random_uuid(),
  nombre            text not null,
  marca             text,
  presentacion      text,
  categoria_sugerida text not null,
  tipo_venta        tipo_venta not null default 'UNIDAD',
  codigo_barras     text,
  alias             text[] not null default '{}',
  popularidad       integer not null default 0
);
create index on catalogo_base using gin (lower(public.f_unaccent(nombre)) gin_trgm_ops);

-- ============================================================================
-- STOCK (libro mayor)
-- ============================================================================
create table movimientos_stock (
  id            uuid primary key default gen_random_uuid(),
  comercio_id   uuid not null references comercios(id) on delete cascade,
  producto_id   uuid not null references productos(id) on delete cascade,
  delta         bigint not null,             -- unidades o gramos, + o -
  motivo        motivo_stock not null,
  referencia_id uuid,                        -- venta_id, compra_id, etc.
  nota          text,
  usuario_id    uuid references usuarios_comercio(id) on delete set null,
  creado_en     timestamptz not null default now()
);
create index on movimientos_stock (comercio_id, producto_id, creado_en desc);
create index on movimientos_stock (referencia_id);

create table compras (
  id             uuid primary key default gen_random_uuid(),
  comercio_id    uuid not null references comercios(id) on delete cascade,
  proveedor_id   uuid references proveedores(id) on delete set null,
  total_centavos bigint not null default 0,
  nota           text,
  usuario_id     uuid references usuarios_comercio(id) on delete set null,
  creado_en      timestamptz not null default now()
);
create index on compras (comercio_id, creado_en desc);

create table compras_items (
  id                    uuid primary key default gen_random_uuid(),
  compra_id             uuid not null references compras(id) on delete cascade,
  producto_id           uuid not null references productos(id) on delete cascade,
  cantidad_compra       numeric(12,3) not null,   -- en unidades de COMPRA (cajas, hormas)
  delta_stock           bigint not null,          -- ya convertido por factor_compra
  costo_unitario_centavos bigint not null default 0
);
create index on compras_items (compra_id);

-- ============================================================================
-- VENTAS
-- ============================================================================
create table clientes (
  id                      uuid primary key default gen_random_uuid(),
  comercio_id             uuid not null references comercios(id) on delete cascade,
  nombre                  text not null,
  telefono                text,
  direccion               text,
  limite_credito_centavos bigint not null default 0,
  saldo_centavos          bigint not null default 0,   -- deuda; mantenido por trigger
  notas                   text,
  activo                  boolean not null default true,
  creado_en               timestamptz not null default now(),
  actualizado_en          timestamptz not null default now()
);
create index on clientes (comercio_id, activo);
create index on clientes using gin (lower(public.f_unaccent(nombre)) gin_trgm_ops);

create table ventas (
  id                  uuid primary key,              -- UUID v7 generado en el cliente
  comercio_id         uuid not null references comercios(id) on delete cascade,
  numero              bigint,                        -- correlativo, lo asigna el servidor
  usuario_id          uuid references usuarios_comercio(id) on delete set null,
  dispositivo_id      uuid references dispositivos(id) on delete set null,
  caja_sesion_id      uuid,
  cliente_id          uuid references clientes(id) on delete set null,

  subtotal_centavos   bigint not null default 0,
  descuento_centavos  bigint not null default 0,
  total_centavos      bigint not null default 0,
  costo_total_centavos bigint not null default 0,     -- snapshot para margen histórico

  estado              estado_venta not null default 'COMPLETADA',
  origen              origen_venta not null default 'POS',

  anulada_por         uuid references usuarios_comercio(id) on delete set null,
  anulada_en          timestamptz,
  motivo_anulacion    text,

  -- Fiscal (preparado, sin uso en v1)
  tipo_comprobante        text,
  punto_venta             integer,
  numero_comprobante      bigint,
  cae                     text,
  cae_vencimiento         date,
  cuit_receptor           text,
  condicion_iva_receptor  integer,

  creado_en           timestamptz not null,           -- reloj del dispositivo
  sincronizado_en     timestamptz not null default now()
);
create index on ventas (comercio_id, creado_en desc);
create index on ventas (comercio_id, caja_sesion_id);
create index on ventas (comercio_id, cliente_id) where cliente_id is not null;
create unique index on ventas (comercio_id, numero) where numero is not null;

create table ventas_items (
  id                       uuid primary key,
  venta_id                 uuid not null references ventas(id) on delete cascade,
  producto_id              uuid references productos(id) on delete set null,
  descripcion              text not null,             -- snapshot del nombre
  tipo_venta               tipo_venta not null,
  cantidad                 bigint not null,           -- unidades o GRAMOS
  precio_unitario_centavos bigint not null,           -- por unidad o por KG, congelado
  costo_unitario_centavos  bigint not null default 0,
  total_centavos           bigint not null
);
create index on ventas_items (venta_id);
create index on ventas_items (producto_id);

create table ventas_pagos (
  id                  uuid primary key,
  venta_id            uuid not null references ventas(id) on delete cascade,
  medio               medio_pago not null,
  monto_centavos      bigint not null,
  recibido_centavos   bigint,        -- solo EFECTIVO: con cuánto pagó
  vuelto_centavos     bigint,        -- solo EFECTIVO
  referencia          text           -- últimos 4 dígitos, nro de operación
);
create index on ventas_pagos (venta_id);

create table cuenta_corriente_movimientos (
  id             uuid primary key default gen_random_uuid(),
  comercio_id    uuid not null references comercios(id) on delete cascade,
  cliente_id     uuid not null references clientes(id) on delete cascade,
  tipo           tipo_cc not null,
  monto_centavos bigint not null,      -- CARGO suma deuda, PAGO la resta
  venta_id       uuid references ventas(id) on delete set null,
  medio          medio_pago,
  nota           text,
  usuario_id     uuid references usuarios_comercio(id) on delete set null,
  creado_en      timestamptz not null default now()
);
create index on cuenta_corriente_movimientos (comercio_id, cliente_id, creado_en desc);

-- ============================================================================
-- CAJA
-- ============================================================================
create table caja_sesiones (
  id                     uuid primary key default gen_random_uuid(),
  comercio_id            uuid not null references comercios(id) on delete cascade,
  dispositivo_id         uuid references dispositivos(id) on delete set null,
  usuario_id             uuid references usuarios_comercio(id) on delete set null,
  fondo_inicial_centavos bigint not null default 0,
  estado                 estado_caja not null default 'ABIERTA',
  abierta_en             timestamptz not null default now(),
  cerrada_en             timestamptz
);
create unique index una_caja_abierta_por_dispositivo
  on caja_sesiones (comercio_id, dispositivo_id) where estado = 'ABIERTA';

create table caja_movimientos (
  id             uuid primary key default gen_random_uuid(),
  comercio_id    uuid not null references comercios(id) on delete cascade,
  caja_sesion_id uuid not null references caja_sesiones(id) on delete cascade,
  tipo           tipo_caja_mov not null,
  motivo         text not null,       -- 'Pago a proveedor', 'Retiro', 'Gasto'
  monto_centavos bigint not null,
  usuario_id     uuid references usuarios_comercio(id) on delete set null,
  creado_en      timestamptz not null default now()
);
create index on caja_movimientos (comercio_id, caja_sesion_id);

create table arqueos (
  id                   uuid primary key default gen_random_uuid(),
  comercio_id          uuid not null references comercios(id) on delete cascade,
  caja_sesion_id       uuid not null unique references caja_sesiones(id) on delete cascade,
  declarado_centavos   bigint not null,          -- lo que contó el empleado
  desglose             jsonb,                    -- {"20000": 3, "10000": 5, ...}
  esperado_centavos    bigint not null,          -- calculado por el servidor
  diferencia_centavos  bigint generated always as (declarado_centavos - esperado_centavos) stored,
  declarado_por        uuid references usuarios_comercio(id) on delete set null,
  declarado_en         timestamptz not null default now(),
  revisado_por         uuid references usuarios_comercio(id) on delete set null,
  revisado_en          timestamptz,
  nota_revision        text
);
create index on arqueos (comercio_id, declarado_en desc);

create table gastos (
  id             uuid primary key default gen_random_uuid(),
  comercio_id    uuid not null references comercios(id) on delete cascade,
  categoria      text not null,        -- 'Alquiler','Luz','Sueldos','Flete'
  descripcion    text,
  monto_centavos bigint not null,
  fecha          date not null default current_date,
  recurrente     boolean not null default false,
  usuario_id     uuid references usuarios_comercio(id) on delete set null,
  creado_en      timestamptz not null default now()
);
create index on gastos (comercio_id, fecha desc);

-- ============================================================================
-- VIDRIERA
-- ============================================================================
create table zonas_envio (
  id                     uuid primary key default gen_random_uuid(),
  comercio_id            uuid not null references comercios(id) on delete cascade,
  nombre                 text not null,
  costo_centavos         bigint not null default 0,
  monto_minimo_centavos  bigint not null default 0,
  activo                 boolean not null default true
);

create table pedidos_vidriera (
  id                   uuid primary key default gen_random_uuid(),
  comercio_id          uuid not null references comercios(id) on delete cascade,
  numero               bigint,
  nombre_cliente       text not null,
  telefono             text not null,
  direccion            text,
  tipo_entrega         tipo_entrega not null default 'RETIRO',
  zona_id              uuid references zonas_envio(id) on delete set null,
  costo_envio_centavos bigint not null default 0,
  total_centavos       bigint not null default 0,
  notas                text,
  estado               estado_pedido not null default 'NUEVO',
  venta_id             uuid references ventas(id) on delete set null,
  acepta_promos        boolean not null default false,   -- consentimiento explícito
  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now()
);
create index on pedidos_vidriera (comercio_id, estado, creado_en desc);

create table pedidos_items (
  id                       uuid primary key default gen_random_uuid(),
  pedido_id                uuid not null references pedidos_vidriera(id) on delete cascade,
  producto_id              uuid references productos(id) on delete set null,
  descripcion              text not null,
  tipo_venta               tipo_venta not null default 'UNIDAD',
  cantidad                 bigint not null,
  precio_unitario_centavos bigint not null,
  total_centavos           bigint not null
);
create index on pedidos_items (pedido_id);

-- ============================================================================
-- AUDITORÍA
-- ============================================================================
create table auditoria (
  id            uuid primary key default gen_random_uuid(),
  comercio_id   uuid not null references comercios(id) on delete cascade,
  usuario_id    uuid references usuarios_comercio(id) on delete set null,
  entidad       text not null,
  entidad_id    uuid,
  accion        text not null,        -- 'anular_venta','cambiar_precio','abrir_caja'
  datos_antes   jsonb,
  datos_despues jsonb,
  creado_en     timestamptz not null default now()
);
create index on auditoria (comercio_id, creado_en desc);
create index on auditoria (comercio_id, entidad, entidad_id);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- actualizado_en
create or replace function public.tg_actualizado_en()
returns trigger language plpgsql as $fn$
begin
  new.actualizado_en := now();
  return new;
end $fn$;

do $do$
declare t text;
begin
  foreach t in array array['comercios','config_comercio','usuarios_comercio','categorias',
                           'proveedores','productos','clientes','pedidos_vidriera']
  loop
    execute format(
      'create trigger trg_actualizado_en before update on %I
       for each row execute function public.tg_actualizado_en()', t);
  end loop;
end $do$;

-- stock_actual = suma del libro mayor
create or replace function public.tg_stock_actualizar()
returns trigger language plpgsql as $fn$
begin
  update productos
     set stock_actual = stock_actual + new.delta,
         actualizado_en = now()
   where id = new.producto_id;
  return new;
end $fn$;

create trigger trg_stock_actualizar
  after insert on movimientos_stock
  for each row execute function public.tg_stock_actualizar();

-- saldo de cuenta corriente
create or replace function public.tg_cc_saldo()
returns trigger language plpgsql as $fn$
begin
  update clientes
     set saldo_centavos = saldo_centavos +
           case new.tipo
             when 'CARGO' then  new.monto_centavos
             when 'PAGO'  then -new.monto_centavos
             else new.monto_centavos
           end,
         actualizado_en = now()
   where id = new.cliente_id;
  return new;
end $fn$;

create trigger trg_cc_saldo
  after insert on cuenta_corriente_movimientos
  for each row execute function public.tg_cc_saldo();

-- historial de precios
create or replace function public.tg_precio_historial()
returns trigger language plpgsql as $fn$
begin
  if new.precio_venta_centavos  is distinct from old.precio_venta_centavos
  or new.precio_por_kg_centavos is distinct from old.precio_por_kg_centavos
  or new.precio_costo_centavos  is distinct from old.precio_costo_centavos then
    insert into precios_historial (
      comercio_id, producto_id,
      precio_anterior_centavos, precio_nuevo_centavos,
      costo_anterior_centavos,  costo_nuevo_centavos, motivo)
    values (
      new.comercio_id, new.id,
      coalesce(old.precio_venta_centavos, old.precio_por_kg_centavos),
      coalesce(new.precio_venta_centavos, new.precio_por_kg_centavos),
      old.precio_costo_centavos, new.precio_costo_centavos,
      coalesce(current_setting('app.motivo_precio', true), 'manual'));
  end if;
  return new;
end $fn$;

create trigger trg_precio_historial
  after update on productos
  for each row execute function public.tg_precio_historial();

-- ARQUEO INMUTABLE: este es el control real del arqueo ciego.
-- Una vez declarado el efectivo contado, no se puede cambiar.
create or replace function public.tg_arqueo_inmutable()
returns trigger language plpgsql as $fn$
begin
  if new.declarado_centavos is distinct from old.declarado_centavos
  or new.desglose           is distinct from old.desglose
  or new.esperado_centavos  is distinct from old.esperado_centavos then
    raise exception 'El arqueo declarado es inmutable. Solo se puede agregar la revisión del dueño.';
  end if;
  return new;
end $fn$;

create trigger trg_arqueo_inmutable
  before update on arqueos
  for each row execute function public.tg_arqueo_inmutable();

-- ============================================================================
-- VISTAS
-- ============================================================================

-- Lo único que ve el público en la Vidriera (sin costo, sin stock exacto).
create view vidriera_productos
with (security_invoker = off) as
  select p.id, p.comercio_id, p.nombre, p.descripcion, p.categoria_id,
         p.tipo_venta, p.precio_venta_centavos, p.precio_por_kg_centavos,
         p.imagen_url, p.emoji, p.color,
         (not p.controla_stock or p.stock_actual > 0) as disponible
    from productos p
    join comercios c on c.id = p.comercio_id
   where p.visible_en_vidriera and p.activo and c.vidriera_activa and c.activo;

-- Productos por debajo del mínimo, agrupables por proveedor.
create view productos_a_reponer as
  select p.id, p.comercio_id, p.nombre, p.tipo_venta,
         p.stock_actual, p.stock_minimo,
         (p.stock_minimo - p.stock_actual) as faltante,
         p.factor_compra, p.unidad_compra,
         p.proveedor_id, pr.nombre as proveedor_nombre, pr.telefono as proveedor_telefono
    from productos p
    left join proveedores pr on pr.id = p.proveedor_id
   where p.activo and p.controla_stock
     and p.tipo_producto = 'FISICO'
     and p.stock_actual <= p.stock_minimo;

-- ============================================================================
-- RLS
-- ============================================================================
do $do$
declare t text;
begin
  foreach t in array array[
    'comercios','config_comercio','usuarios_comercio','dispositivos','categorias',
    'proveedores','productos','precios_historial','teclas_rapidas','movimientos_stock',
    'compras','compras_items','clientes','ventas','ventas_items','ventas_pagos',
    'cuenta_corriente_movimientos','caja_sesiones','caja_movimientos','arqueos',
    'gastos','zonas_envio','pedidos_vidriera','pedidos_items','auditoria']
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $do$;

-- Patrón estándar para las tablas con comercio_id directo.
do $do$
declare t text;
begin
  foreach t in array array[
    'config_comercio','usuarios_comercio','dispositivos','categorias','proveedores',
    'productos','precios_historial','teclas_rapidas','movimientos_stock','compras',
    'clientes','ventas','cuenta_corriente_movimientos','caja_sesiones',
    'caja_movimientos','gastos','zonas_envio','pedidos_vidriera','auditoria']
  loop
    execute format(
      'create policy %I_tenant on %I for all to authenticated
         using (comercio_id = public.comercio_id())
         with check (comercio_id = public.comercio_id())', t, t);
  end loop;
end $do$;

-- Tablas hijas: heredan el tenant del padre.
create policy ventas_items_tenant on ventas_items for all to authenticated
  using      (exists (select 1 from ventas v where v.id = venta_id and v.comercio_id = public.comercio_id()))
  with check (exists (select 1 from ventas v where v.id = venta_id and v.comercio_id = public.comercio_id()));

create policy ventas_pagos_tenant on ventas_pagos for all to authenticated
  using      (exists (select 1 from ventas v where v.id = venta_id and v.comercio_id = public.comercio_id()))
  with check (exists (select 1 from ventas v where v.id = venta_id and v.comercio_id = public.comercio_id()));

create policy compras_items_tenant on compras_items for all to authenticated
  using      (exists (select 1 from compras c where c.id = compra_id and c.comercio_id = public.comercio_id()))
  with check (exists (select 1 from compras c where c.id = compra_id and c.comercio_id = public.comercio_id()));

create policy pedidos_items_tenant on pedidos_items for all to authenticated
  using      (exists (select 1 from pedidos_vidriera p where p.id = pedido_id and p.comercio_id = public.comercio_id()))
  with check (exists (select 1 from pedidos_vidriera p where p.id = pedido_id and p.comercio_id = public.comercio_id()));

create policy comercios_propio on comercios for all to authenticated
  using (id = public.comercio_id()) with check (id = public.comercio_id());

-- La Vidriera pública (rol anon) necesita leer el comercio para resolver el
-- slug, y su configuración y zonas de envío para armar el checkout. Sin esto
-- /t/[slug] da 404 aunque vidriera_productos ya esté expuesta: RLS bloquea el
-- SELECT sobre comercios ANTES de que la página llegue a pedir productos.
create policy comercios_publicos on comercios for select to anon
  using (vidriera_activa and activo);

create policy config_comercio_publica on config_comercio for select to anon
  using (exists (select 1 from comercios c
                  where c.id = comercio_id and c.vidriera_activa and c.activo));

create policy zonas_envio_publicas on zonas_envio for select to anon
  using (activo and exists (select 1 from comercios c
                              where c.id = comercio_id and c.vidriera_activa and c.activo));

-- ARQUEOS: el empleado puede INSERTAR su declaración pero NO puede leer la fila.
-- Así el efectivo esperado nunca viaja a su dispositivo.
create policy arqueos_insert on arqueos for insert to authenticated
  with check (comercio_id = public.comercio_id());

create policy arqueos_select_dueno on arqueos for select to authenticated
  using (comercio_id = public.comercio_id() and public.es_dueno());

create policy arqueos_update_dueno on arqueos for update to authenticated
  using (comercio_id = public.comercio_id() and public.es_dueno());

-- GASTOS y COSTOS: solo el dueño.
drop policy gastos_tenant on gastos;
create policy gastos_solo_dueno on gastos for all to authenticated
  using (comercio_id = public.comercio_id() and public.es_dueno())
  with check (comercio_id = public.comercio_id() and public.es_dueno());

-- Catálogo base: lectura para todos los autenticados, escritura solo service_role.
alter table catalogo_base enable row level security;
create policy catalogo_base_lectura on catalogo_base for select to authenticated using (true);

-- Vidriera pública (rol anon).
grant select on vidriera_productos to anon;
grant select on categorias to anon;
create policy categorias_publicas on categorias for select to anon
  using (exists (select 1 from comercios c
                  where c.id = comercio_id and c.vidriera_activa and c.activo));

create policy pedidos_crear_publico on pedidos_vidriera for insert to anon
  with check (exists (select 1 from comercios c
                       where c.id = comercio_id and c.vidriera_activa and c.activo));

create policy pedidos_items_crear_publico on pedidos_items for insert to anon
  with check (exists (select 1 from pedidos_vidriera p where p.id = pedido_id));

-- ============================================================================
-- M1 · AUTENTICACIÓN, TENANT Y PIN
-- ============================================================================

-- El hook que mete comercio_id y rol en el JWT. Sin esto, cada política RLS
-- necesitaría un JOIN contra usuarios_comercio en cada consulta.
-- Configurar en Supabase: Authentication > Hooks > Custom Access Token.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable as $fn$
declare
  claims jsonb;
  u record;
begin
  select comercio_id, rol into u
    from public.usuarios_comercio
   where id = (event ->> 'user_id')::uuid and activo;

  claims := coalesce(event -> 'claims' -> 'app_metadata', '{}'::jsonb);

  if u.comercio_id is not null then
    claims := claims
      || jsonb_build_object('comercio_id', u.comercio_id)
      || jsonb_build_object('rol', u.rol);
  end if;

  return jsonb_set(event, '{claims,app_metadata}', claims);
end $fn$;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

grant select on public.usuarios_comercio to supabase_auth_admin;
create policy usuarios_lectura_auth_admin on public.usuarios_comercio
  for select to supabase_auth_admin using (true);

-- ----------------------------------------------------------------------------
-- PIN de 4 dígitos. bcrypt, validado SIEMPRE en el servidor.
-- No es una credencial de login: sirve para cambiar de operador dentro de un
-- dispositivo ya autenticado y para autorizar acciones sensibles.
--
-- OJO con el search_path: estas cuatro funciones usan crypt()/gen_salt() de
-- pgcrypto, y Supabase instala esa extension en el esquema `extensions`, no en
-- `public`. Con `set search_path = public` a secas, crypt() no se resuelve y el
-- RPC falla con 42883 -- que del lado del cliente se veia como "sin conexion".
-- ----------------------------------------------------------------------------

create or replace function public.definir_pin(p_usuario_id uuid, p_pin text)
returns boolean language plpgsql security definer set search_path = public, extensions as $fn$
declare v_comercio uuid := public.comercio_id();
begin
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'El PIN tiene que ser de 4 dígitos';
  end if;

  -- El dueño le pone el PIN a cualquiera de su comercio; el empleado, solo al suyo.
  if not public.es_dueno() and p_usuario_id <> auth.uid() then
    raise exception 'No podés cambiar el PIN de otra persona';
  end if;

  update usuarios_comercio
     set pin_hash = crypt(p_pin, gen_salt('bf', 10))
   where id = p_usuario_id and comercio_id = v_comercio;

  if not found then raise exception 'Usuario inexistente en este comercio'; end if;

  insert into auditoria (comercio_id, usuario_id, entidad, entidad_id, accion)
  values (v_comercio, auth.uid(), 'usuarios_comercio', p_usuario_id, 'definir_pin');

  return true;
end $fn$;

create or replace function public.validar_pin(p_usuario_id uuid, p_pin text)
returns boolean language plpgsql security definer set search_path = public, extensions as $fn$
declare v_hash text;
begin
  select pin_hash into v_hash
    from usuarios_comercio
   where id = p_usuario_id and comercio_id = public.comercio_id() and activo;

  if v_hash is null then return false; end if;
  return v_hash = crypt(p_pin, v_hash);
end $fn$;

-- Igual que la anterior pero exigiendo rol dueño: es la que usa el modal de
-- autorización (anular, descuento, exceder límite de crédito).
create or replace function public.validar_pin_dueno(p_usuario_id uuid, p_pin text)
returns boolean language plpgsql security definer set search_path = public, extensions as $fn$
declare v_hash text;
begin
  select pin_hash into v_hash
    from usuarios_comercio
   where id = p_usuario_id and comercio_id = public.comercio_id()
     and activo and rol = 'dueno';

  if v_hash is null then return false; end if;
  return v_hash = crypt(p_pin, v_hash);
end $fn$;

-- Los operadores que ve el POS. El pin_hash NO se expone acá: el cambio de
-- operador sin conexión usa el hash que el propio dispositivo cacheó al
-- sincronizar (ver lib/db/operadores.ts).
create or replace view usuarios_pos with (security_invoker = off) as
  select id, comercio_id, nombre, rol, activo
    from usuarios_comercio
   where comercio_id = public.comercio_id() and activo;
grant select on usuarios_pos to authenticated;

-- ----------------------------------------------------------------------------
-- LO QUE NO DEBE VER EL EMPLEADO, NO DEBE VIAJAR.
--
-- RLS filtra filas, no columnas. Para los costos y los márgenes se usa el
-- privilegio por columna: se revoca el SELECT de tabla y se vuelve a otorgar
-- columna por columna, dejando afuera lo sensible. El acceso del dueño va por
-- vistas dedicadas.
--
-- Consecuencia para el cliente: nunca `select *` sobre estas tablas.
-- ----------------------------------------------------------------------------

revoke select on productos from authenticated;
grant select (
  id, comercio_id, categoria_id, proveedor_id,
  nombre, nombre_norm, alias, descripcion, codigo_barras,
  tipo_producto, tipo_venta,
  precio_venta_centavos, precio_por_kg_centavos,
  controla_stock, stock_actual, stock_minimo,
  factor_compra, unidad_compra,
  vence, fecha_vencimiento,
  visible_en_vidriera, color, emoji, imagen_url,
  activo, creado_en, actualizado_en
) on productos to authenticated;

revoke select on ventas from authenticated;
grant select (
  id, comercio_id, numero, usuario_id, dispositivo_id, caja_sesion_id, cliente_id,
  subtotal_centavos, descuento_centavos, total_centavos,
  estado, origen, anulada_por, anulada_en, motivo_anulacion,
  tipo_comprobante, punto_venta, numero_comprobante, cae, cae_vencimiento,
  cuit_receptor, condicion_iva_receptor,
  creado_en, sincronizado_en
) on ventas to authenticated;

revoke select on ventas_items from authenticated;
grant select (
  id, venta_id, producto_id, descripcion, tipo_venta,
  cantidad, precio_unitario_centavos, total_centavos
) on ventas_items to authenticated;

-- Costos y comisiones: solo el dueño, y por una vista aparte.
create or replace view productos_costos with (security_invoker = off) as
  select id, comercio_id, precio_costo_centavos, comision_pct, comision_fija_centavos
    from productos
   where comercio_id = public.comercio_id() and public.es_dueno();
grant select on productos_costos to authenticated;

create or replace view ventas_costos with (security_invoker = off) as
  select id, comercio_id, costo_total_centavos
    from ventas
   where comercio_id = public.comercio_id() and public.es_dueno();
grant select on ventas_costos to authenticated;

-- El catálogo y los clientes los edita solo el dueño. El alta express del POS
-- (producto o cliente nuevo en medio de una venta) es un INSERT, y ese sí lo
-- puede hacer cualquiera: sin eso el mostrador se traba.
drop policy productos_tenant on productos;
create policy productos_lectura on productos for select to authenticated
  using (comercio_id = public.comercio_id());
create policy productos_alta on productos for insert to authenticated
  with check (comercio_id = public.comercio_id());
create policy productos_edicion_dueno on productos for update to authenticated
  using (comercio_id = public.comercio_id() and public.es_dueno())
  with check (comercio_id = public.comercio_id() and public.es_dueno());
create policy productos_baja_dueno on productos for delete to authenticated
  using (comercio_id = public.comercio_id() and public.es_dueno());

drop policy clientes_tenant on clientes;
create policy clientes_lectura on clientes for select to authenticated
  using (comercio_id = public.comercio_id());
create policy clientes_alta on clientes for insert to authenticated
  with check (comercio_id = public.comercio_id());
create policy clientes_edicion_dueno on clientes for update to authenticated
  using (comercio_id = public.comercio_id() and public.es_dueno())
  with check (comercio_id = public.comercio_id() and public.es_dueno());

-- Regla de oro #8: las ventas son append-only. No se editan ni se borran:
-- se anulan por RPC, que deja rastro en auditoria.
drop policy ventas_tenant on ventas;
create policy ventas_lectura on ventas for select to authenticated
  using (comercio_id = public.comercio_id());
create policy ventas_alta on ventas for insert to authenticated
  with check (comercio_id = public.comercio_id());

-- La auditoría no se escribe desde el cliente: la escriben los RPC.
drop policy auditoria_tenant on auditoria;
create policy auditoria_lectura_dueno on auditoria for select to authenticated
  using (comercio_id = public.comercio_id() and public.es_dueno());

-- Regla de oro #3: el libro mayor de stock no se edita a mano.
drop policy movimientos_stock_tenant on movimientos_stock;
create policy movimientos_stock_lectura on movimientos_stock for select to authenticated
  using (comercio_id = public.comercio_id());

-- Precios: el historial lo lee el dueño, lo escribe el trigger.
drop policy precios_historial_tenant on precios_historial;
create policy precios_historial_lectura_dueno on precios_historial for select to authenticated
  using (comercio_id = public.comercio_id() and public.es_dueno());

-- ============================================================================
-- RPCs
--
-- Todo lo que necesita atomicidad pasa por acá, no por varios INSERT sueltos
-- del cliente. Las que reciben `payload jsonb` son las que consume el outbox:
-- son IDEMPOTENTES por el id que genera el cliente (UUID v7), así reenviar la
-- misma operación diez veces produce exactamente una fila.
--
-- Todas son `security definer`, así que lo primero que hacen es verificar el
-- tenant contra el JWT. Nunca confían en el comercio_id que viene en el payload.
-- ============================================================================

-- Helper: falla si el payload pretende escribir en otro comercio.
create or replace function public.exigir_tenant(p_comercio uuid)
returns uuid language plpgsql stable as $fn$
declare v uuid := public.comercio_id();
begin
  if v is null then
    raise exception 'Sesión sin comercio asignado' using errcode = '42501';
  end if;
  if p_comercio is not null and p_comercio <> v then
    raise exception 'El dato pertenece a otro comercio' using errcode = '42501';
  end if;
  return v;
end $fn$;

create or replace function public.exigir_dueno()
returns void language plpgsql stable as $fn$
begin
  if not public.es_dueno() then
    raise exception 'Esta acción es solo del dueño' using errcode = '42501';
  end if;
end $fn$;

-- Correlativo por comercio. El advisory lock evita que dos ventas simultáneas
-- se lleven el mismo número sin necesidad de una secuencia por tenant.
create or replace function public.siguiente_numero_venta(p_comercio uuid)
returns bigint language plpgsql as $fn$
declare v bigint;
begin
  perform pg_advisory_xact_lock(hashtext('venta:' || p_comercio::text));
  select coalesce(max(numero), 0) + 1 into v from ventas where comercio_id = p_comercio;
  return v;
end $fn$;

-- El costo de un item lo pone el SERVIDOR, nunca el cliente: el empleado no
-- puede leer los costos, así que tampoco puede mandarlos.
create or replace function public.costo_item(
  p_producto uuid, p_tipo_venta tipo_venta, p_cantidad bigint)
returns bigint language plpgsql stable as $fn$
declare v_costo bigint;
begin
  select precio_costo_centavos into v_costo from productos where id = p_producto;
  if v_costo is null then return 0; end if;
  -- En PESO el costo cargado es por kilo y la cantidad viene en gramos.
  if p_tipo_venta = 'PESO' then
    return round(p_cantidad::numeric * v_costo / 1000);
  end if;
  return v_costo * p_cantidad;
end $fn$;

-- ----------------------------------------------------------------------------
-- M2 · sync_venta — el corazón del offline
-- ----------------------------------------------------------------------------
create or replace function public.sync_venta(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_comercio   uuid := public.exigir_tenant((payload ->> 'comercio_id')::uuid);
  v_venta_id   uuid := (payload ->> 'id')::uuid;
  v_numero     bigint;
  v_costo_tot  bigint := 0;
  v_costo_item bigint;
  v_item       jsonb;
  v_pago       jsonb;
  v_fiado      bigint := 0;
  v_existente  ventas%rowtype;
begin
  -- Idempotencia: si ya está, se devuelve lo que hay y se corta.
  select * into v_existente from ventas where id = v_venta_id;
  if found then
    return jsonb_build_object('id', v_existente.id, 'numero', v_existente.numero,
                              'estado', v_existente.estado, 'duplicada', true);
  end if;

  v_numero := public.siguiente_numero_venta(v_comercio);

  insert into ventas (
    id, comercio_id, numero, usuario_id, dispositivo_id, caja_sesion_id, cliente_id,
    subtotal_centavos, descuento_centavos, total_centavos, costo_total_centavos,
    estado, origen, creado_en)
  values (
    v_venta_id, v_comercio, v_numero,
    (payload ->> 'usuario_id')::uuid,
    (payload ->> 'dispositivo_id')::uuid,
    (payload ->> 'caja_sesion_id')::uuid,
    (payload ->> 'cliente_id')::uuid,
    (payload ->> 'subtotal_centavos')::bigint,
    coalesce((payload ->> 'descuento_centavos')::bigint, 0),
    (payload ->> 'total_centavos')::bigint,
    0,
    'COMPLETADA',
    coalesce((payload ->> 'origen')::origen_venta, 'POS'),
    (payload ->> 'creado_en')::timestamptz)
  on conflict (id) do nothing;

  for v_item in select * from jsonb_array_elements(payload -> 'items') loop
    v_costo_item := coalesce(
      public.costo_item((v_item ->> 'producto_id')::uuid,
                        (v_item ->> 'tipo_venta')::tipo_venta,
                        (v_item ->> 'cantidad')::bigint), 0);
    v_costo_tot := v_costo_tot + v_costo_item;

    insert into ventas_items (
      id, venta_id, producto_id, descripcion, tipo_venta,
      cantidad, precio_unitario_centavos, costo_unitario_centavos, total_centavos)
    values (
      (v_item ->> 'id')::uuid, v_venta_id, (v_item ->> 'producto_id')::uuid,
      v_item ->> 'descripcion', (v_item ->> 'tipo_venta')::tipo_venta,
      (v_item ->> 'cantidad')::bigint,
      (v_item ->> 'precio_unitario_centavos')::bigint,
      v_costo_item,
      (v_item ->> 'total_centavos')::bigint)
    on conflict (id) do nothing;

    -- Regla de oro #3: el stock se mueve por DELTAS en el libro mayor.
    -- Los servicios (recargas, SUBE) no tienen stock que descontar.
    if (v_item ->> 'producto_id') is not null then
      insert into movimientos_stock (comercio_id, producto_id, delta, motivo, referencia_id, usuario_id)
      select v_comercio, p.id, -(v_item ->> 'cantidad')::bigint, 'VENTA', v_venta_id,
             (payload ->> 'usuario_id')::uuid
        from productos p
       where p.id = (v_item ->> 'producto_id')::uuid
         and p.comercio_id = v_comercio
         and p.controla_stock
         and p.tipo_producto = 'FISICO';
    end if;
  end loop;

  update ventas set costo_total_centavos = v_costo_tot where id = v_venta_id;

  for v_pago in select * from jsonb_array_elements(payload -> 'pagos') loop
    insert into ventas_pagos (id, venta_id, medio, monto_centavos, recibido_centavos, vuelto_centavos, referencia)
    values (
      (v_pago ->> 'id')::uuid, v_venta_id, (v_pago ->> 'medio')::medio_pago,
      (v_pago ->> 'monto_centavos')::bigint,
      (v_pago ->> 'recibido_centavos')::bigint,
      (v_pago ->> 'vuelto_centavos')::bigint,
      v_pago ->> 'referencia')
    on conflict (id) do nothing;

    if (v_pago ->> 'medio') = 'FIADO' then
      v_fiado := v_fiado + (v_pago ->> 'monto_centavos')::bigint;
    end if;
  end loop;

  -- El fiado carga la cuenta corriente en la misma transacción que la venta.
  if v_fiado > 0 then
    if (payload ->> 'cliente_id') is null then
      raise exception 'Un fiado necesita un cliente';
    end if;
    insert into cuenta_corriente_movimientos (
      comercio_id, cliente_id, tipo, monto_centavos, venta_id, medio, usuario_id)
    values (v_comercio, (payload ->> 'cliente_id')::uuid, 'CARGO', v_fiado,
            v_venta_id, 'FIADO', (payload ->> 'usuario_id')::uuid);
  end if;

  return jsonb_build_object('id', v_venta_id, 'numero', v_numero, 'estado', 'COMPLETADA');
end $fn$;

-- ----------------------------------------------------------------------------
-- anular_venta — regla de oro #8: no se borra, se anula y queda el rastro.
-- ----------------------------------------------------------------------------
create or replace function public.anular_venta(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_comercio uuid := public.exigir_tenant(null);
  v_venta    ventas%rowtype;
  v_item     record;
  v_fiado    bigint;
  v_autoriza uuid := (payload ->> 'autorizado_por')::uuid;
  v_pin      text := payload ->> 'pin';
  v_offline  boolean := coalesce((payload ->> 'autorizada_offline')::boolean, false);
begin
  select * into v_venta from ventas
   where id = (payload ->> 'venta_id')::uuid and comercio_id = v_comercio;
  if not found then raise exception 'La venta no existe'; end if;

  if v_venta.estado = 'ANULADA' then
    return jsonb_build_object('id', v_venta.id, 'estado', 'ANULADA', 'duplicada', true);
  end if;

  -- El empleado necesita el PIN del dueño. Si lo autorizó sin conexión, se
  -- registra igual pero marcado, para que el dueño lo vea en la auditoría.
  if not public.es_dueno() and not v_offline then
    if v_autoriza is null or v_pin is null
       or not public.validar_pin_dueno(v_autoriza, v_pin) then
      raise exception 'Anular una venta necesita el PIN del dueño' using errcode = '42501';
    end if;
  end if;

  update ventas
     set estado = 'ANULADA',
         anulada_por = coalesce(v_autoriza, (payload ->> 'usuario_id')::uuid),
         anulada_en = coalesce((payload ->> 'anulada_en')::timestamptz, now()),
         motivo_anulacion = payload ->> 'motivo'
   where id = v_venta.id;

  -- Devuelve el stock con un movimiento propio: el libro mayor no se reescribe.
  for v_item in
    select vi.producto_id, vi.cantidad
      from ventas_items vi
      join productos p on p.id = vi.producto_id
     where vi.venta_id = v_venta.id and p.controla_stock and p.tipo_producto = 'FISICO'
  loop
    insert into movimientos_stock (comercio_id, producto_id, delta, motivo, referencia_id, usuario_id, nota)
    values (v_comercio, v_item.producto_id, v_item.cantidad, 'ANULACION', v_venta.id,
            (payload ->> 'usuario_id')::uuid, payload ->> 'motivo');
  end loop;

  -- Si era fiada, se revierte el cargo con un AJUSTE negativo.
  select coalesce(sum(monto_centavos), 0) into v_fiado
    from ventas_pagos where venta_id = v_venta.id and medio = 'FIADO';

  if v_fiado > 0 and v_venta.cliente_id is not null then
    insert into cuenta_corriente_movimientos (
      comercio_id, cliente_id, tipo, monto_centavos, venta_id, nota, usuario_id)
    values (v_comercio, v_venta.cliente_id, 'AJUSTE', -v_fiado, v_venta.id,
            'Anulación de venta', (payload ->> 'usuario_id')::uuid);
  end if;

  insert into auditoria (comercio_id, usuario_id, entidad, entidad_id, accion, datos_antes, datos_despues)
  values (v_comercio, (payload ->> 'usuario_id')::uuid, 'ventas', v_venta.id, 'anular_venta',
          jsonb_build_object('total_centavos', v_venta.total_centavos, 'numero', v_venta.numero),
          jsonb_build_object('motivo', payload ->> 'motivo',
                             'autorizado_por', v_autoriza,
                             'autorizada_offline', v_offline));

  return jsonb_build_object('id', v_venta.id, 'estado', 'ANULADA');
end $fn$;

-- ----------------------------------------------------------------------------
-- M5 · Caja
-- ----------------------------------------------------------------------------
create or replace function public.abrir_caja(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_comercio uuid := public.exigir_tenant((payload ->> 'comercio_id')::uuid);
  v_id uuid := (payload ->> 'id')::uuid;
  v_abierta caja_sesiones%rowtype;
begin
  select * into v_abierta from caja_sesiones where id = v_id;
  if found then
    return jsonb_build_object('id', v_abierta.id, 'duplicada', true);
  end if;

  select * into v_abierta from caja_sesiones
   where comercio_id = v_comercio
     and dispositivo_id = (payload ->> 'dispositivo_id')::uuid
     and estado = 'ABIERTA';
  if found then
    return jsonb_build_object('id', v_abierta.id, 'ya_abierta', true,
                              'abierta_en', v_abierta.abierta_en);
  end if;

  insert into caja_sesiones (id, comercio_id, dispositivo_id, usuario_id,
                             fondo_inicial_centavos, estado, abierta_en)
  values (v_id, v_comercio,
          (payload ->> 'dispositivo_id')::uuid,
          (payload ->> 'usuario_id')::uuid,
          coalesce((payload ->> 'fondo_inicial_centavos')::bigint, 0),
          'ABIERTA',
          coalesce((payload ->> 'abierta_en')::timestamptz, now()));

  insert into auditoria (comercio_id, usuario_id, entidad, entidad_id, accion, datos_despues)
  values (v_comercio, (payload ->> 'usuario_id')::uuid, 'caja_sesiones', v_id, 'abrir_caja',
          jsonb_build_object('fondo_inicial_centavos', payload ->> 'fondo_inicial_centavos'));

  return jsonb_build_object('id', v_id, 'estado', 'ABIERTA');
end $fn$;

create or replace function public.registrar_movimiento_caja(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_comercio uuid := public.exigir_tenant((payload ->> 'comercio_id')::uuid);
  v_id uuid := (payload ->> 'id')::uuid;
begin
  insert into caja_movimientos (id, comercio_id, caja_sesion_id, tipo, motivo, monto_centavos, usuario_id, creado_en)
  values (v_id, v_comercio, (payload ->> 'caja_sesion_id')::uuid,
          (payload ->> 'tipo')::tipo_caja_mov, payload ->> 'motivo',
          (payload ->> 'monto_centavos')::bigint, (payload ->> 'usuario_id')::uuid,
          coalesce((payload ->> 'creado_en')::timestamptz, now()))
  on conflict (id) do nothing;

  return jsonb_build_object('id', v_id);
end $fn$;

-- El efectivo esperado se calcula SIEMPRE acá, en el servidor, y solo se
-- devuelve si quien cierra es el dueño. Ese es el arqueo ciego.
create or replace function public.esperado_de_caja(p_sesion uuid)
returns bigint language plpgsql stable security definer set search_path = public as $fn$
declare
  v caja_sesiones%rowtype;
  v_ventas bigint;
  v_ingresos bigint;
  v_egresos bigint;
  v_cobros bigint;
begin
  select * into v from caja_sesiones where id = p_sesion;
  if not found then raise exception 'Sesión de caja inexistente'; end if;

  select coalesce(sum(vp.monto_centavos), 0) into v_ventas
    from ventas_pagos vp
    join ventas ve on ve.id = vp.venta_id
   where ve.caja_sesion_id = p_sesion
     and ve.estado = 'COMPLETADA'
     and vp.medio = 'EFECTIVO';

  select coalesce(sum(monto_centavos) filter (where tipo = 'INGRESO'), 0),
         coalesce(sum(monto_centavos) filter (where tipo = 'EGRESO'), 0)
    into v_ingresos, v_egresos
    from caja_movimientos where caja_sesion_id = p_sesion;

  -- Los cobros de fiado en efectivo entran como INGRESO de caja al registrarse,
  -- así que ya están contados arriba. Se dejan explícitos en 0 para que el
  -- cálculo se lea igual que en la spec y no se sumen dos veces.
  v_cobros := 0;

  return v.fondo_inicial_centavos + v_ventas + v_ingresos + v_cobros - v_egresos;
end $fn$;

create or replace function public.cerrar_caja(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_comercio uuid := public.exigir_tenant((payload ->> 'comercio_id')::uuid);
  v_sesion   uuid := (payload ->> 'caja_sesion_id')::uuid;
  v_id       uuid := (payload ->> 'id')::uuid;
  v_declarado bigint := (payload ->> 'declarado_centavos')::bigint;
  v_esperado bigint;
  v_arqueo   arqueos%rowtype;
begin
  select * into v_arqueo from arqueos where caja_sesion_id = v_sesion;
  if found then
    if public.es_dueno() then
      return jsonb_build_object('id', v_arqueo.id, 'duplicada', true,
                                'esperado', v_arqueo.esperado_centavos,
                                'declarado', v_arqueo.declarado_centavos,
                                'diferencia', v_arqueo.diferencia_centavos);
    end if;
    return jsonb_build_object('ok', true, 'duplicada', true,
                              'declarado', v_arqueo.declarado_centavos);
  end if;

  perform 1 from caja_sesiones where id = v_sesion and comercio_id = v_comercio;
  if not found then raise exception 'Sesión de caja inexistente'; end if;

  v_esperado := public.esperado_de_caja(v_sesion);

  insert into arqueos (id, comercio_id, caja_sesion_id, declarado_centavos, desglose,
                       esperado_centavos, declarado_por, declarado_en)
  values (coalesce(v_id, gen_random_uuid()), v_comercio, v_sesion, v_declarado,
          payload -> 'desglose', v_esperado,
          (payload ->> 'declarado_por')::uuid,
          coalesce((payload ->> 'declarado_en')::timestamptz, now()));

  update caja_sesiones set estado = 'CERRADA', cerrada_en = now() where id = v_sesion;

  insert into auditoria (comercio_id, usuario_id, entidad, entidad_id, accion, datos_despues)
  values (v_comercio, (payload ->> 'declarado_por')::uuid, 'arqueos', v_sesion, 'cerrar_caja',
          jsonb_build_object('declarado_centavos', v_declarado));

  -- El empleado NO recibe el esperado ni la diferencia. No es que se esconda en
  -- la UI: no viaja en la respuesta.
  if public.es_dueno() then
    return jsonb_build_object('esperado', v_esperado, 'declarado', v_declarado,
                              'diferencia', v_declarado - v_esperado);
  end if;
  return jsonb_build_object('ok', true, 'declarado', v_declarado);
end $fn$;

-- ----------------------------------------------------------------------------
-- M6 · Cuentas corrientes
-- ----------------------------------------------------------------------------
create or replace function public.registrar_cobro_cc(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_comercio uuid := public.exigir_tenant((payload ->> 'comercio_id')::uuid);
  v_id     uuid := (payload ->> 'id')::uuid;
  v_cliente uuid := (payload ->> 'cliente_id')::uuid;
  v_monto  bigint := (payload ->> 'monto_centavos')::bigint;
  v_medio  medio_pago := (payload ->> 'medio')::medio_pago;
  v_sesion uuid := (payload ->> 'caja_sesion_id')::uuid;
  v_saldo  bigint;
begin
  if exists (select 1 from cuenta_corriente_movimientos where id = v_id) then
    select saldo_centavos into v_saldo from clientes where id = v_cliente;
    return jsonb_build_object('id', v_id, 'duplicada', true, 'saldo', v_saldo);
  end if;

  insert into cuenta_corriente_movimientos (
    id, comercio_id, cliente_id, tipo, monto_centavos, medio, nota, usuario_id, creado_en)
  values (v_id, v_comercio, v_cliente, 'PAGO', v_monto, v_medio,
          payload ->> 'nota', (payload ->> 'usuario_id')::uuid,
          coalesce((payload ->> 'creado_en')::timestamptz, now()));

  -- SIN ESTE PASO EL ARQUEO CIERRA MAL. Es el error más común de los sistemas
  -- que tienen fiados: el cobro entra al mostrador y nunca aparece en la caja.
  if v_medio = 'EFECTIVO' and v_sesion is not null then
    insert into caja_movimientos (comercio_id, caja_sesion_id, tipo, motivo, monto_centavos, usuario_id)
    values (v_comercio, v_sesion, 'INGRESO',
            'Cobro de fiado', v_monto, (payload ->> 'usuario_id')::uuid);
  end if;

  select saldo_centavos into v_saldo from clientes where id = v_cliente;
  return jsonb_build_object('id', v_id, 'saldo', v_saldo, 'al_dia', v_saldo <= 0);
end $fn$;

-- ----------------------------------------------------------------------------
-- M4 · Inventario
-- ----------------------------------------------------------------------------
create or replace function public.registrar_ajuste_stock(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_comercio uuid := public.exigir_tenant((payload ->> 'comercio_id')::uuid);
  v_id uuid := (payload ->> 'id')::uuid;
  v_stock bigint;
begin
  perform public.exigir_dueno();

  if exists (select 1 from movimientos_stock where id = v_id) then
    select stock_actual into v_stock from productos where id = (payload ->> 'producto_id')::uuid;
    return jsonb_build_object('id', v_id, 'duplicada', true, 'stock_actual', v_stock);
  end if;

  insert into movimientos_stock (id, comercio_id, producto_id, delta, motivo, nota, usuario_id, creado_en)
  values (v_id, v_comercio, (payload ->> 'producto_id')::uuid,
          (payload ->> 'delta')::bigint, (payload ->> 'motivo')::motivo_stock,
          payload ->> 'nota', (payload ->> 'usuario_id')::uuid,
          coalesce((payload ->> 'creado_en')::timestamptz, now()));

  insert into auditoria (comercio_id, usuario_id, entidad, entidad_id, accion, datos_despues)
  values (v_comercio, (payload ->> 'usuario_id')::uuid, 'movimientos_stock', v_id, 'ajuste_stock',
          jsonb_build_object('delta', payload ->> 'delta', 'motivo', payload ->> 'motivo'));

  select stock_actual into v_stock from productos where id = (payload ->> 'producto_id')::uuid;
  return jsonb_build_object('id', v_id, 'stock_actual', v_stock);
end $fn$;

create or replace function public.aplicar_compra(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_comercio uuid := public.exigir_tenant((payload ->> 'comercio_id')::uuid);
  v_id uuid := (payload ->> 'id')::uuid;
  v_item jsonb;
  v_costo_unitario bigint;
begin
  perform public.exigir_dueno();

  if exists (select 1 from compras where id = v_id) then
    return jsonb_build_object('id', v_id, 'duplicada', true);
  end if;

  insert into compras (id, comercio_id, proveedor_id, total_centavos, nota, usuario_id, creado_en)
  values (v_id, v_comercio, (payload ->> 'proveedor_id')::uuid,
          coalesce((payload ->> 'total_centavos')::bigint, 0),
          payload ->> 'nota', (payload ->> 'usuario_id')::uuid,
          coalesce((payload ->> 'creado_en')::timestamptz, now()));

  for v_item in select * from jsonb_array_elements(payload -> 'items') loop
    insert into compras_items (id, compra_id, producto_id, cantidad_compra, delta_stock, costo_unitario_centavos)
    values ((v_item ->> 'id')::uuid, v_id, (v_item ->> 'producto_id')::uuid,
            (v_item ->> 'cantidad_compra')::numeric,
            (v_item ->> 'delta_stock')::bigint,
            coalesce((v_item ->> 'costo_unitario_centavos')::bigint, 0));

    insert into movimientos_stock (comercio_id, producto_id, delta, motivo, referencia_id, usuario_id)
    values (v_comercio, (v_item ->> 'producto_id')::uuid,
            (v_item ->> 'delta_stock')::bigint, 'COMPRA', v_id,
            (payload ->> 'usuario_id')::uuid);

    -- El costo llega por unidad de COMPRA; se guarda por unidad de VENTA.
    v_costo_unitario := coalesce((v_item ->> 'costo_unitario_centavos')::bigint, 0);
    if v_costo_unitario > 0 then
      perform set_config('app.motivo_precio', 'compra', true);
      update productos p
         set precio_costo_centavos = round(v_costo_unitario::numeric / greatest(p.factor_compra, 1))
       where p.id = (v_item ->> 'producto_id')::uuid and p.comercio_id = v_comercio;
    end if;
  end loop;

  return jsonb_build_object('id', v_id, 'ok', true);
end $fn$;

-- ----------------------------------------------------------------------------
-- M7 · Precios e inflación
-- ----------------------------------------------------------------------------

-- Redondeo del lado del servidor. Espeja lib/money.ts: media vuelta hacia
-- arriba en valor absoluto. Si cambia uno, cambia el otro.
create or replace function public.redondear_centavos(p_centavos bigint, p_unidad integer)
returns bigint language sql immutable as $fn$
  select case
    when p_unidad is null or p_unidad <= 1 then p_centavos
    else sign(p_centavos)::bigint *
         ((abs(p_centavos) / p_unidad
           + case when (abs(p_centavos) % p_unidad) * 2 >= p_unidad then 1 else 0 end) * p_unidad)
  end
$fn$;

-- Vista previa y aplicación de una actualización masiva. `p_aplicar = false`
-- devuelve el antes/después sin tocar nada: la pantalla siempre muestra la
-- previa antes de confirmar.
create or replace function public.actualizar_precios_masivo(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_comercio uuid := public.exigir_tenant(null);
  v_pct numeric := (payload ->> 'pct')::numeric;
  v_redondeo integer := coalesce((payload ->> 'redondeo_centavos')::integer, 1);
  v_categoria uuid := (payload ->> 'categoria_id')::uuid;
  v_proveedor uuid := (payload ->> 'proveedor_id')::uuid;
  v_ids uuid[] := case when payload ? 'producto_ids'
                       then array(select (jsonb_array_elements_text(payload -> 'producto_ids'))::uuid)
                       end;
  v_aplicar boolean := coalesce((payload ->> 'aplicar')::boolean, false);
  v_lote uuid := coalesce((payload ->> 'lote_id')::uuid, gen_random_uuid());
  v_previa jsonb;
  v_n integer := 0;
begin
  perform public.exigir_dueno();

  create temporary table _afectados on commit drop as
  select p.id, p.nombre, p.tipo_venta, p.precio_costo_centavos,
         coalesce(p.precio_venta_centavos, p.precio_por_kg_centavos) as precio_actual,
         public.redondear_centavos(
           round(coalesce(p.precio_venta_centavos, p.precio_por_kg_centavos) * (1 + v_pct / 100))::bigint,
           v_redondeo) as precio_nuevo
    from productos p
   where p.comercio_id = v_comercio
     and p.activo
     and (v_categoria is null or p.categoria_id = v_categoria)
     and (v_proveedor is null or p.proveedor_id = v_proveedor)
     and (v_ids is null or p.id = any(v_ids));

  select jsonb_agg(jsonb_build_object(
           'id', a.id, 'nombre', a.nombre,
           'precio_actual', a.precio_actual, 'precio_nuevo', a.precio_nuevo,
           -- Alerta de margen negativo: subió el costo y el precio no alcanza.
           'margen_negativo', a.precio_nuevo < a.precio_costo_centavos)),
         count(*)
    into v_previa, v_n
    from _afectados a;

  if not v_aplicar then
    return jsonb_build_object('lote_id', null, 'cantidad', coalesce(v_n, 0),
                              'previa', coalesce(v_previa, '[]'::jsonb));
  end if;

  perform set_config('app.motivo_precio', 'masivo', true);

  update productos p
     set precio_venta_centavos = case when p.tipo_venta = 'UNIDAD' then a.precio_nuevo else p.precio_venta_centavos end,
         precio_por_kg_centavos = case when p.tipo_venta = 'PESO' then a.precio_nuevo else p.precio_por_kg_centavos end
    from _afectados a
   where p.id = a.id;

  update precios_historial
     set lote_id = v_lote, usuario_id = auth.uid()
   where comercio_id = v_comercio and lote_id is null
     and creado_en > now() - interval '1 minute';

  insert into auditoria (comercio_id, usuario_id, entidad, entidad_id, accion, datos_despues)
  values (v_comercio, auth.uid(), 'productos', null, 'actualizar_precios_masivo',
          jsonb_build_object('lote_id', v_lote, 'pct', v_pct, 'cantidad', v_n));

  return jsonb_build_object('lote_id', v_lote, 'cantidad', coalesce(v_n, 0),
                            'previa', coalesce(v_previa, '[]'::jsonb));
end $fn$;

-- Deshacer por 24 h. Si se pasó de la ventana, no se deshace: el historial
-- posterior ya no sería confiable.
create or replace function public.deshacer_lote_precios(p_lote_id uuid)
returns integer language plpgsql security definer set search_path = public as $fn$
declare
  v_comercio uuid := public.exigir_tenant(null);
  v_n integer := 0;
begin
  perform public.exigir_dueno();

  if not exists (select 1 from precios_historial
                  where lote_id = p_lote_id and comercio_id = v_comercio
                    and creado_en > now() - interval '24 hours') then
    raise exception 'Ese lote no se puede deshacer: no existe o pasaron más de 24 horas';
  end if;

  perform set_config('app.motivo_precio', 'deshacer', true);

  with h as (
    select distinct on (producto_id) producto_id, precio_anterior_centavos
      from precios_historial
     where lote_id = p_lote_id and comercio_id = v_comercio
     order by producto_id, creado_en asc)
  update productos p
     set precio_venta_centavos  = case when p.tipo_venta = 'UNIDAD' then h.precio_anterior_centavos else p.precio_venta_centavos end,
         precio_por_kg_centavos = case when p.tipo_venta = 'PESO'   then h.precio_anterior_centavos else p.precio_por_kg_centavos end
    from h
   where p.id = h.producto_id and p.comercio_id = v_comercio;

  get diagnostics v_n = row_count;

  insert into auditoria (comercio_id, usuario_id, entidad, entidad_id, accion, datos_despues)
  values (v_comercio, auth.uid(), 'productos', null, 'deshacer_lote_precios',
          jsonb_build_object('lote_id', p_lote_id, 'cantidad', v_n));

  return v_n;
end $fn$;

-- ----------------------------------------------------------------------------
-- M2 · Catálogo semilla
-- Nadie carga 400 productos a mano antes de vender el primero.
-- ----------------------------------------------------------------------------
create or replace function public.importar_catalogo_base(payload jsonb)
returns integer language plpgsql security definer set search_path = public as $fn$
declare
  v_comercio uuid := public.exigir_tenant(null);
  v_fila jsonb;
  v_cat uuid;
  v_n integer := 0;
begin
  perform public.exigir_dueno();

  for v_fila in select * from jsonb_array_elements(payload -> 'items') loop
    -- La categoría sugerida se crea si el comercio todavía no la tiene.
    select id into v_cat from categorias
     where comercio_id = v_comercio
       and lower(public.f_unaccent(nombre)) = lower(public.f_unaccent(v_fila ->> 'categoria'))
     limit 1;

    if v_cat is null then
      insert into categorias (comercio_id, nombre, orden)
      values (v_comercio, v_fila ->> 'categoria',
              (select coalesce(max(orden), 0) + 1 from categorias where comercio_id = v_comercio))
      returning id into v_cat;
    end if;

    insert into productos (
      comercio_id, categoria_id, nombre, alias, codigo_barras, tipo_venta,
      precio_venta_centavos, precio_por_kg_centavos, precio_costo_centavos,
      stock_actual, stock_minimo)
    values (
      v_comercio, v_cat, v_fila ->> 'nombre',
      coalesce(array(select jsonb_array_elements_text(v_fila -> 'alias')), '{}'),
      nullif(v_fila ->> 'codigo_barras', ''),
      coalesce((v_fila ->> 'tipo_venta')::tipo_venta, 'UNIDAD'),
      case when coalesce(v_fila ->> 'tipo_venta', 'UNIDAD') = 'UNIDAD'
           then (v_fila ->> 'precio_centavos')::bigint end,
      case when v_fila ->> 'tipo_venta' = 'PESO'
           then (v_fila ->> 'precio_centavos')::bigint end,
      coalesce((v_fila ->> 'costo_centavos')::bigint, 0),
      coalesce((v_fila ->> 'stock_inicial')::bigint, 0),
      coalesce((v_fila ->> 'stock_minimo')::bigint, 0))
    on conflict do nothing;

    v_n := v_n + 1;
  end loop;

  return v_n;
end $fn$;

-- ----------------------------------------------------------------------------
-- M8 · Vidriera
-- ----------------------------------------------------------------------------

-- El pedido SE GUARDA ANTES de abrir WhatsApp. Un wa.me suelto se pierde entre
-- 40 chats y no descuenta stock.
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
    zona_id, costo_envio_centavos, total_centavos, notas, estado, acepta_promos)
  values (v_pedido, v_comercio, v_numero,
          payload ->> 'nombre_cliente', payload ->> 'telefono', payload ->> 'direccion',
          coalesce((payload ->> 'tipo_entrega')::tipo_entrega, 'RETIRO'),
          (payload ->> 'zona_id')::uuid, coalesce(v_envio, 0), 0,
          payload ->> 'notas', 'NUEVO',
          coalesce((payload ->> 'acepta_promos')::boolean, false));

  -- Los precios se toman de la base, NUNCA del cliente.
  for v_item in select * from jsonb_array_elements(payload -> 'items') loop
    select case when p.tipo_venta = 'PESO'
                then round((v_item ->> 'cantidad')::numeric * p.precio_por_kg_centavos / 1000)
                else p.precio_venta_centavos * (v_item ->> 'cantidad')::bigint end
      into v_precio
      from productos p
     where p.id = (v_item ->> 'producto_id')::uuid
       and p.comercio_id = v_comercio and p.activo and p.visible_en_vidriera;

    if v_precio is null then continue; end if;

    insert into pedidos_items (pedido_id, producto_id, descripcion, tipo_venta,
                               cantidad, precio_unitario_centavos, total_centavos)
    select v_pedido, p.id, p.nombre, p.tipo_venta, (v_item ->> 'cantidad')::bigint,
           coalesce(p.precio_venta_centavos, p.precio_por_kg_centavos), v_precio
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

create or replace function public.convertir_pedido_en_venta(p_pedido_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_comercio uuid := public.exigir_tenant(null);
  v_pedido pedidos_vidriera%rowtype;
  v_venta uuid := gen_random_uuid();
  v_numero bigint;
  v_costo bigint := 0;
begin
  select * into v_pedido from pedidos_vidriera
   where id = p_pedido_id and comercio_id = v_comercio;
  if not found then raise exception 'El pedido no existe'; end if;
  if v_pedido.venta_id is not null then
    return jsonb_build_object('venta_id', v_pedido.venta_id, 'duplicada', true);
  end if;

  v_numero := public.siguiente_numero_venta(v_comercio);

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

  select coalesce(sum(costo_unitario_centavos), 0) into v_costo
    from ventas_items where venta_id = v_venta;
  update ventas set costo_total_centavos = v_costo where id = v_venta;

  -- Descuenta stock, que es justamente lo que un wa.me suelto no hace.
  insert into movimientos_stock (comercio_id, producto_id, delta, motivo, referencia_id, usuario_id)
  select v_comercio, pi.producto_id, -pi.cantidad, 'VENTA', v_venta, auth.uid()
    from pedidos_items pi
    join productos p on p.id = pi.producto_id
   where pi.pedido_id = p_pedido_id and p.controla_stock and p.tipo_producto = 'FISICO';

  update pedidos_vidriera set venta_id = v_venta, estado = 'ACEPTADO' where id = p_pedido_id;

  return jsonb_build_object('venta_id', v_venta, 'numero', v_numero);
end $fn$;

-- ----------------------------------------------------------------------------
-- M9 · Reportes. Todos exigen rol dueño DENTRO de la función.
-- ----------------------------------------------------------------------------

-- La comparación que sirve es contra el MISMO DÍA DE LA SEMANA PASADA, no
-- contra ayer: un martes no se parece a un lunes en un kiosco.
create or replace function public.resumen_dia(p_fecha date)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_comercio uuid := public.exigir_tenant(null);
  v_hoy jsonb;
  v_semana jsonb;
  v_medios jsonb;
begin
  perform public.exigir_dueno();

  select jsonb_build_object(
           'total', coalesce(sum(total_centavos), 0),
           'costo', coalesce(sum(costo_total_centavos), 0),
           'tickets', count(*),
           'ticket_promedio', case when count(*) = 0 then 0
                                   else round(sum(total_centavos)::numeric / count(*)) end)
    into v_hoy
    from ventas
   where comercio_id = v_comercio and estado = 'COMPLETADA'
     and (creado_en at time zone 'America/Argentina/Buenos_Aires')::date = p_fecha;

  select jsonb_build_object(
           'total', coalesce(sum(total_centavos), 0),
           'tickets', count(*))
    into v_semana
    from ventas
   where comercio_id = v_comercio and estado = 'COMPLETADA'
     and (creado_en at time zone 'America/Argentina/Buenos_Aires')::date = p_fecha - 7;

  select coalesce(jsonb_object_agg(medio, monto), '{}'::jsonb) into v_medios
    from (select vp.medio::text as medio, sum(vp.monto_centavos) as monto
            from ventas_pagos vp
            join ventas v on v.id = vp.venta_id
           where v.comercio_id = v_comercio and v.estado = 'COMPLETADA'
             and (v.creado_en at time zone 'America/Argentina/Buenos_Aires')::date = p_fecha
           group by vp.medio) t;

  return jsonb_build_object('fecha', p_fecha, 'hoy', v_hoy,
                            'misma_dia_semana_pasada', v_semana, 'medios', v_medios);
end $fn$;

create or replace function public.ventas_por_hora(p_desde date, p_hasta date)
returns table (hora integer, tickets bigint, total_centavos bigint)
language plpgsql stable security definer set search_path = public as $fn$
declare v_comercio uuid := public.exigir_tenant(null);
begin
  perform public.exigir_dueno();
  return query
    select extract(hour from v.creado_en at time zone 'America/Argentina/Buenos_Aires')::integer, count(*), coalesce(sum(v.total_centavos), 0)
      from ventas v
     where v.comercio_id = v_comercio and v.estado = 'COMPLETADA'
       and (v.creado_en at time zone 'America/Argentina/Buenos_Aires')::date between p_desde and p_hasta
     group by 1 order by 1;
end $fn$;

-- Top por RENTABILIDAD, no por volumen. Usa el costo congelado en el item.
create or replace function public.rentabilidad_productos(p_desde date, p_hasta date, p_limite integer default 20)
returns table (
  producto_id uuid, nombre text, unidades bigint,
  facturado_centavos bigint, costo_centavos bigint, ganancia_centavos bigint, margen_pct numeric)
language plpgsql stable security definer set search_path = public as $fn$
declare v_comercio uuid := public.exigir_tenant(null);
begin
  perform public.exigir_dueno();
  return query
    select vi.producto_id,
           max(vi.descripcion),
           sum(vi.cantidad),
           sum(vi.total_centavos),
           sum(vi.costo_unitario_centavos),
           sum(vi.total_centavos) - sum(vi.costo_unitario_centavos),
           case when sum(vi.total_centavos) = 0 then 0
                else round(100.0 * (sum(vi.total_centavos) - sum(vi.costo_unitario_centavos))
                           / sum(vi.total_centavos), 2) end
      from ventas_items vi
      join ventas v on v.id = vi.venta_id
     where v.comercio_id = v_comercio and v.estado = 'COMPLETADA'
       and (v.creado_en at time zone 'America/Argentina/Buenos_Aires')::date between p_desde and p_hasta
     group by vi.producto_id
     order by 6 desc
     limit p_limite;
end $fn$;

-- Plata dormida en el estante.
create or replace function public.productos_muertos(p_dias integer default 30)
returns table (id uuid, nombre text, stock_actual bigint, capital_centavos bigint, ultima_venta timestamptz)
language plpgsql stable security definer set search_path = public as $fn$
declare v_comercio uuid := public.exigir_tenant(null);
begin
  perform public.exigir_dueno();
  return query
    select p.id, p.nombre, p.stock_actual,
           p.stock_actual * p.precio_costo_centavos,
           (select max(v.creado_en) from ventas_items vi
              join ventas v on v.id = vi.venta_id
             where vi.producto_id = p.id and v.estado = 'COMPLETADA')
      from productos p
     where p.comercio_id = v_comercio and p.activo and p.controla_stock
       and p.stock_actual > 0
       and not exists (
         select 1 from ventas_items vi
           join ventas v on v.id = vi.venta_id
          where vi.producto_id = p.id and v.estado = 'COMPLETADA'
            and v.creado_en > now() - make_interval(days => p_dias))
     order by 4 desc nulls last;
end $fn$;

-- La métrica que importa del arqueo: la SERIE por persona, no el día suelto.
create or replace function public.diferencias_por_empleado(p_desde date, p_hasta date)
returns table (
  usuario_id uuid, nombre text, cierres bigint,
  diferencia_total_centavos bigint, diferencia_promedio_centavos bigint)
language plpgsql stable security definer set search_path = public as $fn$
declare v_comercio uuid := public.exigir_tenant(null);
begin
  perform public.exigir_dueno();
  return query
    select a.declarado_por, max(u.nombre), count(*),
           sum(a.diferencia_centavos),
           round(avg(a.diferencia_centavos))::bigint
      from arqueos a
      left join usuarios_comercio u on u.id = a.declarado_por
     where a.comercio_id = v_comercio
       and (a.declarado_en at time zone 'America/Argentina/Buenos_Aires')::date between p_desde and p_hasta
     group by a.declarado_por
     order by 4 asc;
end $fn$;

-- ============================================================================
-- Ninguna RPC queda abierta al público salvo la de la Vidriera.
-- ============================================================================
revoke execute on function public.crear_pedido_vidriera(jsonb) from public;
grant execute on function public.crear_pedido_vidriera(jsonb) to anon, authenticated;

-- ============================================================================
-- AUTORIZACIONES DEL DUEÑO
--
-- El PIN se valida UNA vez y a cambio se emite un vale de corta duración.
-- Así el PIN no queda guardado en el outbox del dispositivo esperando a que
-- vuelva internet: lo que viaja y se persiste es un uuid que caduca.
-- ============================================================================

create table autorizaciones (
  id           uuid primary key default gen_random_uuid(),
  comercio_id  uuid not null references comercios(id) on delete cascade,
  otorgada_por uuid not null references usuarios_comercio(id) on delete cascade,
  solicitada_por uuid references usuarios_comercio(id) on delete set null,
  accion       text not null,          -- 'anular_venta','descuento','exceder_credito'
  detalle      jsonb,
  usada_en     timestamptz,
  vence_en     timestamptz not null default now() + interval '15 minutes',
  creado_en    timestamptz not null default now()
);
create index on autorizaciones (comercio_id, creado_en desc);

alter table autorizaciones enable row level security;
create policy autorizaciones_lectura_dueno on autorizaciones for select to authenticated
  using (comercio_id = public.comercio_id() and public.es_dueno());

create or replace function public.autorizar_accion(
  p_usuario_id uuid, p_pin text, p_accion text, p_detalle jsonb default null)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_comercio uuid := public.exigir_tenant(null);
  v_id uuid;
begin
  if not public.validar_pin_dueno(p_usuario_id, p_pin) then
    raise exception 'PIN incorrecto' using errcode = '42501';
  end if;

  insert into autorizaciones (comercio_id, otorgada_por, solicitada_por, accion, detalle)
  values (v_comercio, p_usuario_id, auth.uid(), p_accion, p_detalle)
  returning id into v_id;

  -- Nunca se autoriza sin dejar rastro.
  insert into auditoria (comercio_id, usuario_id, entidad, entidad_id, accion, datos_despues)
  values (v_comercio, auth.uid(), 'autorizaciones', v_id, 'autorizar_' || p_accion,
          jsonb_build_object('otorgada_por', p_usuario_id, 'detalle', p_detalle));

  return v_id;
end $fn$;

-- Consume un vale: verifica que exista, que sea de la acción pedida, que no
-- esté usado y que no haya vencido. Devuelve quién lo otorgó.
create or replace function public.consumir_autorizacion(p_id uuid, p_accion text)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare v_fila autorizaciones%rowtype;
begin
  select * into v_fila from autorizaciones
   where id = p_id and comercio_id = public.comercio_id() and accion = p_accion;

  if not found then raise exception 'Autorización inexistente' using errcode = '42501'; end if;
  if v_fila.usada_en is not null then raise exception 'Esa autorización ya se usó' using errcode = '42501'; end if;
  if v_fila.vence_en < now() then raise exception 'La autorización venció' using errcode = '42501'; end if;

  update autorizaciones set usada_en = now() where id = p_id;
  return v_fila.otorgada_por;
end $fn$;

-- anular_venta, ahora contra el vale en vez de contra el PIN.
create or replace function public.anular_venta(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_comercio uuid := public.exigir_tenant(null);
  v_venta    ventas%rowtype;
  v_item     record;
  v_fiado    bigint;
  v_autoriza uuid;
  v_vale     uuid := (payload ->> 'autorizacion_id')::uuid;
  v_offline  boolean := coalesce((payload ->> 'autorizada_offline')::boolean, false);
begin
  select * into v_venta from ventas
   where id = (payload ->> 'venta_id')::uuid and comercio_id = v_comercio;
  if not found then raise exception 'La venta no existe'; end if;

  if v_venta.estado = 'ANULADA' then
    return jsonb_build_object('id', v_venta.id, 'estado', 'ANULADA', 'duplicada', true);
  end if;

  -- Regla del POS §7: solo se anulan ventas del día en curso.
  if (v_venta.creado_en at time zone 'America/Argentina/Buenos_Aires')::date <> (now() at time zone 'America/Argentina/Buenos_Aires')::date
     and not public.es_dueno() then
    raise exception 'Solo se anulan ventas del día. Pedile al dueño que la revise.';
  end if;

  if public.es_dueno() then
    v_autoriza := auth.uid();
  elsif v_vale is not null then
    v_autoriza := public.consumir_autorizacion(v_vale, 'anular_venta');
  elsif v_offline then
    -- Autorizada sin conexión: se acepta y queda MARCADA para que el dueño la
    -- vea destacada en la auditoría. No se pierde la venta ni el rastro.
    v_autoriza := (payload ->> 'autorizado_por')::uuid;
  else
    raise exception 'Anular una venta necesita la autorización del dueño' using errcode = '42501';
  end if;

  update ventas
     set estado = 'ANULADA',
         anulada_por = v_autoriza,
         anulada_en = coalesce((payload ->> 'anulada_en')::timestamptz, now()),
         motivo_anulacion = payload ->> 'motivo'
   where id = v_venta.id;

  -- Devuelve el stock con un movimiento propio: el libro mayor no se reescribe.
  for v_item in
    select vi.producto_id, vi.cantidad
      from ventas_items vi
      join productos p on p.id = vi.producto_id
     where vi.venta_id = v_venta.id and p.controla_stock and p.tipo_producto = 'FISICO'
  loop
    insert into movimientos_stock (comercio_id, producto_id, delta, motivo, referencia_id, usuario_id, nota)
    values (v_comercio, v_item.producto_id, v_item.cantidad, 'ANULACION', v_venta.id,
            (payload ->> 'usuario_id')::uuid, payload ->> 'motivo');
  end loop;

  -- Si era fiada, se revierte el cargo con un AJUSTE negativo. El saldo del
  -- cliente vuelve solo, por el trigger.
  select coalesce(sum(monto_centavos), 0) into v_fiado
    from ventas_pagos where venta_id = v_venta.id and medio = 'FIADO';

  if v_fiado > 0 and v_venta.cliente_id is not null then
    insert into cuenta_corriente_movimientos (
      comercio_id, cliente_id, tipo, monto_centavos, venta_id, nota, usuario_id)
    values (v_comercio, v_venta.cliente_id, 'AJUSTE', -v_fiado, v_venta.id,
            'Anulación de venta', (payload ->> 'usuario_id')::uuid);
  end if;

  insert into auditoria (comercio_id, usuario_id, entidad, entidad_id, accion, datos_antes, datos_despues)
  values (v_comercio, (payload ->> 'usuario_id')::uuid, 'ventas', v_venta.id, 'anular_venta',
          jsonb_build_object('total_centavos', v_venta.total_centavos, 'numero', v_venta.numero),
          jsonb_build_object('motivo', payload ->> 'motivo',
                             'autorizado_por', v_autoriza,
                             'autorizada_offline', v_offline));

  return jsonb_build_object('id', v_venta.id, 'estado', 'ANULADA');
end $fn$;

-- ============================================================================
-- ALTA DE UN COMERCIO NUEVO
--
-- Es la única operación que no puede pasar por RLS: cuando alguien crea su
-- kiosco todavía no tiene comercio_id en el JWT, así que cualquier política lo
-- rechazaría. La ruta /api/onboarding usa el service role y la identidad la
-- toma de la sesión verificada del servidor, nunca del cuerpo del request.
-- ============================================================================

create or replace function public.definir_pin_admin(p_usuario_id uuid, p_pin text)
returns boolean language plpgsql security definer set search_path = public, extensions as $fn$
begin
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'El PIN tiene que ser de 4 dígitos';
  end if;

  update usuarios_comercio
     set pin_hash = crypt(p_pin, gen_salt('bf', 10))
   where id = p_usuario_id;

  return found;
end $fn$;

-- Solo el service role. Un usuario autenticado usa `definir_pin`, que sí
-- verifica el tenant y el rol.
revoke execute on function public.definir_pin_admin(uuid, text) from public, anon, authenticated;
grant execute on function public.definir_pin_admin(uuid, text) to service_role;

-- ============================================================================
-- REALTIME
-- La bandeja de pedidos escucha esta tabla. Sin la publicación, el badge no
-- aparece hasta que alguien recarga.
-- ============================================================================
alter publication supabase_realtime add table pedidos_vidriera;
