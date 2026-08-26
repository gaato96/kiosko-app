/**
 * Heatmap de ventas por hora.
 *
 * Sin librería de gráficos a propósito: es una fila de barras y `recharts` pesa
 * más que todo el panel. Los gráficos que sí la justifiquen se cargan con
 * dynamic() y nunca entran al bundle del POS.
 */

import { formatearPesos } from "@/lib/money";

export function HeatmapHoras({
  datos,
}: {
  datos: Array<{ hora: number; tickets: number; total_centavos: number }>;
}) {
  if (datos.length === 0) {
    return <p className="text-text-muted">Todavía no hay ventas suficientes para ver el patrón.</p>;
  }

  const porHora = new Map(datos.map((d) => [d.hora, d]));
  const maximo = Math.max(...datos.map((d) => d.total_centavos), 1);
  const horas = Array.from({ length: 24 }, (_, i) => i);

  const mejor = datos.reduce((a, b) => (b.total_centavos > a.total_centavos ? b : a));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-[2px] overflow-x-auto sin-scrollbar" role="img"
        aria-label={`Ventas por hora. La hora más fuerte es a las ${mejor.hora} con ${formatearPesos(mejor.total_centavos)}.`}
      >
        {horas.map((h) => {
          const d = porHora.get(h);
          const alto = d ? Math.max(4, (d.total_centavos / maximo) * 100) : 2;
          return (
            <div key={h} className="flex min-w-6 flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-primary"
                style={{ height: `${alto}px`, opacity: d ? 0.35 + (d.total_centavos / maximo) * 0.65 : 0.15 }}
                title={d ? `${h}:00 — ${formatearPesos(d.total_centavos)} · ${d.tickets} tickets` : `${h}:00 — sin ventas`}
              />
              <span className="num text-[10px] text-text-muted">{h}</span>
            </div>
          );
        })}
      </div>

      <p className="text-sm text-text-muted">
        La hora más fuerte es a las <span className="num font-semibold text-text">{mejor.hora}:00</span>{" "}
        con <span className="num font-semibold text-text">{formatearPesos(mejor.total_centavos)}</span> en
        28 días.
      </p>
    </div>
  );
}
