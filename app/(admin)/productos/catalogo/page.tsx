import { contextoAdmin } from "@/lib/admin";
import { ImportadorCatalogo } from "./importador";
import type { CatalogoBase } from "@/lib/supabase/types";

export const metadata = { title: "Catálogo argentino" };
export const dynamic = "force-dynamic";

/**
 * El catálogo semilla es el módulo que decide si el producto se adopta o no.
 *
 * El riesgo real no es técnico: nadie carga 400 productos a mano antes de vender
 * el primero. Acá el dueño tilda lo que vende, le pone precio y sale a cobrar.
 */
export default async function CatalogoSemilla() {
  const { supabase } = await contextoAdmin();

  const [{ data: catalogo }, { data: existentes }] = await Promise.all([
    supabase.from("catalogo_base").select("*").order("popularidad", { ascending: false }).limit(1000),
    supabase.from("productos").select("nombre").limit(2000),
  ]);

  const yaCargados = new Set((existentes ?? []).map((p) => p.nombre.toLowerCase()));

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Catálogo argentino</h1>
        <p className="text-text-muted">
          Tildá lo que vendés y ponele el precio. Lo que no tildes no se carga, y siempre podés
          volver a esta pantalla.
        </p>
      </header>

      <ImportadorCatalogo
        catalogo={(catalogo ?? []) as CatalogoBase[]}
        yaCargados={Array.from(yaCargados)}
      />
    </div>
  );
}
