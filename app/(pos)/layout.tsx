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
    .select("id, nombre")
    .eq("id", tenant.comercioId)
    .maybeSingle();

  return (
    <div className="tema-pos flex h-dvh flex-col overflow-hidden bg-bg text-text">
      <ArranquePos
        comercioId={tenant.comercioId}
        comercioNombre={comercio?.nombre ?? null}
        rol={tenant.rol === "anon" ? "empleado" : tenant.rol}
        usuarioId={data.claims.sub}
      />
      {children}
    </div>
  );
}
