"use client";

/**
 * <PantallaCobro> — el flujo de cobro, a pantalla completa.
 *
 * Sin modales anidados. El vuelto se calcula EN VIVO mientras se tipea, en
 * verde y enorme, porque el operador lo lee mientras cuenta los billetes.
 *
 * El pago mixto no es un extra: "$5.000 en efectivo y el resto por
 * transferencia" pasa todos los días en un kiosco.
 */

import { useMemo, useState } from "react";
import { uuidv7 } from "uuidv7";
import {
  ArrowLeft,
  Banknote,
  Check,
  CreditCard,
  type LucideIcon,
  Landmark,
  NotebookPen,
  Plus,
  QrCode,
  Trash2,
} from "lucide-react";
import { Boton } from "@/components/ui/boton";
import { MontoGrande } from "@/components/ui/monto-grande";
import { Pildora } from "@/components/ui/pildora";
import { Numpad } from "@/components/pos/numpad";
import { MEDIOS_PAGO, type MedioPago } from "@/lib/tipos";
import { formatearPesos } from "@/lib/money";
import type { PagoTicket } from "@/lib/store/ticket";
import { cn, haptico } from "@/lib/utils";

/** Un icono por medio: en el mostrador se reconoce la forma antes que el texto. */
const ICONO_MEDIO: Record<string, LucideIcon> = {
  EFECTIVO: Banknote,
  TRANSFERENCIA: Landmark,
  DEBITO: CreditCard,
  CREDITO: CreditCard,
  QR: QrCode,
  FIADO: NotebookPen,
};

/** Los billetes que existen de verdad en una caja argentina. */
const BILLETES_RAPIDOS = [200000, 500000, 1000000, 2000000] as const;

