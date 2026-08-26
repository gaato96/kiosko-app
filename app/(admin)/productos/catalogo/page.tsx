import { contextoAdmin } from "@/lib/admin";
import { ImportadorCatalogo } from "./importador";
import type { CatalogoBase } from "@/lib/supabase/types";

export const metadata = { title: "Arranque rápido" };
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
        <h1 className="font-display text-2xl font-bold">Arranque rápido</h1>
        <p className="max-w-2xl text-text-muted">
          Son {catalogo?.length ?? 0} productos comunes de kiosco para no cargar todo a mano el
          primer día. No es el listado de todo lo que se vende en Argentina, ni pretende serlo:
          lo tuyo de verdad lo cargás vos en Productos, con tu precio y tu costo. Tildá lo que
          vendas y ponele precio.
        </p>
      </header>

      <ImportadorCatalogo
        catalogo={(catalogo ?? []) as CatalogoBase[]}
        yaCargados={Array.from(yaCargados)}
      />
    </div>
  );
}
