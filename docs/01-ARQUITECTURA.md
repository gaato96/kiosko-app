# 01 · Arquitectura

## 1. Stack y por qué

| Capa | Elección | Razón |
|---|---|---|
| Framework | Next.js 15 App Router + TS strict | La Vidriera pública necesita SSR/ISR: carga rápido en 4G y es indexable. El POS es un cliente pesado dentro del mismo proyecto. |
| UI | Tailwind + shadcn/ui + lucide-react | Componentes accesibles y editables, targets táctiles grandes sin pelear con CSS de terceros. |
| Backend | Supabase | RLS resuelve el multi-tenant **en la base de datos**, no en el código. Auth, Realtime y Storage incluidos. |
| Offline | Dexie.js sobre IndexedDB | API tipada y madura. LocalStorage no alcanza: límite de tamaño, síncrono, sin índices. |
| PWA | Serwist | Sucesor mantenido de `next-pwa`, soporta App Router. |
| Estado | Zustand + TanStack Query | El ticket en curso es estado local efímero (Zustand). Todo lo que viene del servidor se cachea e invalida con Query. |
| Validación | Zod | Un solo esquema compartido cliente/servidor. |
| Deploy | Vercel + Supabase | USD 0 hasta ~20 comercios. |

## 2. Multi-tenant

### Regla estructural

**Toda tabla de negocio lleva `comercio_id uuid not null references comercios(id)`.**

### El JWT lleva el tenant

`comercio_id` y `rol` se inyectan en el access token mediante el **custom access
token hook** de Supabase. Así ninguna consulta necesita un JOIN contra
`usuarios_comercio` para resolver permisos.

```sql
-- Helpers que usan todas las políticas
create or replace function public.comercio_id() returns uuid
language sql stable as $fn$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'comercio_id', '')::uuid
$fn$;

create or replace function public.rol_actual() returns text
language sql stable as $fn$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'rol', 'anon')
$fn$;
```

### Patrón de política, idéntico en todas las tablas

```sql
alter table productos enable row level security;

create policy productos_tenant on productos
  for all to authenticated
  using      (comercio_id = public.comercio_id())
  with check (comercio_id = public.comercio_id());
```

Para datos que **solo el dueño** puede ver (costos, márgenes, efectivo esperado),
la restricción va en la misma política:

```sql
create policy arqueos_solo_dueno on arqueos
  for select to authenticated
  using (comercio_id = public.comercio_id() and public.rol_actual() = 'dueno');
```

> **Nunca** confiar en esconder un campo en el frontend. El empleado abre las
> DevTools y ve la respuesta cruda. Lo que no debe ver, no debe viajar.

### La Vidriera pública

Usa el cliente anónimo de Supabase contra **vistas** dedicadas que exponen
únicamente lo publicable:

```sql
create view vidriera_productos as
  select p.id, p.comercio_id, p.nombre, p.categoria_id,
         p.precio_venta_centavos, p.precio_por_kg_centavos, p.tipo_venta,
         p.imagen_url, (p.stock_actual > 0) as disponible
  from productos p
  join comercios c on c.id = p.comercio_id
  where p.visible_en_vidriera and p.activo and c.vidriera_activa;
```

La vista **no expone costo, margen, stock exacto ni proveedor**.

## 3. Offline-first

> Esta es la decisión que condiciona todo lo demás. Se implementa en la Fase 0,
> no se agrega después.

### Regla central

**El POS escribe siempre primero en IndexedDB y nunca espera a la red.**
Si una acción del camino crítico de cobro hace `await fetch()`, está mal.

### Flujo de una venta

```
[Usuario toca "Cobrar"]
        |
        v
1. Se genera UUID v7 en el cliente
2. Se escribe la venta completa en Dexie (ventas, items, pagos)  <- instantáneo
3. Se aplican los deltas de stock localmente
4. Se encola una entrada en el outbox
        |
        v
[La UI ya muestra "Venta cobrada" y el vuelto]
        |
        v
5. El worker de sync toma el outbox cuando hay red
6. POST idempotente al RPC sync_venta
7. Marca la entrada como ok y reconcilia el stock con la respuesta
```

### Idempotencia

El ID lo genera el cliente (**UUID v7**: ordenado en el tiempo, mucho mejor para
los índices de Postgres que v4). El RPC del servidor hace
`insert ... on conflict (id) do nothing` y devuelve el estado resultante.
Reenviar la misma venta diez veces produce exactamente una fila.

### El outbox

```ts
// lib/db/schema.ts (Dexie)
interface OutboxItem {
  id: string;              // uuid v7
  tipo: 'venta' | 'anulacion' | 'cobro_cc' | 'compra' | 'ajuste_stock' | 'arqueo';
  payload: unknown;        // validado con Zod antes de encolar
  estado: 'pendiente' | 'enviando' | 'ok' | 'error';
  intentos: number;
  ultimoError?: string;
  creadoEn: number;
}
```

Reintentos con backoff exponencial (1s, 2s, 4s… tope 5 min). Los items en `error`
después de 10 intentos quedan visibles en una pantalla de diagnóstico
("Ventas sin sincronizar") con opción de reintentar a mano.
**Nunca se descartan en silencio.**

