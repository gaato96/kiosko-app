import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  ExternalLink,
  Package,
  Receipt,
  Store,
  TrendingUp,
  Users,
  Wallet,
  Zap,
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
import { urlVidriera } from "@/lib/url";
import type { PedidoConItems } from "@/lib/tipos";
import { cn, fechaLarga, fechaLocal, nombreDia } from "@/lib/utils";
import { PedidosVivos } from "./pedidos-vivos";
import { HeatmapHoras } from "./heatmap";

export const metadata = { title: "Panel" };
export const dynamic = "force-dynamic";

type OperadorDelDia = {
  usuario_id: string | null;
  nombre: string;
  rol: string;
  tickets: number;
  total_centavos: number;
  efectivo_centavos: number;
  ticket_promedio_centavos: number;
  anuladas: number;
};

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
  const { supabase, comercioId } = await contextoAdmin();
  const hoy = fechaLocal();

  const { data: resumenBruto, error } = await supabase.rpc("resumen_dia", { p_fecha: hoy });
  const resumen = resumenBruto as Resumen | null;

  const [
    { data: horas },
    { data: aReponer },
    { data: deudores },
    { data: comercio },
    { data: pedidos },
    { data: zonas },
    { data: porOperador },
  ] = await Promise.all([
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
    supabase.from("comercios").select("slug, vidriera_activa").maybeSingle(),
    // Los pedidos que todavía no se despacharon. Van arriba de todo: son lo
    // único del panel que tiene a alguien esperando del otro lado.
    supabase
      .from("pedidos_vidriera")
      .select("*, items:pedidos_items(*)")
      .in("estado", ["NUEVO", "ACEPTADO", "PREPARANDO"])
      .order("creado_en", { ascending: false })
      .limit(20),
    supabase.from("zonas_envio").select("*").eq("activo", true),
    // Quién vendió hoy. Se agrupa por el operador que entró con PIN, no por la
    // cuenta con la que quedó abierta la sesión del navegador.
    supabase.rpc("ventas_por_operador", { p_desde: hoy, p_hasta: hoy }),
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
  const faltantes = (aReponer ?? []).length;
  const operadores = (porOperador ?? []) as OperadorDelDia[];
  const linkVidriera = comercio?.slug
    ? urlVidriera(comercio.slug, process.env.NEXT_PUBLIC_APP_URL)
    : null;

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina
        className="mb-0"
        titulo="Hoy"
        bajada={`${nombreDia()} ${fechaLarga()}`}
        acciones={
          <Pildora tono={totalHoy > 0 ? "plata" : "neutral"}>
            {resumen.hoy.tickets} {resumen.hoy.tickets === 1 ? "ticket" : "tickets"}
          </Pildora>
        }
      />

      {/* Pedidos de la Vidriera. Primero de todo y con su propio color: hay
          alguien del otro lado esperando que le confirmen. */}
      <PedidosVivos
        iniciales={(pedidos ?? []) as unknown as PedidoConItems[]}
        comercioId={comercioId}
        zonas={zonas ?? []}
      />

      {/* Accesos directos.
          
          La primera versión de esto repetía la barra lateral: seis botones que
          llevaban exactamente a donde ya llevaba el menú de al lado. Un atajo
          que duplica la navegación no ahorra nada.
          
          Estos tres no están en el menú porque no son secciones, son ACCIONES,
          y las tres viven del otro lado, en el mostrador: cobrar, anotar lo que
          salió de la caja y cerrarla. El link cae directo con la hoja abierta,
          no en la pantalla de caja para que después busques el botón. */}
      <nav aria-label="Acciones del mostrador" className="grid gap-3 sm:grid-cols-3">
        <Atajo
          href="/pos"
          icono={Zap}
          texto="Cobrar"
          detalle="Abrir el punto de venta"
          destacado
        />
        <Atajo
          href="/caja?hacer=gasto"
          icono={ArrowUpRight}
          texto="Anotar un gasto"
          detalle="Proveedor, flete, retiro"
        />
        <Atajo
          href="/caja?hacer=cierre"
          icono={Wallet}
          texto="Cerrar la caja"
          detalle="Arqueo del turno"
        />
      </nav>

      {/* El link público, a la vista. Antes había que adivinar que existía. */}
      {linkVidriera ? (
        <Panel className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radio-sm)] bg-plata-tenue text-plata">
              <Store size={19} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="rotulo">Tu vidriera pública</p>
              <p className="truncate font-mono text-sm text-text-muted">{linkVidriera}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href={linkVidriera}
              target="_blank"
              rel="noopener"
              className="presion flex min-h-11 items-center gap-2 rounded-[var(--radio)] border border-border bg-surface px-4 text-sm font-semibold hover:border-border-fuerte"
            >
              <ExternalLink size={16} aria-hidden />
              Ver como cliente
            </a>
            <Link
              href="/vidriera"
              className="presion flex min-h-11 items-center rounded-[var(--radio)] px-4 text-sm font-semibold text-text-muted hover:bg-surface-alt hover:text-text"
            >
              Administrar
            </Link>
          </div>
        </Panel>
      ) : null}

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

      {/* Quién vendió. En un kiosco con dos o tres personas rotando, el total
          del día sin saber de quién es la mitad de la respuesta. El efectivo
          va aparte porque es contra lo que después cierra el arqueo. */}
      {operadores.length > 0 ? (
        <Panel>
          <TarjetaCabecera
            titulo="Quién vendió hoy"
            detalle="Según el operador que estaba con su PIN al cobrar."
            icono={Users}
            accion={<EnlaceVerTodo href="/caja-historial" />}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-lg border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="rotulo px-5 py-2.5">Operador</th>
                  <th className="rotulo px-5 py-2.5 text-right">Tickets</th>
                  <th className="rotulo px-5 py-2.5 text-right">Vendido</th>
                  <th className="rotulo px-5 py-2.5 text-right">En efectivo</th>
                  <th className="rotulo px-5 py-2.5 text-right">Promedio</th>
                </tr>
              </thead>
              <tbody>
                {operadores.map((o) => (
                  <tr
                    key={o.usuario_id ?? "sin-identificar"}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-5 py-3">
                      <span className="font-medium">{o.nombre}</span>
                      {o.rol === "dueno" ? (
                        <span className="ml-2 text-xs text-text-muted">dueño</span>
                      ) : null}
                      {o.anuladas > 0 ? (
                        <Pildora tono="peligro" className="ml-2">
                          {o.anuladas} {o.anuladas === 1 ? "anulada" : "anuladas"}
                        </Pildora>
                      ) : null}
                    </td>
                    <td className="num px-5 py-3 text-right">{o.tickets}</td>
                    <td className="num px-5 py-3 text-right font-semibold">
                      {formatearPesos(o.total_centavos)}
                    </td>
                    <td className="num px-5 py-3 text-right text-text-muted">
                      {formatearPesos(o.efectivo_centavos)}
                    </td>
                    <td className="num px-5 py-3 text-right text-text-muted">
                      {formatearPesos(o.ticket_promedio_centavos)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}

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
        <Panel className={faltantes > 0 ? "border-warning/45" : undefined}>
          <TarjetaCabecera
            titulo={faltantes > 0 ? `Reponé ${faltantes}` : "Para reponer"}
            detalle={
              faltantes > 0
                ? "Estos ya llegaron al mínimo que fijaste. Anotalos antes de que pase el proveedor."
                : undefined
            }
            icono={faltantes > 0 ? AlertTriangle : Package}
            accion={<EnlaceVerTodo href="/stock" />}
          />
          <div className="p-5">
            {faltantes === 0 ? (
              <p className="text-text-muted">No falta nada. Todo por encima del mínimo.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {aReponer?.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="truncate font-medium">{p.nombre}</span>
                    <Pildora
                      tono={p.stock_actual <= 0 ? "peligro" : "atencion"}
                      className="num shrink-0"
                    >
                      {p.stock_actual <= 0
                        ? "sin stock"
                        : `quedan ${p.stock_actual} · mín ${p.stock_minimo}`}
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
      className="presion -mr-2 flex min-h-11 items-center rounded-[var(--radio)] px-2 text-sm font-semibold text-brand hover:bg-surface-alt"
    >
      Ver todo
    </Link>
  );
}

/**
 * Botón de acción. El destacado es cobrar, que es lo urgente y lo que más se
 * toca. El icono va al costado y no arriba: con el texto al lado la fila entra
 * completa en un celular sin que el botón crezca en alto.
 */
function Atajo({
  href,
  icono: Icono,
  texto,
  detalle,
  destacado,
}: {
  href: string;
  icono: LucideIcon;
  texto: string;
  detalle: string;
  destacado?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "presion flex min-h-16 items-center gap-3 rounded-[var(--radio-lg)] px-4 py-3",
        destacado
          ? "bg-[linear-gradient(180deg,var(--plata-viva),var(--plata))] text-plata-fg shadow-[var(--sombra-2)] hover:brightness-110"
          : "border border-border bg-surface text-text shadow-[var(--sombra-1)] hover:border-border-fuerte hover:bg-surface-alt",
      )}
    >
      <Icono size={22} className="shrink-0" aria-hidden />
      <span className="min-w-0">
        <span className="block font-semibold leading-tight">{texto}</span>
        <span
          className={cn(
            "block text-sm leading-tight",
            destacado ? "text-plata-fg/75" : "text-text-muted",
          )}
        >
          {detalle}
        </span>
      </span>
    </Link>
  );
}
