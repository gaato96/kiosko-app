import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./types";

/**
 * Refresca la sesión en cada request y devuelve los claims reales del JWT.
 *
 * `getClaims()` y no `getUser()`: `getUser()` devuelve el registro de
 * `auth.users`, que NO incluye lo que agregó el custom access token hook.
 * `comercio_id` y `rol` solo existen dentro del JWT firmado, y `getClaims()`
 * es lo que lo decodifica (y lo verifica). También refresca la sesión si el
 * token está por vencer, así que cubre lo mismo que hacía `getUser()` acá.
 */
export async function actualizarSesion(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();

  return { response, claims: data?.claims ?? null };
}
