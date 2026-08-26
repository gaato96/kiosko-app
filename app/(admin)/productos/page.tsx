import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Boton } from "@/components/ui/boton";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { COLUMNAS_PRODUCTO, contextoAdmin } from "@/lib/admin";
import { ListaProductos } from "./lista";
import type { Producto } from "@/lib/tipos";

export const metadata = { title: "Productos" };
export const dynamic = "force-dynamic";

export default async function Productos() {
  const { supabase } = await contextoAdmin();

  const [{ data: productos }, { data: categorias }, { data: costos }] = await Promise.all([
    supabase.from("productos").select(COLUMNAS_PRODUCTO).eq("activo", true).order("nombre").limit(2000),
    supabase.from("categorias").select("*").order("orden"),
    // Los costos vienen por una vista aparte porque el privilegio de columna
    // sobre `productos` se lo revoca a todo `authenticated`.
    supabase.from("productos_costos").select("id, precio_costo_centavos"),
  ]);

  const lista = (productos ?? []) as Producto[];
  const costoPorId = Object.fromEntries(
    (costos ?? []).map((c) => [c.id, c.precio_costo_centavos ?? 0]),
  );

  if (lista.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold">Productos</h1>
        <EstadoVacio
          icono={Sparkles}
          titulo="Todavía no cargaste productos"
          detalle="No los cargues a mano. Empezá por el catálogo argentino: tildás lo que vendés, le ponés precio y en diez minutos estás cobrando."
          accion={
            <Link href="/productos/catalogo">
              <Boton variante="primario" tamano="grande">
                Empezar con el catálogo
              </Boton>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Productos</h1>
          <p className="text-text-muted">{lista.length} activos</p>
        </div>
        <div className="flex gap-2">
          <Link href="/productos/catalogo">
            <Boton>
              <Sparkles size={18} /> Catálogo argentino
            </Boton>
          </Link>
          <Link href="/precios">
            <Boton variante="primario">Actualizar precios</Boton>
          </Link>
        </div>
      </header>

      <ListaProductos productos={lista} categorias={categorias ?? []} costos={costoPorId} />
    </div>
  );
}
