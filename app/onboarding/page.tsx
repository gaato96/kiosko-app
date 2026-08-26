import { redirect } from "next/navigation";
import { tenantDeClaims } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { FormularioOnboarding } from "./formulario";

export const metadata = { title: "Empezar" };
export const dynamic = "force-dynamic";

/**
 * Un usuario autenticado sin `comercio_id` cae acá.
 *
 * Pasa en dos casos: alguien que se registra por su cuenta, y una invitación a
 * medias (entró por el magic link pero el dueño todavía no lo asoció). En
 * ninguno de los dos tiene que ver un error 500.
 */
export default async function Onboarding() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) redirect("/login");
  const claims = data.claims;

  const tenant = tenantDeClaims(claims);
  if (tenant.comercioId) redirect("/pos");

  // ¿Existe la fila pero el JWT todavía no la trae? Es una sesión vieja: falta
  // que la persona vuelva a loguearse para que el hook la incluya.
  const { data: fila } = await supabase
    .from("usuarios_comercio")
    .select("comercio_id")
    .eq("id", claims.sub)
    .maybeSingle();

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Bienvenido</h1>
        <p className="mt-1 text-text-muted">
          {fila
            ? "Tu usuario ya está asociado a un kiosco, pero tu sesión es anterior a eso."
            : "Todavía no estás en ningún kiosco. Podés crear el tuyo ahora."}
        </p>
      </div>

      <FormularioOnboarding yaAsociado={Boolean(fila)} mail={claims.email ?? ""} />
    </main>
  );
}
