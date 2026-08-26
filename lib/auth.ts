/**
 * lib/auth.ts — lectura del tenant y del rol desde el JWT.
 *
 * `comercio_id` y `rol` los inyecta el custom access token hook de Supabase en
 * `app_metadata` DENTRO DEL JWT. Ojo con esto: `supabase.auth.getUser()`
 * devuelve el registro de `auth.users` (vía llamada al servidor), no el
 * contenido del token — el `app_metadata` que trae NO incluye lo que agregó el
 * hook. Para leer el tenant hay que decodificar el JWT de verdad, con
 * `supabase.auth.getClaims()`.
 *
 * Esto es para DECIDIR QUÉ MOSTRAR. Los permisos de verdad los aplica RLS del
 * lado de la base, que sí lee el JWT real en cada request.
 */

import type { Rol } from "./tipos";

export type Tenant = { comercioId: string | null; rol: Rol | "anon" };

/** Acepta tanto `User.app_metadata` como `JwtPayload.app_metadata`: misma forma. */
type ConAppMetadata = { app_metadata?: Record<string, unknown> | null } | null | undefined;

export function tenantDeClaims(claims: ConAppMetadata): Tenant {
  const meta = (claims?.app_metadata ?? {}) as { comercio_id?: string; rol?: string };
  const rol = meta.rol === "dueno" || meta.rol === "empleado" ? meta.rol : "anon";
  return { comercioId: meta.comercio_id ?? null, rol };
}

export function esDueno(tenant: Tenant): boolean {
  return tenant.rol === "dueno";
}
