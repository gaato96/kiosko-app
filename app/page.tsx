import { redirect } from "next/navigation";
import { tenantDeClaims } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * La raíz no muestra nada: decide a dónde va cada quien.
 *
 * El dueño arranca en el panel — entra a mirar cómo viene el día. El empleado
 * arranca en el mostrador, que es lo único que puede hacer. Antes esto era un
 * menú de tres links, que obligaba a un toque de más a quien abre la app
 * cincuenta veces por día.
 */
export default async function Inicio() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) redirect("/login");

  const tenant = tenantDeClaims(data.claims);
  if (!tenant.comercioId) redirect("/onboarding");

  redirect(tenant.rol === "dueno" ? "/reportes" : "/pos");
}
