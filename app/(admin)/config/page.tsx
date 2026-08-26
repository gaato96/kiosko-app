import { contextoAdmin } from "@/lib/admin";
import { FormularioConfig } from "./formulario";
import { PanelUsuarios } from "./usuarios";
import type { UsuarioComercio } from "@/lib/tipos";

export const metadata = { title: "Configuración" };
export const dynamic = "force-dynamic";

export default async function Config() {
  const { supabase, usuarioId } = await contextoAdmin();

  const [{ data: comercio }, { data: config }, { data: usuarios }, { data: zonas }] =
    await Promise.all([
      supabase.from("comercios").select("*").maybeSingle(),
      supabase.from("config_comercio").select("*").maybeSingle(),
      supabase.from("usuarios_comercio").select("id, comercio_id, nombre, rol, activo").order("nombre"),
      supabase.from("zonas_envio").select("*").order("costo_centavos"),
    ]);

  if (!comercio || !config) return null;

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-bold">Configuración</h1>
        <p className="text-text-muted">Lo que define cómo se comporta el sistema en tu kiosco.</p>
      </header>

      <FormularioConfig comercio={comercio} config={config} zonas={zonas ?? []} />

      <PanelUsuarios usuarios={(usuarios ?? []) as UsuarioComercio[]} usuarioActual={usuarioId} />
    </div>
  );
}
