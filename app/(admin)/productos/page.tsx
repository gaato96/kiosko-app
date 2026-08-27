import Link from "next/link";
import { Sparkles, Tags } from "lucide-react";
import { EncabezadoPagina } from "@/components/ui/tarjeta";
import { COLUMNAS_PRODUCTO, contextoAdmin } from "@/lib/admin";
import { ListaProductos } from "./lista";
import type { Producto, Proveedor } from "@/lib/tipos";

export const metadata = { title: "Productos" };
export const dynamic = "force-dynamic";

export default async function Productos() {
  const { supabase, comercioId } = await contextoAdmin();

  const [{ data: productos }, { data: categorias }, { data: proveedores }, { data: costos }] =
    await Promise.all([
      supabase.from("productos").select(COLUMNAS_PRODUCTO).eq("activo", true).order("nombre").limit(2000),
      supabase.from("categorias").select("*").eq("activo", true).order("orden"),
      supabase.from("proveedores").select("*").eq("activo", true).order("nombre"),
      // Los costos vienen por una vista aparte porque el privilegio de columna
      // sobre `productos` se lo revoca a todo `authenticated`.
      supabase.from("productos_costos").select("id, precio_costo_centavos"),
    ]);

  const lista = (productos ?? []) as Producto[];
  const costoPorId = Object.fromEntries(
    (costos ?? []).map((c) => [c.id, c.precio_costo_centavos ?? 0]),
  );

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina
        className="mb-0"
        titulo="Productos"
        bajada={
          lista.length === 0
            ? "Todavía no cargaste nada. Empezá por lo que más vendés."
            : `${lista.length} ${lista.length === 1 ? "activo" : "activos"}`
        }
        acciones={
          <>
            {/*
              El catálogo semilla NO es el camino principal y por eso quedó acá,
              chico y con lo que trae dicho de frente: son 266 productos comunes
              para no arrancar de cero, no el listado de todo lo que se vende en
              Argentina. Presentarlo como "el catálogo" prometía algo que no es
              y dejaba el alta a mano escondida, que es lo que se usa siempre.
            */}
            <Link
              href="/productos/catalogo"
              className="presion flex min-h-11 items-center gap-2 rounded-[var(--radio)] px-3.5 text-sm font-semibold text-text-muted hover:bg-surface-alt hover:text-text"
              title="266 productos comunes para arrancar sin cargar todo a mano"
            >
              <Sparkles size={16} aria-hidden />
              Arranque rápido
            </Link>
            <Link
              href="/precios"
              className="presion flex min-h-11 items-center gap-2 rounded-[var(--radio)] border border-border bg-surface px-4 text-sm font-semibold hover:border-border-fuerte"
            >
              <Tags size={16} aria-hidden />
              Actualizar precios
            </Link>
          </>
        }
      />

      <ListaProductos
        productos={lista}
        categorias={categorias ?? []}
        proveedores={(proveedores ?? []) as Proveedor[]}
        costos={costoPorId}
        comercioId={comercioId}
      />
    </div>
  );
}
