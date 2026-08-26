# Fase 1 — Multi-tenant, autenticación y roles

```
Leé docs/03-modulos/01-auth-rbac.md y docs/01-ARQUITECTURA.md sección 2.

Objetivo: que el dueño y el empleado vean cosas distintas, con los permisos
verificados en la base y no escondiendo botones.

TAREAS

1. Custom access token hook en Supabase que inyecte comercio_id y rol en
   app_metadata (el SQL está en la spec del módulo). Configurarlo en el dashboard
   y verificar que el JWT lo trae.

2. Helpers de tenant en la base: public.comercio_id(), public.rol_actual(),
   public.es_dueno(). Verificar que TODAS las políticas RLS del schema.sql están
   activas.

3. Auth:
   - /login con mail y contraseña, campos grandes, teclado adecuado
   - middleware que protege (pos) y (admin) y redirige a /login
   - refresh silencioso del token; si falla estando offline, el POS sigue
     funcionando con la última sesión válida
   - /onboarding para un usuario autenticado sin comercio_id

4. Sistema de PIN:
   - RPC validar_pin(usuario_id, pin) con bcrypt, security definer, en el servidor
   - <SelectorOperador>: grilla de avatares con inicial y nombre, numpad de 4
     dígitos, bloqueo de 60 s tras 5 intentos fallidos
   - <AutorizacionDueno>: modal que dice en una línea qué se está autorizando,
     pide el PIN del dueño y escribe en auditoria
   - Hash del PIN cacheado en Dexie para que el cambio de operador funcione
     offline; las autorizaciones del dueño hechas offline se marcan como
     "autorizada offline" en la auditoría

5. Store de sesión (Zustand): usuario de Supabase, operador actual, comercio, rol,
   dispositivo. Persistido en IndexedDB.

6. Layouts:
   - (pos): pantalla completa, sin navegación de admin, con <EstadoSync> arriba
   - (admin): navegación lateral, solo accesible con rol dueño
   Un empleado que entra a /admin recibe 403, no una página en blanco.

7. Admin de usuarios: alta con nombre, mail, rol y PIN; invitación por magic link;
   activar y desactivar.

8. Seed de desarrollo: un comercio, un dueño y un empleado, con contraseñas
   conocidas y documentadas en supabase/seed.sql.

CRITERIOS DE ACEPTACIÓN
- Con un token de empleado, consultar arqueos por API devuelve 0 filas
- Con un token de empleado, la respuesta de productos NO incluye
  precio_costo_centavos
- Un usuario del comercio A no lee ni una fila del comercio B (probarlo con
  llamadas directas a la API, no desde la UI)
- El cambio de operador no pierde el estado de la app
- Toda autorización del dueño deja una fila en auditoria

IMPORTANTE: no alcanza con esconder botones. Cada punto de arriba se verifica
llamando a la API directamente con el token del empleado.
```
