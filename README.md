# Kiosko App

PWA de gestión integral para kioscos y maxikioscos argentinos.
Multi-tenant, offline-first, táctil.

La especificación completa está en [`docs/`](docs/). Las reglas no negociables,
en [`CLAUDE.md`](CLAUDE.md). Este README es solo cómo se pone a andar.

## Arranque

### 1. Dependencias

```bash
npm install
```

### 2. Supabase

Crear un proyecto en [supabase.com](https://supabase.com) y aplicar, **en este orden**,
desde el SQL Editor:

```
supabase/schema.sql         esquema + RLS + triggers + vistas + RPC
supabase/catalogo-base.sql  catálogo semilla argentino (266 productos)
supabase/seed.sql           datos de demo — SOLO en desarrollo
```

Después, en el dashboard:

- **Authentication → Hooks → Custom Access Token**: elegir
  `public.custom_access_token_hook`. Sin esto el JWT no lleva `comercio_id` ni
  `rol`, y **ninguna** política RLS matchea: la app se ve vacía.
- **Database → Replication**: verificar que `pedidos_vidriera` esté en la
  publicación `supabase_realtime` (el `schema.sql` la agrega).

### 3. Variables de entorno

```bash
cp .env.example .env.local
```

| Variable | Dónde sale |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Settings → API → anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API → service_role. **Nunca con prefijo `NEXT_PUBLIC_`** |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` en local |

### 4. Correr

```bash
npm run dev
```

Con el seed aplicado:

| Usuario | Mail | Contraseña | PIN |
|---|---|---|---|
| Dueña | `dueno@kiosko.test` | `kiosko1234` | `1111` |
| Empleado | `empleado@kiosko.test` | `kiosko1234` | `2222` |

## Comandos

```bash
npm run dev        # desarrollo
npm run build      # build de producción
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm test           # vitest
```

## Mapa del proyecto

```
app/
  (pos)/        POS, balanza, caja, ventas del día — tema oscuro fijo
  (admin)/      panel, productos, stock, precios, fiados, cajas, vidriera, config
  t/[slug]/     Vidriera Digital pública (sin auth, ISR)
  api/          alta de comercios
  debug/        estado de sync, outbox, dispositivo
components/
  ui/           primitivos (Boton, Hoja, Campo, MontoGrande, EstadoVacio)
  pos/          numpad, ticket, cobro, balanza, PIN, autorizaciones
lib/
  db/           Dexie: esquema local, outbox, sync, payloads Zod
  supabase/     clientes browser/server/admin, tipos de la base
  pos/          venta, caja, clientes, buscador
  money.ts      centavos, redondeo, formateo   ← la única implementación
  peso.ts       gramos <-> importe
  wa.ts         mensajes de WhatsApp
supabase/       schema.sql, catalogo-base.sql, seed.sql
docs/           la especificación
tests/          vitest
```

## Las decisiones que hay que entender antes de tocar código

**La plata son centavos enteros.** `lib/money.ts` es la única implementación de
redondeo del proyecto. Si aparece un `Math.round` sobre dinero en otro archivo,
está mal.

**El peso son gramos enteros.** 1,250 kg es `1250`. Nunca decimales.

**El stock es un libro mayor.** El cliente manda `delta = -3`, nunca
`stock = 12`. `productos.stock_actual` es un agregado que mantiene un trigger.
Sin esto, dos dispositivos offline se pisan y la verdad no se puede reconstruir.

**El POS escribe primero en IndexedDB.** Ninguna acción del camino de cobro
espera a la red. Si ves un `await fetch()` ahí, es un bug.

**Los IDs los genera el cliente (UUID v7).** Por eso reenviar diez veces la
misma venta produce exactamente una fila.

**Lo que el empleado no debe ver, no viaja.** Los costos y el efectivo esperado
no se esconden en la UI: se les revoca el privilegio de columna en Postgres y se
exponen por vistas que exigen rol `dueno`. Se verifica llamando a la API
directamente con un token de empleado, no mirando la pantalla.

**Las ventas son append-only.** No se editan ni se borran: se anulan por RPC,
que revierte stock y cuenta corriente y deja fila en `auditoria`.

## Presupuesto de rendimiento

El POS es la única ruta con presupuesto estricto: **< 200 kB de First Load JS**.
Hoy está en ~187 kB. El cliente de Supabase entra por import dinámico y TanStack
Query solo se monta en el admin, justamente para no romperlo. Antes de agregar
una dependencia al POS, correr `npm run build` y mirar el número.

## Estado

Implementado y con el build en verde:

- Fase 0 — infraestructura, capa offline, PWA, `money.ts` y `peso.ts` con tests
- Fase 1 — multi-tenant, roles, PIN, autorizaciones con vale
- Fase 2 — catálogo y catálogo semilla
- Fase 3 — POS con pago mixto, fiado y alta express
- Fase 4 — modo balanza de dos pasos
- Fase 5 — caja y arqueo ciego
- Fase 6 — reposición por proveedor y compras
- Fase 7 — cuentas corrientes
- Fase 8 — outbox con backoff y sync incremental
- Fase 9 — Vidriera Digital y bandeja de pedidos
- Fase 10 — reportes y actualización masiva de precios

Verificado contra un proyecto de Supabase real: `schema.sql`, `catalogo-base.sql`
y `seed.sql` aplicados, el custom access token hook activo, y probados con
tokens reales los tres criterios de seguridad de la Fase 1 — un empleado recibe
`[]` de `arqueos`, no puede leer `precio_costo_centavos` de `productos` bajo
ningún pedido, y un usuario de otro comercio no lee ni una fila del primero.

Probado además en un navegador real contra esa misma base: login, apertura de
caja, venta con vuelto, libro mayor de stock, panel de reportes y Vidriera
pública. Esa pasada encontró cuatro bugs que ni el build ni los tests veían —
`getUser()` no devuelve los claims del hook (hay que usar `getClaims()`), faltaban
políticas RLS para el rol `anon` en `comercios`, `config_comercio` y `zonas_envio`,
un service worker viejo servía un shell sin estilos, y la grilla del POS no
reaccionaba al primer pull del catálogo.

El sistema de diseño está en `app/globals.css` y documentado en
`docs/04-DESIGN-SYSTEM.md`. Sale de dos materiales: **la repisa** (superficies
blancas sobre un lienzo azul-gris, donde vive todo lo funcional) y **el papel**
(el ticket, con textura, monoespaciada y borde dentado, que es la firma visual y
no se repite en ningún otro lado). Claro siempre, sin tema oscuro: el mostrador
se usa con luz de mediodía y ahí una pantalla oscura es un espejo. Un solo
acento, el verde, que significa plata y nada más — la navegación y el foco usan
tinta para no competir con el botón de cobrar. Tres tipografías con un trabajo
cada una: Bricolage Grotesque para titulares y números, Public Sans para texto,
JetBrains Mono para el recibo.

Cada producto muestra **su foto** (`productos.imagen_url`) y, si no tiene, la
**ilustración de su arquetipo** (`public/prod/productos.svg`, resuelta por
`lib/ilustraciones.ts`). En producción las fotos las saca el dueño con el
celular; para la demo, `node scripts/fotos-demo.mjs` baja fotos reales de
Open Food Facts (CC BY-SA) al repo, validando cada match para no ponerle a un
alfajor la foto de unas galletitas de la misma marca. Los créditos quedan en
`public/prod/fotos/CREDITOS.md`.

Pendiente: la Fase 11 de pulido — onboarding guiado, import CSV, vencimientos y
tests end-to-end.
