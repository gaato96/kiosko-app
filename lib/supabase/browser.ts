"use client";

/**
 * Cliente de Supabase para el navegador. Uno solo por pestaña.
 */

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

let cliente: ReturnType<typeof crear> | null = null;

function crear() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export function supabaseBrowser() {
  if (!cliente) cliente = crear();
  return cliente;
}

export type SupabaseBrowser = ReturnType<typeof supabaseBrowser>;
