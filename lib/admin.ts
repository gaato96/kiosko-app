import "server-only";

/**
 * lib/admin.ts — helpers de servidor para el admin.
 *
 * Todo lo de acá corre con la sesión del usuario, así que RLS ya filtra por
 * comercio. El `comercio_id` que se devuelve sale del JWT, nunca de la URL.
 */

import { redirect } from "next/navigation";
import { tenantDeClaims } from "./auth";
import type { Rol } from "./tipos";
import { supabaseServer } from "./supabase/server";

/**
 * Contexto de una pantalla del admin.
 *
 * Casi todo el admin es del dueño y por eso ese es el default. La excepción es
 * la bandeja de pedidos, que la usa quien esté atendiendo: se declara pasando
 * `roles`. Esto es para decidir qué se muestra; el permiso de verdad lo aplica
 * RLS y, en las escrituras, `exigir_dueno()` adentro de cada RPC.
 */
export async function contextoAdmin({ roles = ["dueno"] }: { roles?: Rol[] } = {}) {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) redirect("/login");

  const tenant = tenantDeClaims(data.claims);
  if (!tenant.comercioId) redirect("/onboarding");
  if (tenant.rol === "anon" || !roles.includes(tenant.rol)) redirect("/sin-permiso");

  return {
    supabase,
    comercioId: tenant.comercioId,
    usuarioId: data.claims.sub,
    rol: tenant.rol,
  };
}

export { COLUMNAS_PRODUCTO, COLUMNAS_VENTA, COLUMNAS_VENTA_ITEM } from "./columnas";
