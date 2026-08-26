import { contextoAdmin } from "@/lib/admin";
import { formatearPesos } from "@/lib/money";
import { ListaDeudores } from "./lista";
import type { Cliente } from "@/lib/tipos";

export const metadata = { title: "Fiados" };
export const dynamic = "force-dynamic";

export default async function Clientes() {
  const { supabase } = await contextoAdmin();

  const [{ data: clientes }, { data: comercio }] = await Promise.all([
    supabase.from("clientes").select("*").eq("activo", true).order("saldo_centavos", { ascending: false }),
    supabase.from("comercios").select("nombre").maybeSingle(),
  ]);

  const lista = (clientes ?? []) as Cliente[];
  const totalFiado = lista.reduce((a, c) => a + Math.max(0, c.saldo_centavos), 0);
  const conDeuda = lista.filter((c) => c.saldo_centavos > 0).length;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Fiados</h1>
        <p className="text-text-muted">
          {conDeuda} {conDeuda === 1 ? "cliente debe" : "clientes deben"} plata
        </p>
      </header>

      {/* El número que la mayoría de los kiosqueros no conoce, y que suele sorprender. */}
      <section className="tarjeta p-5">
        <p className="text-xs uppercase tracking-wide text-text-muted">Fiado en la calle</p>
        <p className="num text-4xl font-bold">{formatearPesos(totalFiado)}</p>
        <p className="mt-1 text-sm text-text-muted">
          Es plata tuya que está afuera. Cobrarla no requiere vender nada nuevo.
        </p>
      </section>

      <ListaDeudores clientes={lista} nombreComercio={comercio?.nombre ?? "el kiosco"} />
    </div>
  );
}
