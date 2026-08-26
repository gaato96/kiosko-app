-- ============================================================================
-- Kiosko App — Datos de desarrollo
--
-- Un comercio, un dueño y un empleado, con contraseñas conocidas.
-- SOLO PARA DESARROLLO. No correr esto en producción.
--
-- Orden de aplicación:
--   1. supabase/schema.sql
--   2. supabase/catalogo-base.sql
--   3. supabase/seed.sql        <- este archivo
--
-- Después: Authentication > Hooks > Custom Access Token -> custom_access_token_hook
-- y volver a loguearse para que el JWT traiga comercio_id y rol.
-- ============================================================================

-- Credenciales de desarrollo
--   dueño:    dueno@kiosco.test    / kiosco1234   · PIN 1111
--   empleado: empleado@kiosco.test / kiosco1234   · PIN 2222

do $seed$
declare
  v_comercio uuid := '00000000-0000-4000-8000-000000000001';
  v_dueno    uuid := '00000000-0000-4000-8000-0000000000d1';
  v_empleado uuid := '00000000-0000-4000-8000-0000000000e1';
  v_cat_beb  uuid;
  v_cat_cig  uuid;
  v_cat_gol  uuid;
  v_cat_fia  uuid;
  v_cat_alm  uuid;
  v_prov     uuid;
  v_prod     uuid;
