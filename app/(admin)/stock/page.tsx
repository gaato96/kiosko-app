import { PackageCheck } from "lucide-react";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { contextoAdmin } from "@/lib/admin";
import { PanelReposicion, type FilaReposicion } from "./reposicion";

export const metadata = { title: "Stock" };
export const dynamic = "force-dynamic";

/**
 * "Para reponer", agrupada POR PROVEEDOR.
 *
 * Una lista única no sirve: el pedido se le manda a la distribuidora, a la
 * panadería y al de golosinas por separado. Agrupar por proveedor convierte la
 * lista en N mensajes de WhatsApp listos para enviar.
 */
export default async function Stock() {
  const { supabase } = await contextoAdmin();

  const [{ data: reponer }, { data: comercio }] = await Promise.all([
    supabase.from("productos_a_reponer").select("*").limit(500),
    supabase.from("comercios").select("nombre").maybeSingle(),
  ]);

  const filas = (reponer ?? []) as FilaReposicion[];

  if (filas.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold">Stock</h1>
        <EstadoVacio
          icono={PackageCheck}
          titulo="No falta nada"
          detalle="Todos los productos que controlan stock están por encima de su mínimo. Esta lista se llena sola cuando algo baja."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Para reponer</h1>
        <p className="text-text-muted">{filas.length} productos por debajo del mínimo</p>
      </header>

      <PanelReposicion filas={filas} nombreComercio={comercio?.nombre ?? "el kiosco"} />
    </div>
  );
}
