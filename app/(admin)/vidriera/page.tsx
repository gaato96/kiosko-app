import { contextoAdmin } from "@/lib/admin";
import { BandejaPedidos } from "./bandeja";
import type { PedidoConItems } from "@/lib/tipos";
import { urlVidriera } from "@/lib/url";

export const metadata = { title: "Pedidos" };
export const dynamic = "force-dynamic";

export default async function Vidriera() {
  // El empleado también entra: el pedido lo atiende quien está en el mostrador.
  const { supabase, comercioId, rol } = await contextoAdmin({ roles: ["dueno", "empleado"] });

  const [{ data: comercio }, { data: pedidos }, { data: zonas }] = await Promise.all([
    supabase.from("comercios").select("id, nombre, slug, vidriera_activa, telefono_whatsapp").maybeSingle(),
    // Con los items adentro: sin saber QUÉ pidió no se puede preparar nada.
    supabase
      .from("pedidos_vidriera")
      .select("*, items:pedidos_items(*)")
      .order("creado_en", { ascending: false })
      .limit(50),
    supabase.from("zonas_envio").select("*").eq("activo", true),
  ]);

  const url = comercio ? urlVidriera(comercio.slug, process.env.NEXT_PUBLIC_APP_URL) : "";

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl font-bold">Pedidos</h1>
        <p className="text-text-muted">
          {rol === "dueno"
            ? "Tu canal de pedidos propio. Sin comisión de las apps de delivery."
            : "Lo que entró por la Vidriera. Confirmá, preparalo y marcalo entregado."}
        </p>
      </header>

      <BandejaPedidos
        comercioId={comercioId}
        slug={comercio?.slug ?? ""}
        url={url}
        activa={comercio?.vidriera_activa ?? false}
        pedidos={(pedidos ?? []) as unknown as PedidoConItems[]}
        zonas={zonas ?? []}
      />
    </div>
  );
}
