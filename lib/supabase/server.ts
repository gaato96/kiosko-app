import "server-only";

/**
 * Clientes de Supabase para el servidor.
 *
 *  - `supabaseServer()`  — con la sesión del usuario. Respeta RLS. Es el que se
 *    usa en el 99% de los casos.
 *  - `supabaseAnon()`    — sin sesión, para la Vidriera pública (/t/[slug]).
 *  - `supabaseAdmin()`   — service role. Saltea RLS. Solo para alta de comercios
 *    y tareas de plataforma. Nunca en un handler que reciba input del público
 *    sin validar el tenant a mano.
 */

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "./types";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function supabaseServer() {
  const cookieStore = await cookies();

  return createServerClient<Database>(URL, ANON, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Llamado desde un Server Component: el middleware ya refresca la sesión.
        }
      },
    },
  });
}

/** Sin sesión: la Vidriera pública lee vistas que ya filtran lo publicable. */
export function supabaseAnon() {
  return createClient<Database>(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function supabaseAdmin() {
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!clave) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY");
  return createClient<Database>(URL, clave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
