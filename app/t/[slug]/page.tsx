import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { supabaseAnon } from "@/lib/supabase/server";
import { Vidriera } from "./vidriera";
import type { ProductoVidriera } from "@/lib/tipos";

/**
 * La Vidriera pública.
 *
 * Server Component con ISR: carga rápido en 4G y es indexable. Sin login, sin
 * instalar nada. Los datos salen de la vista `vidriera_productos`, que no expone
 * costos, márgenes, stock exacto ni proveedores.
 *
 * No usa el tema del POS: es la cara pública del kiosco y tiene que verse como
 * un comercio, no como un sistema de gestión.
 */
export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

async function traerComercio(slug: string) {
  const sb = supabaseAnon();
  const { data } = await sb
    .from("comercios")
    .select("id, nombre, slug, telefono_whatsapp, direccion, logo_url, vidriera_activa, activo")
    .eq("slug", slug)
    .eq("vidriera_activa", true)
    .eq("activo", true)
    .maybeSingle();
  return data;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const comercio = await traerComercio(slug);
  if (!comercio) return { title: "Vidriera" };

  return {
    title: comercio.nombre,
    description: `Pedí online en ${comercio.nombre}. Retiro o envío a domicilio.`,
    openGraph: { title: comercio.nombre, type: "website" },
  };
}

export default async function PaginaVidriera({ params }: Props) {
  const { slug } = await params;
  const comercio = await traerComercio(slug);
  if (!comercio) notFound();

  const sb = supabaseAnon();

  const [{ data: productos }, { data: categorias }, { data: zonas }, { data: config }] =
    await Promise.all([
      sb.from("vidriera_productos").select("*").eq("comercio_id", comercio.id).limit(1000),
      sb.from("categorias").select("id, nombre, emoji, color, orden").eq("comercio_id", comercio.id).order("orden"),
      sb
        .from("zonas_envio")
        .select("id, nombre, costo_centavos, monto_minimo_centavos")
        .eq("comercio_id", comercio.id)
        .eq("activo", true),
      sb
        .from("config_comercio")
        .select("vidriera_titulo, vidriera_mensaje, vidriera_horarios, mostrar_sin_stock, monto_minimo_envio_centavos")
        .eq("comercio_id", comercio.id)
        .maybeSingle(),
    ]);

  const lista = (productos ?? []) as ProductoVidriera[];
  const mostrarSinStock = config?.mostrar_sin_stock ?? true;

  return (
    <Vidriera
      comercio={{
        id: comercio.id,
        nombre: comercio.nombre,
        slug: comercio.slug,
        telefono: comercio.telefono_whatsapp,
        direccion: comercio.direccion,
        logoUrl: comercio.logo_url,
      }}
      titulo={config?.vidriera_titulo ?? comercio.nombre}
      mensaje={config?.vidriera_mensaje ?? null}
      horarios={(config?.vidriera_horarios as Record<string, [string, string]> | null) ?? null}
      productos={mostrarSinStock ? lista : lista.filter((p) => p.disponible)}
      categorias={categorias ?? []}
      zonas={zonas ?? []}
    />
  );
}