### Por qué el stock es un libro mayor

Si el cliente enviara `stock = 12`, dos dispositivos offline se pisarían y sería
imposible reconstruir la verdad. En cambio envía `delta = -3`.

```
movimientos_stock (append-only)
  producto_id, delta (bigint, positivo o negativo), motivo, referencia_id, creado_en

productos.stock_actual  <- agregado cacheado que mantiene un trigger
```

El servidor siempre puede recalcular el stock real sumando el libro mayor. El
cliente lleva su propia proyección local y la reconcilia al sincronizar.

### Qué se replica a Dexie

Sync incremental por `actualizado_en`: `productos`, `categorias`, `clientes`
(nombre, saldo, límite), `config_comercio`, `teclas_rapidas`.
Todo lo demás (reportes, historial, compras) requiere conexión.

### Conflictos: qué puede y qué no puede pasar

| Escenario | Resultado |
|---|---|
| Dos ventas offline del mismo producto | Sin conflicto: son deltas, se suman. |
| Venta offline + cambio de precio online | La venta congela `precio_unitario_centavos` en el item. Correcto por diseño. |
| Stock negativo por ventas offline | Se permite y se marca. Un stock negativo es información real (falta un ajuste), no un error a bloquear en el mostrador. |
| Fiado que supera el límite estando offline | **Riesgo aceptado y documentado.** Cada dispositivo valida contra el último saldo conocido. Mitigación: badge "saldo desactualizado hace Xh" y bloqueo duro solo con datos frescos (< 5 min). Con un solo dispositivo no ocurre. |
| Dos cierres de caja del mismo día | Imposible: la sesión de caja es por `dispositivo_id` + `usuario_id`. |

### Indicador de estado, siempre visible en el POS

Una píldora en la barra superior:

- `● En línea`
- `◐ Sincronizando (3)`
- `○ Sin conexión — 7 ventas guardadas`

El usuario nunca tiene que adivinar si su trabajo se guardó.

## 4. Sesión de caja y dispositivos

Cada instalación de la PWA registra un `dispositivo` (uuid persistido en IndexedDB
+ nombre editable: "Tablet mostrador", "Celu de Marce").

`caja_sesiones` pertenece a `(comercio_id, dispositivo_id, usuario_id)`. Si mañana
hay dos puestos de cobro, cada uno abre, mueve y arquea su propia caja sin pisarse.

## 5. PWA

- `manifest.json`: `display: standalone`, orientación libre, íconos maskable
  192/512, `theme_color` oscuro.
- Service worker (Serwist): precache del shell del POS, `NetworkFirst` para datos,
  `CacheFirst` para imágenes de productos y fuentes.
- Prompt de instalación propio vía `beforeinstallprompt`, no el del navegador: se
  muestra al tercer uso, no en el primer segundo.
- **Wake lock** opcional en el POS para que la tablet no se apague en el mostrador.
- iOS: sin notificaciones push confiables. Los avisos de stock y pedidos se
  resuelven con badges dentro de la app más el canal de WhatsApp.

## 6. Seguridad

- Login con Supabase Auth (email + password). El **PIN de 4 dígitos** sirve solo
  para cambiar de usuario dentro de un dispositivo ya autenticado y para autorizar
  acciones sensibles. No reemplaza al login, se guarda hasheado con bcrypt y
  **se valida en el servidor**.
- Las operaciones sensibles pasan por RPC `security definer` con validación
  explícita del rol dentro de la función.
- `auditoria`: quién, qué, cuándo, valor anterior y nuevo. Obligatorio para
  anulaciones, descuentos, cambios de precio, cambios de límite de crédito,
  ajustes de stock y aperturas/cierres de caja.
- Rate limiting en la ruta pública de creación de pedidos de la Vidriera, por IP
  y por teléfono, para evitar spam.

## 7. Rendimiento

- El POS es la única pantalla con presupuesto de bundle estricto:
  **< 200 kB de First Load JS**. Los gráficos (`recharts`) y todo lo de admin se
  cargan con `dynamic()` y nunca entran al bundle del POS.
- La búsqueda de productos corre **en local sobre Dexie**, con índice por nombre
  normalizado (sin acentos, minúsculas) y por alias.
  Objetivo: **< 50 ms** para 1.000 productos. Nunca sale a la red mientras se cobra.
- Listas largas (productos, movimientos) virtualizadas.
- Imágenes por `next/image`, WebP, lazy.

## 8. Costos de infraestructura

| Comercios | Vercel | Supabase | Total mensual |
|---|---|---|---|
| 1–5 | Free/Hobby | Free (500 MB) | USD 0 |
| 5–25 | Pro USD 20 | Pro USD 25 | ~USD 45 |
| 25–100 | Pro USD 20 | Pro + compute ~USD 60 | ~USD 80 |

El costo marginal por comercio es cercano a cero. Un kiosco genera unas
200 ventas/día = ~6.000 filas/mes: irrelevante para Postgres.
