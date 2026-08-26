# M1 · Auth y RBAC

## Objetivo

Que el dueño vea todo y el empleado vea solo lo que necesita para atender, con
los permisos verificados en la base de datos y no escondiendo botones.

## User stories

- Como dueño, entro con mi mail y contraseña y accedo a todo.
- Como dueño, doy de alta a un empleado con un PIN y elijo qué puede hacer.
- Como empleado, entro al POS y solo veo lo del mostrador.
- Como empleado, paso el mostrador a un compañero con su PIN, sin cerrar sesión
  y sin perder el ticket en curso.
- Como dueño, autorizo con mi PIN una anulación o un descuento sin desloguear al
  empleado.

## Matriz de permisos

| Acción | Dueño | Empleado |
|---|:--:|:--:|
| Vender, cobrar, calcular vuelto | ✅ | ✅ |
| Consultar precios y stock | ✅ | ✅ |
| Cargar fiado a un cliente existente | ✅ | ✅ |
| Abrir caja y registrar movimientos | ✅ | ✅ |
| Cerrar caja (declarar efectivo) | ✅ | ✅ |
| **Ver el efectivo esperado y la diferencia** | ✅ | ❌ |
| **Ver costos y márgenes** | ✅ | ❌ |
| Crear y editar productos | ✅ | ❌ |
| Cambiar precios | ✅ | ❌ |
| Anular una venta | ✅ | ⚠️ con PIN del dueño |
| Aplicar descuento | ✅ | ⚠️ con PIN del dueño |
| Crear clientes / fijar límite de crédito | ✅ | ❌ |
| Vender por encima del límite de crédito | ✅ | ⚠️ con PIN del dueño |
| Cargar compras y ajustar stock | ✅ | ❌ |
| Reportes y métricas | ✅ | ❌ |
| Gastos | ✅ | ❌ |
| Configurar la Vidriera | ✅ | ❌ |
| Ver y despachar pedidos | ✅ | ✅ |

## Reglas de negocio

1. **El rol vive en el JWT** (`app_metadata.rol`), inyectado por el custom access
   token hook. Cambiar el rol de un usuario exige refrescar la sesión.
2. **Todo permiso se valida en RLS o dentro del RPC.** Esconder la UI es
   presentación, no seguridad. Criterio de aceptación explícito: consultar la API
   directamente con un token de empleado debe devolver 0 filas para lo que no le
   corresponde.
3. **El PIN no es una credencial de login.** Sirve para cambiar de operador dentro
   de un dispositivo ya autenticado y para autorizar acciones. Es de 4 dígitos,
   se guarda con bcrypt y **se valida en el servidor** (`validar_pin`), nunca
   comparando en el cliente.
4. Un dispositivo mantiene una sola sesión de Supabase. El "operador actual"
   (`usuario_id` que se estampa en cada venta) es una capa por encima.
5. Bloqueo por PIN incorrecto: 5 intentos fallidos → 60 segundos de espera.
6. La sesión no expira sola durante el día. Un kiosco no puede quedarse sin cobrar
   porque venció un token: refresh silencioso y, si falla estando offline, el POS
   sigue funcionando con la última sesión válida.

## Pantallas

### Login
Mail + contraseña. Un solo campo por vez, teclado grande. Recordar sesión por
defecto (es un dispositivo del negocio, no público).

### Selector de operador (POS)
Aparece al abrir el POS si hay más de un usuario activo. Grilla de avatares con
la inicial y el nombre. Se toca, se ingresa el PIN de 4 dígitos con numpad grande.

### Autorización del dueño (modal)
Se dispara al anular, descontar o pasar un límite de crédito. Muestra qué se está
autorizando en una línea, pide el PIN del dueño, registra en `auditoria` quién
autorizó qué. **Nunca autoriza sin dejar rastro.**

### Alta de usuario (admin)
Nombre, mail, rol, PIN. El invitado recibe un magic link de Supabase.

## Datos

`usuarios_comercio` (id = `auth.users.id`, `comercio_id`, `nombre`, `rol`,
`pin_hash`, `activo`), `dispositivos`, `auditoria`.

## Custom access token hook

```sql
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable as $fn$
declare
  claims jsonb;
  u record;
begin
  select comercio_id, rol into u
    from usuarios_comercio
   where id = (event ->> 'user_id')::uuid and activo;

  claims := coalesce(event -> 'claims' -> 'app_metadata', '{}'::jsonb);

  if u.comercio_id is not null then
    claims := claims
      || jsonb_build_object('comercio_id', u.comercio_id)
      || jsonb_build_object('rol', u.rol);
  end if;

  return jsonb_set(event, '{claims,app_metadata}', claims);
end $fn$;
```

## Casos borde

| Caso | Comportamiento |
|---|---|
| Usuario sin `comercio_id` (invitación a medias) | Pantalla de onboarding, no error 500. |
| Empleado desactivado con sesión abierta | Las políticas RLS dejan de matchear al refrescar el token; se lo saca al login con un mensaje claro. |
| PIN olvidado | Solo el dueño lo resetea desde admin. No hay recuperación por mail para el PIN. |
| Dueño único que olvida su PIN | Recuperación por contraseña de la cuenta (el PIN se resetea desde el perfil). |
| Sin conexión al momento de validar el PIN | Se permite el cambio de operador con el hash cacheado en Dexie; las autorizaciones del dueño (anular, exceder crédito) **quedan pendientes de validación** y se registran como "autorizada offline" en la auditoría. |

## Criterios de aceptación

- [ ] Con un token de empleado, `select * from arqueos` devuelve 0 filas.
- [ ] Con un token de empleado, la respuesta de la API de productos **no incluye**
      `precio_costo_centavos`.
- [ ] Un empleado del comercio A no puede leer ni una fila del comercio B.
- [ ] El cambio de operador conserva el ticket en curso.
- [ ] Toda anulación deja una fila en `auditoria` con quién la pidió y quién la
      autorizó.
