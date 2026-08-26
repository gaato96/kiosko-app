"use client";

/**
 * <IngresoPin> — cuatro puntitos y un numpad grande.
 * Cinco intentos fallidos = 60 segundos de espera (M1 §5).
 */

import { useEffect, useState } from "react";
import { Numpad } from "./numpad";
import { cn } from "@/lib/utils";

export const MAX_INTENTOS_PIN = 5;
export const ESPERA_BLOQUEO_S = 60;

export function IngresoPin({
  titulo,
  detalle,
  onCompleto,
  error,
  bloqueadoHasta,
}: {
  titulo: string;
  detalle?: string;
  onCompleto: (pin: string) => void;
  error?: string | null;
  /** epoch ms hasta el que no se acepta nada. */
  bloqueadoHasta?: number | null;
}) {
  const [pin, setPin] = useState("");
  const [restante, setRestante] = useState(0);

  useEffect(() => {
    if (!bloqueadoHasta) {
      setRestante(0);
      return;
    }
    const tic = () => setRestante(Math.max(0, Math.ceil((bloqueadoHasta - Date.now()) / 1000)));
    tic();
    const id = setInterval(tic, 500);
    return () => clearInterval(id);
  }, [bloqueadoHasta]);

  useEffect(() => {
    if (pin.length === 4) {
      const valor = pin;
      setPin("");
      onCompleto(valor);
    }
  }, [pin, onCompleto]);

  const bloqueado = restante > 0;

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="text-center">
        <h2 className="text-xl font-semibold">{titulo}</h2>
        {detalle ? <p className="mt-1 text-text-muted">{detalle}</p> : null}
      </div>

      <div className="flex gap-3" aria-label={`PIN, ${pin.length} de 4 dígitos`}>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              "h-4 w-4 rounded-full border-2",
              i < pin.length ? "border-primary bg-primary" : "border-border",
            )}
          />
        ))}
      </div>

      {bloqueado ? (
        <p role="alert" className="num text-center text-danger">
          Cinco intentos fallidos. Esperá {restante} s.
        </p>
      ) : error ? (
        <p role="alert" className="text-center text-danger">
          {error}
        </p>
      ) : null}

      <Numpad
        valor={pin}
        maxDigitos={4}
        onCambio={(v) => {
          if (!bloqueado) setPin(v);
        }}
        className="w-full max-w-xs"
      />
    </div>
  );
}
