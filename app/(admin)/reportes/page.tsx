import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  Package,
  Receipt,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { Pildora } from "@/components/ui/pildora";
import {
  EncabezadoPagina,
  Metrica,
  Tarjeta as Panel,
  TarjetaCabecera,
} from "@/components/ui/tarjeta";
import { contextoAdmin } from "@/lib/admin";
import { formatearPesos } from "@/lib/money";
import { fechaLocal, nombreDia } from "@/lib/utils";
import { HeatmapHoras } from "./heatmap";

export const metadata = { title: "Panel" };
export const dynamic = "force-dynamic";

type Resumen = {
  fecha: string;
  hoy: { total: number; costo: number; tickets: number; ticket_promedio: number };
  misma_dia_semana_pasada: { total: number; tickets: number };
  medios: Record<string, number>;
};

/**
 * El panel del dueño.
 *
 * La comparación es contra el MISMO DÍA DE LA SEMANA PASADA, no contra ayer:
 * en un kiosco un martes no se parece en nada a un lunes, y comparar contra
 * ayer produce alarmas falsas todas las semanas.
 *
 * Cada número viene con una acción al lado. Un número sin acción es decoración.
 */
export default async function Reportes() {
  const { supabase } = await contextoAdmin();
  const hoy = fechaLocal();

  const { data: resumenBruto, error } = await supabase.rpc("resumen_dia", { p_fecha: hoy });
  const resumen = resumenBruto as Resumen | null;

  const [{ data: horas }, { data: aReponer }, { data: deudores }] = await Promise.all([
    supabase.rpc("ventas_por_hora", {
      p_desde: fechaLocal(new Date(Date.now() - 27 * 86400000)),
      p_hasta: hoy,
    }),
    supabase.from("productos_a_reponer").select("id, nombre, stock_actual, stock_minimo").limit(6),
    supabase
      .from("clientes")
      .select("id, nombre, saldo_centavos")
      .gt("saldo_centavos", 0)
      .order("saldo_centavos", { ascending: false })
      .limit(5),
  ]);

  if (error || !resumen) {
    return (
      <EstadoVacio
        titulo="Todavía no hay datos para mostrar"
        detalle="En cuanto se cobre la primera venta este panel se llena solo. Si esto no cambia, revisá que schema.sql esté aplicado en Supabase."
      />
    );
  }

  const totalHoy = resumen.hoy.total;
  const totalSemana = resumen.misma_dia_semana_pasada.total;
  const variacion = totalSemana > 0 ? ((totalHoy - totalSemana) / totalSemana) * 100 : null;
  const gananciaHoy = totalHoy - resumen.hoy.costo;
  const totalDeuda = (deudores ?? []).reduce((a, c) => a + c.saldo_centavos, 0);

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina
        className="mb-0"
        titulo="Hoy"
        bajada={`${nombreDia()} ${new Date().toLocaleDateString("es-AR")}`}
        acciones={
          <Pildora tono={totalHoy > 0 ? "plata" : "neutral"}>
            {resumen.hoy.tickets} {resumen.hoy.tickets === 1 ? "ticket" : "tickets"}
          </Pildora>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metrica
          etiqueta="Vendido"
          icono={Wallet}
          tono="plata"
          valor={formatearPesos(totalHoy)}
          detalle={
            variacion === null ? (
              <span>Sin dato del {nombreDia()} pasado</span>
            ) : (
              <span
                className={
                  variacion >= 0
                    ? "inline-flex items-center gap-1 font-semibold text-success"
                    : "inline-flex items-center gap-1 font-semibold text-danger"
                }
              >
                {variacion >= 0 ? (
                  <ArrowUpRight size={14} aria-hidden />
                ) : (
                  <ArrowDownRight size={14} aria-hidden />
                )}
                {Math.abs(variacion).toFixed(0)}%
                <span className="font-normal text-text-muted">
                  vs el {nombreDia()} pasado ({formatearPesos(totalSemana)})
                </span>
              </span>
            )
          }
        />
        <Metrica
          etiqueta="Tickets"
          icono={Receipt}
          valor={String(resumen.hoy.tickets)}
          detalle={`${resumen.misma_dia_semana_pasada.tickets} el ${nombreDia()} pasado`}
        />
        <Metrica
          etiqueta="Ticket promedio"
          icono={Receipt}
          valor={formatearPesos(resumen.hoy.ticket_promedio)}
          detalle="Lo que gasta cada cliente"
        />
        <Metrica
          etiqueta="Ganancia bruta"
          icono={TrendingUp}
          tono={gananciaHoy > 0 ? "plata" : "neutral"}
          valor={formatearPesos(gananciaHoy)}
          detalle={
            totalHoy > 0 ? `${((gananciaHoy / totalHoy) * 100).toFixed(0)}% de margen` : undefined
          }
        />
      </section>

      <Panel>
        <TarjetaCabecera titulo="Por medio de pago" icono={Wallet} />
        <div className="p-5">
          {Object.keys(resumen.medios).length === 0 ? (
            <p className="text-text-muted">Todavía no se cobró nada hoy.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {Object.entries(resumen.medios).map(([medio, monto]) => (
                <li
                  key={medio}
                  className="tarjeta-alt/60 px-3.5 py-3"
                >
                  <p className="rotulo">{medio}</p>
                  <p className="num mt-1 text-lg font-bold">{formatearPesos(monto)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>

      <Panel>
        <TarjetaCabecera
          titulo="A qué hora vende el kiosco"
          detalle="Últimos 28 días. Sirve para decidir a qué hora abrir y cuándo poner a otra persona."
          icono={Clock}
        />
        <div className="p-5">
          <HeatmapHoras
            datos={
              (horas as Array<{ hora: number; tickets: number; total_centavos: number }>) ?? []
            }
          />
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <TarjetaCabecera
            titulo="Para reponer"
            icono={Package}
            accion={<EnlaceVerTodo href="/stock" />}
          />
          <div className="p-5">
            {(aReponer ?? []).length === 0 ? (
              <p className="text-text-muted">No falta nada. Todo por encima del mínimo.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {aReponer?.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="truncate font-medium">{p.nombre}</span>
                    <Pildora tono="atencion" className="num shrink-0">
                      {p.stock_actual} / mín {p.stock_minimo}
                    </Pildora>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>

        <Panel>
          <TarjetaCabecera
            titulo="Fiado en la calle"
            icono={Users}
            accion={<EnlaceVerTodo href="/clientes" />}
          />
          <div className="p-5">
            <p className="num mb-4 text-3xl font-bold text-warning">
              {formatearPesos(totalDeuda)}
            </p>
            {(deudores ?? []).length === 0 ? (
              <p className="text-text-muted">Nadie debe nada.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {deudores?.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="truncate font-medium">{c.nombre}</span>
                    <span className="num shrink-0 font-bold">
                      {formatearPesos(c.saldo_centavos)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>
      </div>

      <p className="flex items-start gap-2.5 tarjeta-alt/50 p-4 text-sm leading-relaxed text-text-muted">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-text-sutil" aria-hidden />
        La ganancia usa el costo congelado en cada item al momento de la venta, no el costo de hoy.
        Por eso el margen histórico no se distorsiona cuando cambian los precios.
      </p>
    </div>
  );
}

function EnlaceVerTodo({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="text-sm font-semibold text-brand hover:underline hover:underline-offset-4"
    >
      Ver todo
    </Link>
  );
}
