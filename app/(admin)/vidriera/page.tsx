import { contextoAdmin } from "@/lib/admin";
import { BandejaPedidos } from "./bandeja";
import type { PedidoVidriera } from "@/lib/tipos";
import { urlVidriera } from "@/lib/url";

export const metadata = { title: "Vidriera" };
export const dynamic = "force-dynamic";

export default async function Vidriera() {
  const { supabase, comercioId } = await contextoAdmin();

  const [{ data: comercio }, { data: pedidos }, { data: zonas }] = await Promise.all([
    supabase.from("comercios").select("id, nombre, slug, vidriera_activa, telefono_whatsapp").maybeSingle(),
    supabase
      .from("pedidos_vidriera")
      .select("*")
      .order("creado_en", { ascending: false })
      .limit(50),
    supabase.from("zonas_envio").select("*").eq("activo", true),
  ]);

  const url = comercio ? urlVidriera(comercio.slug, process.env.NEXT_PUBLIC_APP_URL) : "";

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Vidriera</h1>
        <p className="text-text-muted">
          Tu canal de pedidos propio. Sin comisión de las apps de delivery.
        </p>
      </header>

      <BandejaPedidos
        comercioId={comercioId}
        slug={comercio?.slug ?? ""}
        url={url}
        activa={comercio?.vidriera_activa ?? false}
        pedidos={(pedidos ?? []) as PedidoVidriera[]}
        zonas={zonas ?? []}
      />
    </div>
  );
}
