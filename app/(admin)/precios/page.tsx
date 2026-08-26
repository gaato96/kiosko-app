import { contextoAdmin } from "@/lib/admin";
import { ActualizadorPrecios } from "./actualizador";

export const metadata = { title: "Precios" };
export const dynamic = "force-dynamic";

/**
 * M7 · Actualización masiva por porcentaje.
 *
 * En Argentina este es, después del POS, el módulo que más se usa. Siempre con
 * VISTA PREVIA antes de aplicar, y con deshacer por 24 h: subir un 12% a 400
 * productos sin poder volver atrás es una forma rápida de perder la confianza.
 */
export default async function Precios() {
  const { supabase } = await contextoAdmin();

  const [{ data: categorias }, { data: proveedores }, { data: config }, { data: lotes }] =
    await Promise.all([
      supabase.from("categorias").select("id, nombre").order("orden"),
      supabase.from("proveedores").select("id, nombre").eq("activo", true).order("nombre"),
      supabase.from("config_comercio").select("redondeo_centavos, margen_objetivo_pct").maybeSingle(),
      supabase
        .from("precios_historial")
        .select("lote_id, creado_en, motivo")
        .not("lote_id", "is", null)
        .gte("creado_en", new Date(Date.now() - 24 * 3600_000).toISOString())
        .order("creado_en", { ascending: false })
        .limit(50),
    ]);

  // Un lote son muchas filas del historial; para deshacer alcanza con la primera.
  const lotesUnicos = Array.from(
    new Map((lotes ?? []).map((l) => [l.lote_id, l])).values(),
  ).slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Actualizar precios</h1>
        <p className="text-text-muted">
          Subí o bajá un porcentaje sobre un grupo de productos. Siempre vas a ver la vista previa
          antes de que se aplique nada.
        </p>
      </header>

      <ActualizadorPrecios
        categorias={categorias ?? []}
        proveedores={proveedores ?? []}
        redondeoCentavos={config?.redondeo_centavos ?? 1}
        lotesRecientes={lotesUnicos.map((l) => ({
          loteId: l.lote_id as string,
          creadoEn: l.creado_en,
        }))}
      />
    </div>
  );
}
