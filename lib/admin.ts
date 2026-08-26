import "server-only";

/**
 * lib/admin.ts — helpers de servidor para el admin.
 *
 * Todo lo de acá corre con la sesión del usuario, así que RLS ya filtra por
 * comercio. El `comercio_id` que se devuelve sale del JWT, nunca de la URL.
 */

import { redirect } from "next/navigation";
import { tenantDeClaims } from "./auth";
import { supabaseServer } from "./supabase/server";

export async function contextoAdmin() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) redirect("/login");

  const tenant = tenantDeClaims(data.claims);
  if (!tenant.comercioId) redirect("/onboarding");
  if (tenant.rol !== "dueno") redirect("/sin-permiso");

  return { supabase, comercioId: tenant.comercioId, usuarioId: data.claims.sub };
}

export { COLUMNAS_PRODUCTO, COLUMNAS_VENTA, COLUMNAS_VENTA_ITEM } from "./columnas";
