# CLAUDE.md — Reglas permanentes del proyecto

> Este archivo se carga automáticamente en cada sesión. Son reglas **no negociables**.
> Si una instrucción puntual contradice esto, avisá antes de romper la regla.

## Qué es esto

**Kiosko App** — PWA de gestión integral para kioscos y maxikioscos argentinos.
Multi-tenant (SaaS), offline-first, táctil. Cada kiosco es un `comercio`.

Documentación completa en `docs/`. Antes de escribir código de un módulo,
leé su spec en `docs/03-modulos/`.

## Stack (no cambiar sin discutirlo)

- Next.js 15 (App Router) + TypeScript strict
- Tailwind CSS + shadcn/ui + lucide-react
- Supabase: Postgres + Auth + RLS + Realtime + Storage
- Dexie.js (IndexedDB) para la capa offline
- Serwist para el service worker / PWA
- Zustand (estado del ticket en curso) + TanStack Query (datos del servidor)
- Zod para validación compartida cliente/servidor
- Deploy: Vercel + Supabase

## Las 10 reglas de oro

1. **Plata en enteros.** Todos los importes se guardan y calculan en **centavos**
   (`bigint`). Nunca `float`, nunca `number` con decimales para dinero.
   Formateo a pesos solo en la capa de presentación.

2. **Peso en gramos enteros.** Nada de kilos con decimales. `stock_g bigint`,
   `cantidad_g bigint`. 1,250 kg = `1250`.

3. **El stock es un libro mayor, no un número.** Toda variación de stock inserta
   una fila en `movimientos_stock`. `productos.stock_actual` es un agregado
   cacheado que mantiene un trigger. **El cliente nunca envía un stock absoluto**,
   envía un delta. Sin esto, la sincronización offline es incorregible.

4. **IDs generados en el cliente (UUID v7).** Nada de autoincrement del servidor
   en tablas que el POS puede crear offline. Esto hace la sync idempotente.

5. **Toda tabla de negocio lleva `comercio_id` + política RLS.** Escribir una
   tabla sin RLS es un bug de seguridad, no un pendiente.

6. **El POS escribe primero en IndexedDB y nunca espera a la red.** Si una acción
   del POS hace `await fetch()` en el camino crítico, está mal implementada.

7. **Los permisos se validan en el servidor (RLS/RPC), no escondiendo la UI.**
   Ocultar un botón no es un control de acceso.

8. **Las ventas son append-only.** No se editan ni se borran: se anulan con un
   registro de anulación que deja rastro en `auditoria`.

9. **Español rioplatense en toda la interfaz.** *vuelto, fiado, cuenta corriente,
   arqueo, mercadería, changuito.* Nada de "carrito de compras" en el POS ni de
   traducciones neutras.

10. **Target táctil mínimo 64×64 px en el POS.** Se usa con una mano, parado,
    con gente esperando. Si un flujo de cobro necesita más de 8 toques, está mal
    diseñado.

## Convenciones de código

- Nombres de tablas, columnas y campos de base: **español, snake_case**
  (`ventas_items`, `precio_costo_centavos`). El dominio es argentino, el modelo
  se lee en argentino.
- Código TypeScript: **inglés, camelCase** para variables y funciones internas;
  los tipos que espejan la base mantienen los nombres en español.
- Server Actions para mutaciones simples; RPC de Postgres (`security definer`)
  para operaciones que necesitan atomicidad (cerrar venta, cerrar caja, aplicar
  compra).
- Un helper único y compartido para redondeo de precios: `lib/money.ts`.
  Nunca duplicar la lógica de redondeo.
- Nada de `any`. Nada de `@ts-ignore` sin comentario que explique por qué.

## Estructura de carpetas

```
app/
  (pos)/            POS, balanza, caja — layout táctil, sin chrome de admin
  (admin)/          productos, stock, clientes, reportes, config
  t/[slug]/         Vidriera Digital pública (sin auth)
  api/
components/
  ui/               shadcn
  pos/              componentes del punto de venta
lib/
  db/               Dexie: esquema local, outbox, sync
  supabase/         clientes server/browser, tipos generados
  money.ts          centavos, redondeo, formateo
  peso.ts           gramos <-> importe
  wa.ts             armado de mensajes de WhatsApp
supabase/
  schema.sql        esquema + RLS + triggers + RPC
  seed.sql          datos demo
  catalogo-base.sql catálogo semilla argentino (~400 productos)
docs/
```

## Qué NO hacer

- No agregar facturación ARCA en v1 (los campos fiscales quedan en la base, la
  integración es un módulo posterior).
- No hacer obligatoria la foto del producto. Cargar fotos es fricción y mata la
  adopción.
- No pedirle al dueño que cargue el catálogo desde cero: siempre ofrecer el
  catálogo semilla primero.
- No romper el flujo de cobro con modales anidados o confirmaciones innecesarias.
- No mostrar `efectivo_esperado` a un usuario con rol `empleado` — ni en la UI,
  ni en la respuesta de la API.
