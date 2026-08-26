"use client";

/**
 * <PanelTicket> — el ticket.
 *
 * FIRMA DEL DISEÑO: esto no es un panel lateral, es una tira de papel apoyada
 * sobre el mostrador. Papel tibio, renglones en monoespaciada con puntos guía,
 * y el borde de abajo dentado como el corte de una impresora térmica.
 *
 * No es decoración. El operador ya sabe leer un ticket de papel: si la pantalla
 * se parece al papel que va a imprimir, no tiene que aprender nada. Y la
 * monoespaciada hace que las columnas de importes aliñen solas, sin anchos
 * fijos que se rompen con un total de seis cifras.
 *
 * El total va con aria-live: se lee de reojo mientras el cliente saca la plata.
 */

import { ChevronDown, Minus, Plus, Scale, Trash2, TriangleAlert, UserRound } from "lucide-react";
import { Boton } from "@/components/ui/boton";
import { formatearPesos } from "@/lib/money";
import { formatearPeso } from "@/lib/peso";
import { subtotalDe, totalDe, usarTicket, type LineaTicket } from "@/lib/store/ticket";
import { cn, haptico } from "@/lib/utils";

export function PanelTicket({
  onCobrar,
  onBalanza,
  onCerrar,
  className,
}: {
  onCobrar: () => void;
  onBalanza: () => void;
  /** Solo en celular, donde el ticket se abre como hoja sobre el catálogo. */
  onCerrar?: () => void;
  className?: string;
}) {
  const lineas = usarTicket((s) => s.lineas);
  const descuento = usarTicket((s) => s.descuentoCentavos);
  const clienteNombre = usarTicket((s) => s.clienteNombre);
  const vaciar = usarTicket((s) => s.vaciar);

  const subtotal = subtotalDe(lineas);
  const total = totalDe(lineas, descuento);
  const unidades = lineas.reduce((a, l) => a + (l.tipoVenta === "PESO" ? 1 : l.cantidad), 0);

  return (
    <aside className={cn("flex flex-col p-3", className)}>
      <div className="papel papel-cortado flex h-full min-h-0 flex-col rounded-t-[var(--radio)] shadow-[var(--sombra-2)]">
        {/* El toldo: la única franja de color de la pantalla. */}
        <span aria-hidden className="toldo h-1.5 shrink-0 rounded-t-[var(--radio)]" />

        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-dashed border-papel-linea px-4 py-3">
          <div className="min-w-0">
            <p className="font-mono text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-papel-tinta/60">
              Ticket
            </p>
            <p className="num-recibo text-sm font-medium text-papel-tinta">
              {unidades === 0
                ? "sin items"
                : `${unidades} ${unidades === 1 ? "item" : "items"}`}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {onCerrar ? (
              <button
                onClick={onCerrar}
                aria-label="Cerrar el ticket"
                className="presion flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-papel-tinta/45 hover:bg-papel-tinta/5 hover:text-papel-tinta lg:hidden"
              >
                <ChevronDown size={18} />
              </button>
            ) : null}

            {lineas.length > 0 ? (
              <button
                onClick={() => {
                  if (confirm("¿Vaciar el ticket?")) {
                    haptico(20);
                    vaciar();
                  }
                }}
                aria-label="Vaciar el ticket"
                className="presion flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-papel-tinta/45 hover:bg-peligro/10 hover:text-danger"
              >
                <Trash2 size={16} />
              </button>
            ) : null}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto sin-scrollbar">
          {lineas.length === 0 ? (
            <p className="px-6 py-10 text-center font-mono text-[0.8125rem] leading-relaxed text-papel-tinta/45">
              Tocá un producto para empezar.
              <br />
              Enter agrega el primero de la búsqueda.
            </p>
          ) : (
            <ul>
              {lineas.map((l) => (
                <LineaDelTicket key={l.id} linea={l} />
              ))}
            </ul>
          )}
        </div>

        <footer className="shrink-0 border-t border-dashed border-papel-linea px-4 pb-5 pt-3">
          {clienteNombre ? (
            <p className="mb-2 flex items-center gap-1.5 font-mono text-xs text-papel-tinta/70">
              <UserRound size={13} className="shrink-0" aria-hidden />
              cta. cte.{" "}
              <span className="truncate font-bold text-papel-tinta">{clienteNombre}</span>
            </p>
          ) : null}

          {descuento > 0 ? (
            <div className="mb-2 flex flex-col gap-1 font-mono text-xs text-papel-tinta/70">
              <span className="guia flex items-baseline">
                <span>subtotal</span>
                <span className="num-recibo">{formatearPesos(subtotal)}</span>
              </span>
              <span className="guia flex items-baseline font-bold text-warning">
                <span>descuento</span>
                <span className="num-recibo">−{formatearPesos(descuento)}</span>
              </span>
            </div>
          ) : null}

          <div className="mb-3 flex items-end justify-between gap-2">
            <span className="font-mono text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-papel-tinta/60">
              Total
            </span>
            <output
              aria-live="polite"
              className={cn(
                "num text-[2.6rem] font-extrabold leading-[0.9] tracking-[-0.03em]",
                total > 0 ? "text-papel-tinta" : "text-papel-tinta/30",
              )}
            >
              {formatearPesos(total)}
            </output>
          </div>

          <Boton
            variante="plata"
            tamano="grande"
            ancho="completo"
            disabled={lineas.length === 0}
            onClick={onCobrar}
            className="text-xl tracking-tight"
          >
            Cobrar
          </Boton>

          <button
            onClick={onBalanza}
            className="presion mt-2 flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--radio)] font-mono text-[0.8125rem] font-medium text-papel-tinta/60 hover:bg-papel-tinta/5 hover:text-papel-tinta"
          >
            <Scale size={16} aria-hidden /> Pesar en balanza
          </button>
        </footer>
      </div>
    </aside>
  );
}

