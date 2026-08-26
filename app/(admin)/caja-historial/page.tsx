import { CircleCheck, CircleMinus, TriangleAlert } from "lucide-react";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { contextoAdmin } from "@/lib/admin";
import { formatearPesos } from "@/lib/money";
import { fechaLocal } from "@/lib/utils";
import type { Arqueo } from "@/lib/supabase/types";

export const metadata = { title: "Cajas" };
export const dynamic = "force-dynamic";

/**
 * Lo que solo ve el dueño: esperado, declarado y diferencia.
 *
 * El valor del módulo no está en el día suelto — una diferencia aislada es un
 * error de vuelto — sino en la SERIE por persona. El mismo signo repetido tres
 * semanas seguidas es otra cosa.
 */
export default async function HistorialCajas() {
  const { supabase } = await contextoAdmin();

  const desde = fechaLocal(new Date(Date.now() - 30 * 86400000));
  const hasta = fechaLocal();

  const [{ data: arqueos }, { data: porEmpleado }, { data: usuarios }] = await Promise.all([
    supabase.from("arqueos").select("*").order("declarado_en", { ascending: false }).limit(60),
    supabase.rpc("diferencias_por_empleado", { p_desde: desde, p_hasta: hasta }),
    supabase.from("usuarios_comercio").select("id, nombre"),
  ]);

  const lista = (arqueos ?? []) as Arqueo[];
  const nombres = Object.fromEntries((usuarios ?? []).map((u) => [u.id, u.nombre]));
  const serie = (porEmpleado ?? []) as Array<{
    usuario_id: string;
    nombre: string;
    cierres: number;
    diferencia_total_centavos: number;
    diferencia_promedio_centavos: number;
  }>;

  if (lista.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold">Cajas</h1>
        <EstadoVacio
          titulo="Todavía no se cerró ninguna caja"
          detalle="El primer arqueo aparece acá en cuanto alguien cierre su turno desde el mostrador."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Cajas</h1>
        <p className="text-text-muted">Últimos 30 días</p>
      </header>

      <section className="tarjeta p-5">
        <h2 className="mb-1 font-semibold">Diferencia acumulada por persona</h2>
        <p className="mb-3 text-sm text-text-muted">
          Esta es la métrica que importa. Un día con diferencia es un error de vuelto; el mismo signo
          todos los días durante tres semanas es otra conversación.
        </p>

        {serie.length === 0 ? (
          <p className="text-text-muted">Sin cierres en el período.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {serie.map((s) => (
              <li key={s.usuario_id ?? "sin-usuario"} className="flex flex-wrap items-center gap-3">
                <span className="min-w-32 flex-1 font-medium">{s.nombre ?? "Sin identificar"}</span>
                <span className="text-sm text-text-muted">{s.cierres} cierres</span>
                <Diferencia centavos={s.diferencia_total_centavos} />
                <span className="num text-sm text-text-muted">
                  promedio {formatearPesos(s.diferencia_promedio_centavos)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="overflow-x-auto rounded-[var(--radio)] border border-border">
        <table className="w-full min-w-2xl border-collapse bg-surface text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-muted">
              <th className="p-3">Cierre</th>
              <th className="p-3">Quién</th>
              <th className="p-3 text-right">Esperado</th>
              <th className="p-3 text-right">Declarado</th>
              <th className="p-3 text-right">Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((a) => (
              <tr key={a.id} className="border-b border-border last:border-0">
                <td className="num p-3">{new Date(a.declarado_en).toLocaleString("es-AR")}</td>
                <td className="p-3">{a.declarado_por ? nombres[a.declarado_por] ?? "—" : "—"}</td>
                <td className="num p-3 text-right text-text-muted">
                  {formatearPesos(a.esperado_centavos)}
                </td>
                <td className="num p-3 text-right font-semibold">
                  {formatearPesos(a.declarado_centavos)}
                </td>
                <td className="p-3 text-right">
                  <Diferencia centavos={a.diferencia_centavos} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="text-sm text-text-muted">
        El declarado es inmutable: un trigger de la base rechaza cualquier intento de modificarlo.
        Lo único que se puede agregar después es tu revisión.
      </p>
    </div>
  );
}

/** Semáforo con ícono, nunca color solo. */
function Diferencia({ centavos }: { centavos: number }) {
  if (centavos === 0) {
    return (
      <span className="num inline-flex items-center gap-1 font-semibold text-success">
        <CircleCheck size={16} /> exacto
      </span>
    );
  }
  const falta = centavos < 0;
  return (
    <span
      className={`num inline-flex items-center gap-1 font-semibold ${falta ? "text-danger" : "text-warning"}`}
    >
      {falta ? <CircleMinus size={16} /> : <TriangleAlert size={16} />}
      {formatearPesos(centavos, { signo: true })}
    </span>
  );
}
