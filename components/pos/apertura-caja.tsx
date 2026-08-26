"use client";

/**
 * <AperturaCaja> — modal bloqueante. Sin caja abierta no se cobra.
 *
 * Es lo primero que ve el POS a la mañana. Un solo campo, numpad grande y la
 * sugerencia del fondo del día anterior: nadie quiere pensar a las 7 AM.
 */

import { useState } from "react";
import { Wallet } from "lucide-react";
import { Boton } from "@/components/ui/boton";
import { Numpad } from "./numpad";
import { formatearPesos } from "@/lib/money";

const FONDOS_SUGERIDOS = [2000000, 5000000, 10000000] as const;

export function AperturaCaja({
  fondoSugeridoCentavos,
  onAbrir,
  cargando,
}: {
  fondoSugeridoCentavos?: number;
  onAbrir: (fondoCentavos: number) => void;
  cargando?: boolean;
}) {
  const [tipeado, setTipeado] = useState(
    fondoSugeridoCentavos ? String(Math.round(fondoSugeridoCentavos / 100)) : "",
  );

  const fondo = tipeado === "" ? 0 : Number(tipeado) * 100;

  return (
    <div className="flex flex-col gap-5 p-5">
      <header className="flex items-start gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radio)] bg-brand-tenue text-brand">
          <Wallet size={21} aria-hidden />
        </span>
        <div>
          <h2 className="font-display text-lg font-semibold leading-tight">
            Abrí la caja para empezar a vender
          </h2>
          <p className="mt-0.5 text-sm text-text-muted">¿Con cuánto arrancás?</p>
        </div>
      </header>

      <div className="flex flex-col items-center gap-1 rounded-[var(--radio-lg)] border border-border bg-surface-alt/60 py-6">
        <span className="rotulo">Fondo inicial</span>
        <p className="num text-5xl font-bold leading-none">{formatearPesos(fondo)}</p>
      </div>

      <Numpad
        valor={tipeado}
        onCambio={setTipeado}
        maxDigitos={8}
        atajos={
          <>
            {FONDOS_SUGERIDOS.map((f) => (
              <Boton key={f} className="num min-h-18 text-base" onClick={() => setTipeado(String(f / 100))}>
                {formatearPesos(f)}
              </Boton>
            ))}
            <Boton variante="contorno" className="min-h-18" onClick={() => setTipeado("0")}>
              Sin fondo
            </Boton>
          </>
        }
      />

      <Boton
        variante="primario"
        tamano="grande"
        ancho="completo"
        disabled={cargando || tipeado === ""}
        onClick={() => onAbrir(fondo)}
      >
        Abrir la caja
      </Boton>
    </div>
  );
}
