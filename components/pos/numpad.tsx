"use client";

/**
 * <Numpad> — teclas de 72×72 px (docs/04 §5).
 * Se usa en el cobro, en la balanza, en el PIN y en el arqueo.
 * Trabaja siempre sobre un string de dígitos: quien lo usa decide si eso son
 * centavos, gramos o un PIN.
 *
 * Las teclas viven adentro de un bloque hundido: separa visualmente el teclado
 * del resto de la pantalla sin necesidad de un título que lo explique.
 */

import { Delete } from "lucide-react";
import { cn, haptico } from "@/lib/utils";

const TECLAS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

export function Numpad({
  valor,
  onCambio,
  maxDigitos = 9,
  atajos,
  className,
  onEnter,
}: {
  valor: string;
  onCambio: (v: string) => void;
  maxDigitos?: number;
  /** Botones contextuales: billetes en el cobro, pesos frecuentes en la balanza. */
  atajos?: React.ReactNode;
  className?: string;
  onEnter?: () => void;
}) {
  function digito(d: string) {
    if (valor.length >= maxDigitos) return;
    onCambio((valor === "0" ? "" : valor) + d);
  }

  return (
    <div
      className={cn(
        "flex gap-2 rounded-[var(--radio-lg)] border border-border bg-bg/60 p-2",
        className,
      )}
    >
      <div className="grid flex-1 grid-cols-3 gap-2">
        {TECLAS.map((t) => (
          <Tecla key={t} onClick={() => digito(t)}>
            {t}
          </Tecla>
        ))}
        <Tecla tono="sutil" onClick={() => onCambio("")}>
          C
        </Tecla>
        <Tecla onClick={() => digito("0")}>0</Tecla>
        <Tecla
          tono="sutil"
          onClick={() => onCambio(valor.slice(0, -1))}
          aria-label="Borrar el último dígito"
        >
          <Delete size={24} aria-hidden />
        </Tecla>
      </div>

      {atajos ? <div className="flex w-32 flex-col gap-2 sm:w-36">{atajos}</div> : null}
      {onEnter ? <span className="sr-only">Enter confirma</span> : null}
    </div>
  );
}

function Tecla({
  children,
  onClick,
  tono = "normal",
  ...props
}: {
  children: React.ReactNode;
  onClick: () => void;
  tono?: "normal" | "sutil";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={() => {
        haptico(9);
        onClick();
      }}
      // Sin esto, un toque rápido sobre la tecla puede quedar interpretado
      // como un doble-tap de zoom en Android y no dispara nada.
      style={{ touchAction: "manipulation" }}
      className={cn(
        "presion flex h-18 cursor-pointer select-none items-center justify-center",
        "rounded-[var(--radio)] font-display text-2xl font-semibold",
        tono === "normal"
          ? "border border-border bg-surface-alto text-text shadow-[var(--sombra-1)] hover:border-border-fuerte hover:bg-surface-alt"
          : "text-text-muted hover:bg-surface-alt hover:text-text",
      )}
      {...props}
    >
      {children}
    </button>
  );
}