export function PantallaCobro({
  totalCentavos,
  clienteNombre,
  onVolver,
  onConfirmar,
  onElegirCliente,
  cargando,
}: {
  totalCentavos: number;
  clienteNombre: string | null;
  onVolver: () => void;
  onConfirmar: (pagos: PagoTicket[]) => void;
  onElegirCliente: () => void;
  cargando?: boolean;
}) {
  const [pagos, setPagos] = useState<PagoTicket[]>([]);
  const [medio, setMedio] = useState<MedioPago | null>(null);
  const [tipeado, setTipeado] = useState("");

  const cubierto = pagos.reduce((a, p) => a + p.montoCentavos, 0);
  const restante = Math.max(0, totalCentavos - cubierto);

  // Lo tipeado son PESOS enteros: en el mostrador nadie escribe centavos.
  const recibido = useMemo(() => (tipeado === "" ? 0 : Number(tipeado) * 100), [tipeado]);
  const vuelto = medio === "EFECTIVO" ? Math.max(0, recibido - restante) : 0;
  const alcanza = medio === "EFECTIVO" ? recibido >= restante : true;

  function agregarPago(m: MedioPago, monto: number, recibidoCentavos?: number) {
    const pago: PagoTicket = {
      id: uuidv7(),
      medio: m,
      montoCentavos: monto,
      recibidoCentavos: m === "EFECTIVO" ? recibidoCentavos : undefined,
      vueltoCentavos: m === "EFECTIVO" ? Math.max(0, (recibidoCentavos ?? monto) - monto) : undefined,
    };
    const nuevos = [...pagos, pago];
    setPagos(nuevos);
    setMedio(null);
    setTipeado("");
    haptico(15);

    if (nuevos.reduce((a, p) => a + p.montoCentavos, 0) >= totalCentavos) {
      onConfirmar(nuevos);
    }
  }

  function confirmarMedioActual() {
    if (!medio) return;

    if (medio === "EFECTIVO") {
      // Si tipeó menos que el restante, ese efectivo es una parte del mixto.
      const entrega = recibido === 0 ? restante : recibido;
      const cubre = Math.min(entrega, restante);
      agregarPago("EFECTIVO", cubre, entrega);
      return;
    }

    if (medio === "FIADO" && !clienteNombre) {
      onElegirCliente();
      return;
    }

    agregarPago(medio, restante);
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <header className="flex shrink-0 items-center gap-3 border-b border-border bg-surface px-3 py-3.5 shadow-[var(--sombra-1)]">
        <Boton
          variante="secundario"
          tamano="icono-pos"
          onClick={onVolver}
          aria-label="Volver al ticket"
        >
          <ArrowLeft size={22} />
        </Boton>
        <div className="min-w-0 flex-1">
          <p className="rotulo">A cobrar</p>
          <p className="num text-[2rem] font-bold leading-none tracking-tight">
            {formatearPesos(totalCentavos)}
          </p>
        </div>
        {cubierto > 0 ? (
          <div className="shrink-0 rounded-[var(--radio)] border border-warning/30 bg-warning-tenue px-3.5 py-2 text-right">
            <p className="rotulo text-warning/80">Falta</p>
            <p className="num text-2xl font-bold leading-none text-warning">
              {formatearPesos(restante)}
            </p>
          </div>
        ) : null}
      </header>

      {pagos.length > 0 ? (
        <ul className="flex shrink-0 flex-col gap-1.5 border-b border-border bg-surface-alt/50 p-3">
          {pagos.map((p) => {
            const Icono = ICONO_MEDIO[p.medio] ?? Banknote;
            return (
              <li
                key={p.id}
                className="flex items-center gap-2.5 tarjeta px-3 py-2"
              >
                <Icono size={16} className="shrink-0 text-plata" aria-hidden />
                <span className="flex-1 text-sm font-semibold">
                  {MEDIOS_PAGO.find((m) => m.valor === p.medio)?.etiqueta}
                </span>
                <span className="num text-sm font-bold">{formatearPesos(p.montoCentavos)}</span>
                <button
                  onClick={() => setPagos(pagos.filter((x) => x.id !== p.id))}
                  aria-label="Quitar este pago"
                  className="presion flex h-9 w-9 cursor-pointer items-center justify-center rounded-[var(--radio-sm)] text-text-sutil hover:bg-danger-tenue hover:text-danger"
                >
                  <Trash2 size={15} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {!medio ? (
        <div className="grid flex-1 grid-cols-2 content-start gap-3 overflow-y-auto p-3 sm:grid-cols-3">
          {MEDIOS_PAGO.map((m) => {
            const Icono = ICONO_MEDIO[m.valor] ?? Banknote;
            const esEfectivo = m.valor === "EFECTIVO";
            return (
              <Boton
                key={m.valor}
                tamano="grande"
                className="min-h-28 flex-col gap-2.5 text-lg"
                variante={esEfectivo ? "plata" : "secundario"}
                onClick={() => {
                  if (m.valor === "FIADO" && !clienteNombre) {
                    onElegirCliente();
                    return;
                  }
                  setMedio(m.valor);
                }}
              >
                <Icono size={26} strokeWidth={1.9} aria-hidden />
                {m.etiqueta}
              </Boton>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 font-display text-base font-semibold">
              {(() => {
                const Icono = ICONO_MEDIO[medio] ?? Banknote;
                return <Icono size={19} className="text-plata" aria-hidden />;
              })()}
              {MEDIOS_PAGO.find((m) => m.valor === medio)?.etiqueta}
              {medio === "FIADO" && clienteNombre ? (
                <Pildora tono="marca">{clienteNombre}</Pildora>
              ) : null}
            </p>
            <Boton
              variante="fantasma"
              tamano="chico"
              onClick={() => {
                setMedio(null);
                setTipeado("");
              }}
            >
              Cambiar
            </Boton>
          </div>

          {medio === "EFECTIVO" ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="tarjeta flex flex-col gap-1 p-4">
                  <p className="rotulo">Paga con</p>
                  <p className="num text-4xl font-bold leading-none">{formatearPesos(recibido)}</p>
                </div>
                <div
                  className={cn(
                    "flex flex-col justify-center rounded-[var(--radio-lg)] border p-4 transition-colors",
                    vuelto > 0
                      ? "border-plata/35 bg-plata-tenue shadow-[var(--sombra-2)]"
                      : "border-border bg-surface",
                  )}
                >
                  <MontoGrande
                    etiqueta="Vuelto"
                    centavos={vuelto}
                    variante={alcanza ? "plata" : "peligro"}
                    tamano="medio"
                  />
                </div>
              </div>

              <Numpad
                valor={tipeado}
                onCambio={setTipeado}
                maxDigitos={8}
                atajos={
                  <>
                    {BILLETES_RAPIDOS.map((b) => (
                      <Boton
                        key={b}
                        onClick={() => setTipeado(String(b / 100))}
                        className="num min-h-18"
                      >
                        {formatearPesos(b)}
                      </Boton>
                    ))}
                    <Boton
                      variante="contorno"
                      className="min-h-18"
                      onClick={() => setTipeado(String(Math.round(restante / 100)))}
                    >
                      JUSTO
                    </Boton>
                  </>
                }
              />

              {!alcanza && recibido > 0 ? (
                <p className="rounded-[var(--radio)] border border-warning/30 bg-warning-tenue px-3 py-2.5 text-sm font-medium text-warning">
                  Con eso no alcanza. Se toma como parte del pago y elegís cómo se cubre el resto.
                </p>
              ) : null}
            </>
          ) : (
            <div className="flex flex-col gap-3">
              <MontoGrande etiqueta="Se cobra" centavos={restante} tamano="grande" />
              <p className="text-sm text-text-muted">
                {medio === "FIADO"
                  ? "Queda cargado a la cuenta corriente del cliente."
                  : "Cobralo por fuera y confirmá acá para que quede registrado."}
              </p>
            </div>
          )}
        </div>
      )}

      <footer className="borde-seguro flex shrink-0 gap-2 border-t border-border bg-surface px-3 pt-3">
        {medio ? (
          <Boton
            variante="plata"
            tamano="grande"
            ancho="completo"
            disabled={cargando}
            onClick={confirmarMedioActual}
          >
            <Check size={22} />
            {medio === "EFECTIVO" && !alcanza && recibido > 0
              ? `Sumar ${formatearPesos(recibido)}`
              : "Confirmar"}
          </Boton>
        ) : (
          <p className="flex flex-1 items-center justify-center gap-1.5 self-center text-sm text-text-sutil">
            <Plus size={14} aria-hidden />
            Elegí cómo paga. Podés combinar más de un medio.
          </p>
        )}
      </footer>
    </div>
  );
}
