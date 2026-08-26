import Link from "next/link";
import { redirect } from "next/navigation";
import { Store, Zap } from "lucide-react";
import { Proveedores } from "@/app/proveedores";
import { tenantDeClaims } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { CandadoOperador } from "./candado-operador";
import { NavAdmin } from "./nav";

/**
 * Layout del admin.
 *
 * Casi todo es del dueño y el middleware ya devuelve 403 antes de llegar acá,
 * ruta por ruta. La excepción es la bandeja de pedidos, que la atiende quien
 * esté en el mostrador: por eso acá se deja pasar al empleado y el corte fino
 * lo hace cada pantalla con `contextoAdmin({ roles })`. La verificación que
 * manda, siempre, es RLS.
 */
export default async function LayoutAdmin({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) redirect("/login");

  const tenant = tenantDeClaims(data.claims);
  if (!tenant.comercioId) redirect("/onboarding");
  if (tenant.rol === "anon") redirect("/sin-permiso");

  const { data: comercio } = await supabase
    .from("comercios")
    .select("nombre")
    .eq("id", tenant.comercioId)
    .maybeSingle();

  return (
    <Proveedores>
      {/* El candado envuelve TODO, menú incluido. Si en el mostrador quedó un
          empleado con PIN, no tiene que ver ni la lista de secciones: la
          sesión del navegador es la del dueño y el servidor no los distingue.
          Ver candado-operador.tsx. */}
      <CandadoOperador>
        <div className="flex min-h-dvh flex-col lg:flex-row">
          <aside className="vidrio sticky top-0 z-30 shrink-0 border-b border-border lg:h-dvh lg:w-60 lg:border-b-0 lg:border-r">
            <div className="flex h-full flex-col">
              <div className="hidden items-center gap-2.5 px-4 py-5 lg:flex">
                <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radio-sm)] bg-tinta text-brand-fg shadow-[var(--sombra-1)]">
                  <Store size={17} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-display text-sm font-semibold leading-tight">
                    {comercio?.nombre ?? "Kiosko App"}
                  </span>
                  <span className="block text-[0.6875rem] leading-tight text-text-sutil">
                    {tenant.rol === "dueno" ? "Administración" : "Mostrador"}
                  </span>
                </span>
              </div>

              <NavAdmin rol={tenant.rol} />

              <div className="hidden border-t border-border p-3 lg:block">
                <Link
                  href="/pos"
                  className="presion flex min-h-12 items-center justify-center gap-2 rounded-[var(--radio)] bg-[linear-gradient(180deg,var(--plata-viva),var(--plata))] px-3 text-sm font-bold text-plata-fg shadow-[var(--sombra-2)] hover:brightness-110"
                >
                  <Zap size={16} aria-hidden />
                  Ir a cobrar
                </Link>
              </div>
            </div>
          </aside>

          <main className="min-w-0 flex-1 px-4 py-6 lg:px-8 lg:py-8">
            <div className="mx-auto w-full max-w-7xl">{children}</div>
          </main>
        </div>
      </CandadoOperador>
    </Proveedores>
  );
}
