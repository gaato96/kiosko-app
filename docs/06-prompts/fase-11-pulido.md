# Fase 11 — Pulido, onboarding y testing

```
Última fase antes de entregar. Nada nuevo: hacer que lo que hay sea sólido y que
un kiosco pueda empezar a usarlo solo.

TAREAS

1. ONBOARDING (lo más importante de esta fase — es donde se gana o se pierde la
   adopción):
   - Alta de comercio: nombre, slug, teléfono de WhatsApp, dirección
   - Asistente de 4 pasos: categorías (con las de default ya listas) → catálogo
     semilla → teclas rápidas → abrir la primera caja
   - Barra de progreso "Tu kiosco está 60% configurado" con lo que falta
   - Tour guiado del POS de 5 pasos, salteable, que no vuelve a aparecer
   - Datos de demo opcionales para explorar antes de cargar lo propio

2. Estados vacíos útiles en TODA la app. Nunca una pantalla en blanco:
   "Todavía no cargaste productos [Empezá con el catálogo]".

3. Performance:
   - next build y verificar el presupuesto: ruta del POS por debajo de 200 kB de
     First Load JS
   - Lighthouse en el POS y en la Vidriera: Performance ≥ 90, Accesibilidad ≥ 95,
     PWA instalable
   - Virtualizar todas las listas largas
   - Revisar que no haya imports de recharts ni de librerías de admin en el POS
   - PROBARLO EN UNA TABLET ANDROID DE GAMA BAJA REAL, no solo en el emulador

4. Accesibilidad: contraste AA en todo y AAA en los números grandes del POS,
   navegación completa por teclado, aria-live en el total y en el vuelto, foco
   visible, targets de 64 px.

5. Testing:
   - Unitarios (vitest): money.ts, peso.ts, cálculo de esperado de caja, límites de
     crédito, conversión por factor_compra
   - Integración: los RPC contra una base de prueba, incluyendo idempotencia
   - E2E (Playwright): venta completa, venta por peso, cierre de caja, venta fiada
     bloqueada, pedido desde la vidriera
   - Un test de RLS por rol y por tenant, ejecutado en CI

6. Manejo de errores: error boundary global, mensajes que dicen QUÉ HACER y no qué
   falló, retry visible, y logging de errores del cliente a una tabla del servidor.

7. Backup y export: export completo de los datos del comercio en JSON y CSV desde
   la configuración. Documentar la política de backups de Supabase.

8. Documentación para el cliente en docs/MANUAL.md, en lenguaje llano y con
   capturas: cómo abrir caja, cómo cobrar, cómo vender por peso, cómo cargar una
   compra, cómo cerrar caja, cómo cobrar un fiado, cómo actualizar precios.
   Video corto de 2 minutos por flujo, embebido en la ayuda de la app.

9. Deploy: proyecto en Vercel, variables de entorno, dominio, headers de seguridad
   (CSP, HSTS), y verificación de que el service worker se actualiza sin dejar
   usuarios en una versión vieja.

CRITERIOS DE ACEPTACIÓN
- Un kiosco nuevo llega desde el registro hasta su primera venta en menos de
  20 minutos, sin ayuda
- Lighthouse: POS ≥ 90 en performance, Vidriera ≥ 90 en mobile
- Todos los tests pasan en CI
- La app funciona fluida en una tablet Android de gama baja
- Cero errores de TypeScript, cero console.log, cero TODO sin ticket
- El manual cubre los 7 flujos principales
```
