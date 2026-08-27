import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { tenantDeClaims } from "@/lib/auth";
import { ArranquePos } from "./arranque";

export const metadata: Metadata = { title: "Mostrador" };

/**
 * Layout del POS: pantalla completa, tema oscuro fijo, sin nada del admin.
 * Turno largo, menos fatiga, menos batería en una tablet OLED.
 */
export default async function LayoutPos({ children }: { children: React.ReactNode }) {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) redirect("/login");

  const tenant = tenantDeClaims(data.claims);
  if (!tenant.comercioId) redirect("/onboarding");

  const { data: comercio } = await supabase
    .from("comercios")
    .select("id, nombre, logo_url")
    .eq("id", tenant.comercioId)
    .maybeSingle();

  return (
    // `overscroll-none` corta el rebote de iOS: sin eso, arrastrar la grilla
    // hasta el final tironeaba la página entera y el buscador se iba de
    // pantalla, que es lo que hacía sentir que el scroll del POS estaba roto.
    <div className="tema-pos borde-seguro-arriba flex h-dvh flex-col overflow-hidden overscroll-none bg-bg text-text">
      <ArranquePos
        comercioId={tenant.comercioId}
        comercioNombre={comercio?.nombre ?? null}
        comercioLogo={comercio?.logo_url ?? null}
        rol={tenant.rol === "anon" ? "empleado" : tenant.rol}
        usuarioId={data.claims.sub}
      />
      {children}
    </div>
  );
}
