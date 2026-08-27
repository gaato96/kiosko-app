import { contextoAdmin } from "@/lib/admin";
import { EncabezadoPagina } from "@/components/ui/tarjeta";
import { PanelProveedores, type ProductoDeProveedor } from "./panel";
import type { Proveedor } from "@/lib/tipos";

export const metadata = { title: "Proveedores" };
export const dynamic = "force-dynamic";

/**
 * Proveedores.
 *
 * La tabla existía desde el primer esquema y `productos.proveedor_id` también,
 * pero no había ninguna pantalla para cargarlos: la lista de "Para reponer"
 * agrupaba absolutamente todo bajo "Sin proveedor" y el pedido por WhatsApp no
 * se le podía mandar a nadie. Sin esta pantalla, la mitad del módulo de stock
 * no funcionaba.
 */
export default async function Proveedores() {
  const { supabase } = await contextoAdmin();

  const [{ data: proveedores }, { data: productos }] = await Promise.all([
    supabase.from("proveedores").select("*").eq("activo", true).order("nombre"),
    supabase
      .from("productos")
      .select("id, nombre, proveedor_id, categoria_id")
      .eq("activo", true)
      .order("nombre")
      .limit(2000),
  ]);

  const lista = (proveedores ?? []) as Proveedor[];

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina
        className="mb-0"
        titulo="Proveedores"
        bajada={
          lista.length === 0
            ? "Cargá a quién le comprás. Con eso, la lista de reposición se convierte en pedidos de WhatsApp listos para mandar."
            : `${lista.length} ${lista.length === 1 ? "activo" : "activos"}`
        }
      />

      <PanelProveedores
        proveedores={lista}
        productos={(productos ?? []) as ProductoDeProveedor[]}
      />
    </div>
  );
}