function LineaDelTicket({ linea }: { linea: LineaTicket }) {
  const sumarUno = usarTicket((s) => s.sumarUno);
  const restarUno = usarTicket((s) => s.restarUno);
  const quitar = usarTicket((s) => s.quitar);

  const esPeso = linea.tipoVenta === "PESO";

  return (
    <li className="group border-b border-dotted border-papel-linea/70 px-4 py-2.5 last:border-b-0">
      <span className="guia mb-1 flex items-baseline">
        <span className="truncate font-mono text-[0.8125rem] font-medium text-papel-tinta">
          {linea.descripcion}
          {linea.sinStock ? (
            <TriangleAlert
              size={12}
              className="ml-1 inline text-warning"
              aria-label="Se vendió sin stock cargado"
            />
          ) : null}
        </span>
        <span className="num-recibo shrink-0 text-[0.9375rem] font-bold text-papel-tinta">
          {formatearPesos(linea.totalCentavos)}
        </span>
      </span>

      <span className="flex items-center justify-between gap-2">
        <span className="num-recibo text-xs text-papel-tinta/55">
          {esPeso
            ? `${formatearPeso(linea.cantidad)} × ${formatearPesos(linea.precioUnitarioCentavos)}/kg`
            : `${linea.cantidad} × ${formatearPesos(linea.precioUnitarioCentavos)}`}
        </span>

        <span className="flex items-center gap-0.5">
          {esPeso ? null : (
            <>
              <BotonLinea
                etiqueta={`Restar de ${linea.descripcion}`}
                onClick={() => restarUno(linea.id)}
              >
                <Minus size={13} />
              </BotonLinea>
              <BotonLinea
                etiqueta={`Sumar a ${linea.descripcion}`}
                onClick={() => sumarUno(linea.id)}
              >
                <Plus size={13} />
              </BotonLinea>
            </>
          )}
          <BotonLinea etiqueta={`Quitar ${linea.descripcion}`} onClick={() => quitar(linea.id)} peligro>
            <Trash2 size={13} />
          </BotonLinea>
        </span>
      </span>
    </li>
  );
}

function BotonLinea({
  children,
  etiqueta,
  onClick,
  peligro,
}: {
  children: React.ReactNode;
  etiqueta: string;
  onClick: () => void;
  peligro?: boolean;
}) {
  return (
    <button
      aria-label={etiqueta}
      onClick={() => {
        haptico(peligro ? 14 : 8);
        onClick();
      }}
      className={cn(
        "presion flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-papel-linea text-papel-tinta/70",
        peligro
          ? "hover:border-danger/40 hover:bg-peligro/10 hover:text-danger"
          : "hover:border-papel-tinta/40 hover:bg-papel-tinta/5 hover:text-papel-tinta",
      )}
    >
      {children}
    </button>
  );
}