begin

  -- --------------------------------------------------------------- Usuarios
  -- Se insertan directo en auth.users porque el seed corre con service_role.
  -- Los campos de token (confirmation_token, recovery_token, etc.) se
  -- insertan como '' y NO se dejan en NULL: GoTrue los escanea como string y
  -- un NULL ahí revienta el login con "Database error querying schema". Es un
  -- gotcha conocido de insertar usuarios a mano en auth.users.
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change,
    email_change_token_new, email_change_token_current, phone_change,
    reauthentication_token)
  values
    (v_dueno, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'dueno@kiosco.test', crypt('kiosco1234', gen_salt('bf')),
     now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}',
     '', '', '', '', '', '', ''),
    (v_empleado, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'empleado@kiosco.test', crypt('kiosco1234', gen_salt('bf')),
     now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}',
     '', '', '', '', '', '', '')
  on conflict (id) do nothing;

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
  values
    (gen_random_uuid(), v_dueno, v_dueno::text,
     jsonb_build_object('sub', v_dueno::text, 'email', 'dueno@kiosco.test'), 'email', now(), now()),
    (gen_random_uuid(), v_empleado, v_empleado::text,
     jsonb_build_object('sub', v_empleado::text, 'email', 'empleado@kiosco.test'), 'email', now(), now())
  on conflict do nothing;

  -- --------------------------------------------------------------- Comercio
  insert into comercios (id, nombre, slug, telefono_whatsapp, direccion, vidriera_activa)
  values (v_comercio, 'Kiosco La Esquina', 'kiosco-la-esquina', '5491122334455',
          'Av. Rivadavia 4500, CABA', true)
  on conflict (id) do nothing;

  insert into config_comercio (comercio_id, redondeo_centavos, margen_objetivo_pct,
                               vidriera_titulo, vidriera_mensaje,
                               monto_minimo_envio_centavos)
  values (v_comercio, 10000, 35.00,
          'Kiosco La Esquina',
          'Pedí por acá y te lo mandamos. Abierto de 7 a 23.',
          500000)
  on conflict (comercio_id) do nothing;

  insert into usuarios_comercio (id, comercio_id, nombre, rol, pin_hash)
  values
    (v_dueno, v_comercio, 'Marcela', 'dueno', crypt('1111', gen_salt('bf', 10))),
    (v_empleado, v_comercio, 'Gastón', 'empleado', crypt('2222', gen_salt('bf', 10)))
  on conflict (id) do update set pin_hash = excluded.pin_hash;

  -- -------------------------------------------------------------- Categorías
  insert into categorias (comercio_id, nombre, color, emoji, orden) values
    (v_comercio, 'Bebidas',     '#0ea5e9', '🥤', 1),
    (v_comercio, 'Cigarrillos', '#78716c', '🚬', 2),
    (v_comercio, 'Golosinas',   '#ec4899', '🍬', 3),
    (v_comercio, 'Galletitas',  '#f59e0b', '🍪', 4),
    (v_comercio, 'Fiambrería',  '#ef4444', '🧀', 5),
    (v_comercio, 'Panadería',   '#d97706', '🥖', 6),
    (v_comercio, 'Almacén',     '#22c55e', '🛒', 7),
    (v_comercio, 'Limpieza',    '#6366f1', '🧽', 8),
    (v_comercio, 'Servicios',   '#8b5cf6', '📱', 9);

  select id into v_cat_beb from categorias where comercio_id = v_comercio and nombre = 'Bebidas';
  select id into v_cat_cig from categorias where comercio_id = v_comercio and nombre = 'Cigarrillos';
  select id into v_cat_gol from categorias where comercio_id = v_comercio and nombre = 'Golosinas';
  select id into v_cat_fia from categorias where comercio_id = v_comercio and nombre = 'Fiambrería';
  select id into v_cat_alm from categorias where comercio_id = v_comercio and nombre = 'Almacén';

  -- -------------------------------------------------------------- Proveedor
  insert into proveedores (comercio_id, nombre, telefono, dias_visita)
  values (v_comercio, 'Distribuidora del Oeste', '5491133445566', '{lunes,jueves}')
  returning id into v_prov;

  -- --------------------------------------------------------------- Productos
  -- Precios de referencia, en CENTAVOS. Un kiosco los va a cambiar el día uno.
  insert into productos (
    comercio_id, categoria_id, proveedor_id, nombre, alias, tipo_venta,
    precio_venta_centavos, precio_por_kg_centavos, precio_costo_centavos,
    controla_stock, stock_actual, stock_minimo, factor_compra, unidad_compra)
  values
    (v_comercio, v_cat_beb, v_prov, 'Coca-Cola 500 ml', '{coca,coca 500}', 'UNIDAD',
     180000, null, 120000, true, 48, 12, 24, 'Caja x24'),
    (v_comercio, v_cat_beb, v_prov, 'Coca-Cola 1,5 L', '{coca 1.5}', 'UNIDAD',
     320000, null, 225000, true, 20, 6, 6, 'Pack x6'),
    (v_comercio, v_cat_beb, v_prov, 'Agua mineral 500 ml', '{agua}', 'UNIDAD',
     110000, null, 70000, true, 36, 12, 12, 'Pack x12'),
    (v_comercio, v_cat_beb, v_prov, 'Cerveza Quilmes 1 L', '{quilmes,birra}', 'UNIDAD',
     260000, null, 190000, true, 24, 6, 6, 'Cajón x6'),
    (v_comercio, v_cat_cig, v_prov, 'Marlboro Box 20', '{marlboro,marl}', 'UNIDAD',
     420000, null, 370000, true, 30, 10, 10, 'Cartón x10'),
    (v_comercio, v_cat_cig, v_prov, 'Philip Morris Box 20', '{philip,pm}', 'UNIDAD',
     390000, null, 344000, true, 20, 10, 10, 'Cartón x10'),
    (v_comercio, v_cat_gol, v_prov, 'Alfajor Jorgito', '{jorgito}', 'UNIDAD',
     95000, null, 62000, true, 60, 24, 24, 'Caja x24'),
    (v_comercio, v_cat_gol, v_prov, 'Chicle Beldent', '{beldent,chicle}', 'UNIDAD',
     45000, null, 28000, true, 100, 30, 30, 'Caja x30'),
    (v_comercio, v_cat_gol, v_prov, 'Bon o Bon', '{bon o bon,bombon}', 'UNIDAD',
     38000, null, 24000, true, 80, 24, 24, 'Caja x24'),
    (v_comercio, v_cat_alm, v_prov, 'Yerba Playadito 1 kg', '{playadito,yerba}', 'UNIDAD',
     780000, null, 590000, true, 12, 4, 4, 'Bulto x4'),
    -- Los de PESO: el stock se lleva en GRAMOS y el precio es por KILO.
    (v_comercio, v_cat_fia, v_prov, 'Jamón cocido', '{jamon}', 'PESO',
     null, 1840000, 1300000, true, 4000, 1000, 4000, 'Horma 4 kg'),
    (v_comercio, v_cat_fia, v_prov, 'Queso cremoso', '{queso,cremoso}', 'PESO',
     null, 1350000, 980000, true, 3500, 1000, 4000, 'Horma 4 kg'),
    (v_comercio, v_cat_fia, v_prov, 'Salame milán', '{salame}', 'PESO',
     null, 2200000, 1650000, true, 1800, 500, 1000, 'Pieza 1 kg');

  -- Un servicio: mueve plata en caja pero el margen es solo la comisión.
  insert into productos (
    comercio_id, categoria_id, nombre, alias, tipo_producto, tipo_venta,
    precio_venta_centavos, precio_costo_centavos, controla_stock, comision_pct)
  select v_comercio, id, 'Carga de SUBE', '{sube}', 'SERVICIO', 'UNIDAD',
         0, 0, false, 3.00
    from categorias where comercio_id = v_comercio and nombre = 'Servicios';

  -- ------------------------------------------------------------ Stock inicial
  -- El stock nunca se "setea": se carga con un movimiento del libro mayor.
  -- Este INSERT queda como registro de la carga inicial; el trigger ya dejó
  -- stock_actual con el valor de arriba, así que se compensa con delta 0.
  insert into movimientos_stock (comercio_id, producto_id, delta, motivo, nota, usuario_id)
  select v_comercio, p.id, 0, 'CARGA_INICIAL', 'Alta del comercio de demo', v_dueno
    from productos p where p.comercio_id = v_comercio;

  -- ---------------------------------------------------------- Teclas rápidas
  insert into teclas_rapidas (comercio_id, producto_id, orden)
  select v_comercio, p.id,
         row_number() over (order by p.nombre)
    from productos p
   where p.comercio_id = v_comercio
     and p.nombre in ('Coca-Cola 500 ml', 'Marlboro Box 20', 'Alfajor Jorgito',
                      'Cerveza Quilmes 1 L', 'Agua mineral 500 ml', 'Bon o Bon',
                      'Chicle Beldent', 'Philip Morris Box 20');

  -- ----------------------------------------------------------------- Clientes
  insert into clientes (comercio_id, nombre, telefono, limite_credito_centavos)
  values
    (v_comercio, 'Gastón Pérez',   '5491144556677', 10000000),
    (v_comercio, 'Vecina del 3 B', '5491155667788',  5000000),
    (v_comercio, 'Rubén (taller)', '5491166778899', 15000000),
    (v_comercio, 'Sin crédito',    null,                    0);

  -- Un fiado abierto, para que la lista de deudores no arranque vacía.
  insert into cuenta_corriente_movimientos (comercio_id, cliente_id, tipo, monto_centavos, nota, usuario_id)
  select v_comercio, id, 'CARGO', 8500000, 'Deuda anterior al sistema', v_dueno
    from clientes where comercio_id = v_comercio and nombre = 'Gastón Pérez';

  -- -------------------------------------------------------------- Zonas de envío
  insert into zonas_envio (comercio_id, nombre, costo_centavos, monto_minimo_centavos)
  values
    (v_comercio, 'A la vuelta (hasta 5 cuadras)',  80000,  500000),
    (v_comercio, 'Barrio (hasta 15 cuadras)',     150000,  800000),
    (v_comercio, 'Fuera del barrio',              300000, 1500000);

  -- ----------------------------------------------------------------- Gastos
  insert into gastos (comercio_id, categoria, descripcion, monto_centavos, fecha, recurrente, usuario_id)
  values
    (v_comercio, 'Alquiler', 'Local', 45000000, current_date - 10, true, v_dueno),
    (v_comercio, 'Luz', 'Edenor', 8500000, current_date - 5, true, v_dueno),
    (v_comercio, 'Sueldos', 'Gastón', 60000000, current_date - 3, true, v_dueno);

  raise notice 'Seed listo. dueno@kiosco.test / kiosco1234 (PIN 1111) · empleado@kiosco.test / kiosco1234 (PIN 2222)';
end $seed$;
