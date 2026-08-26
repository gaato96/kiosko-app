# Fase 0 — Setup e infraestructura offline

```
Vamos a arrancar Kiosko App. Leé primero docs/00-PRD.md, docs/01-ARQUITECTURA.md
y CLAUDE.md.

Esta fase es la base. No hay pantallas de negocio todavía, pero al terminar la app
tiene que instalarse como PWA y abrir sin conexión.

TAREAS

1. Inicializar Next.js 15 con App Router, TypeScript strict, Tailwind y ESLint.
   Estructura de carpetas exactamente como está en CLAUDE.md.

2. Instalar y configurar:
   - shadcn/ui (tema oscuro por defecto) + lucide-react
   - @supabase/supabase-js y @supabase/ssr, con clientes separados para
     browser y server
   - dexie y dexie-react-hooks
   - zustand, @tanstack/react-query, zod
   - serwist para el service worker
   - uuidv7

3. Tokens de diseño de docs/04-DESIGN-SYSTEM.md en globals.css como variables CSS,
   mapeadas a la config de Tailwind. Inter como fuente, con tabular-nums
   disponible como utilidad.

4. lib/money.ts — LA ÚNICA implementación de dinero del proyecto:
   - redondear(centavos, unidadCentavos)
   - formatearPesos(centavos)  ->  "$ 12.400"
   - parsearPesos(texto) -> centavos
   Todo con enteros. Tests unitarios con vitest, incluyendo el redondeo a 1, 10,
   50 y 100.

5. lib/peso.ts — conversión peso/importe:
   - importeDesdeGramos(gramos, precioPorKgCentavos, redondeoCentavos)
   - gramosDesdeImporte(importeCentavos, precioPorKgCentavos)
   - formatearPeso(gramos) -> "250 g" o "1,25 kg"
   Tests con los ejemplos de docs/03-modulos/03-balanza-peso.md.

6. Capa offline en lib/db/:
   - schema.ts: base Dexie con las tablas locales productos, categorias, clientes,
     ventas, ventas_items, ventas_pagos, movimientos_stock, outbox, config, meta
   - outbox.ts: encolar(tipo, payload), procesar() con backoff exponencial
     (1s, 2s, 4s… tope 5 min, 10 intentos), y estados pendiente/enviando/ok/error
   - sync.ts: pull incremental por actualizado_en + push del outbox
   - device.ts: obtener o crear el uuid del dispositivo, persistido en IndexedDB
   Todo tipado y validado con Zod antes de encolar.

7. PWA: manifest.json (standalone, íconos maskable 192 y 512, theme_color oscuro),
   service worker con Serwist — precache del shell, NetworkFirst para datos,
   CacheFirst para imágenes y fuentes.

8. Componente <EstadoSync> con los tres estados de docs/01-ARQUITECTURA.md,
   alimentado por navigator.onLine + el conteo del outbox.

9. Proyecto de Supabase: aplicar supabase/schema.sql completo. Generar los tipos
   de TypeScript en lib/supabase/types.ts.

10. Página temporal /debug que muestre: estado de conexión, contenido del outbox,
    id del dispositivo y un botón para forzar sync. Sirve para toda la construcción.

CRITERIOS DE ACEPTACIÓN
- npm run build pasa sin errores ni warnings de tipos
- La app se instala como PWA en Android
- Con el modo avión activado, abre y muestra /debug
- Los tests de money.ts y peso.ts pasan
- schema.sql se aplica limpio en Supabase

No construyas pantallas de negocio en esta fase. Si algo de la arquitectura no te
cierra, preguntá antes de improvisar.
```
