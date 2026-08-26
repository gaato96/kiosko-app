"use client";

/**
 * <ArqueoCiego> — el cierre de caja.
 *
 * El empleado cuenta el efectivo y declara el total. NO ve el esperado, NO ve
 * la diferencia y NO puede volver atrás: el trigger `trg_arqueo_inmutable`
 * rechaza cualquier UPDATE sobre lo declarado.
 *
 * Esto es un control de fricción y auditoría, no una caja fuerte, y así está
 * documentado en docs/03-modulos/05-caja-arqueo.md §5.
 */

import { useState } from "react";
import { Check, Lock } from "lucide-react";
import { Boton } from "@/components/ui/boton";
import { Input } from "@/components/ui/campo";
import { BILLETES_ARQUEO, totalDesglose } from "@/lib/pos/caja";
import { formatearPesos, parsearPesos } from "@/lib/money";

export function ArqueoCiego({
  nombreOperador,
  abiertaEn,
  onCerrar,
  onCancelar,
  cargando,
}: {
  nombreOperador: string;
  abiertaEn: string;
  onCerrar: (declaradoCentavos: number, desglose: Record<string, number>) => void;
  onCancelar: () => void;
  cargando?: boolean;
}) {
  const [conteo, setConteo] = useState<Record<string, number>>({});
  const [monedas, setMonedas] = useState("");
  const [confirmado, setConfirmado] = useState(false);

  const enBilletes = totalDesglose(conteo);
  const enMonedas = parsearPesos(monedas) ?? 0;
  const declarado = enBilletes + enMonedas;

  if (confirmado) {
    return (
      <div className="flex flex-col items-center gap-4 p-8 text-center">
        <Check size={48} className="text-success" />
        <h2 className="text-xl font-semibold">Caja cerrada</h2>
        <p className="num text-3xl font-bold">{formatearPesos(declarado)}</p>
        <p className="text-text-muted">El dueño va a revisar el cierre.</p>
        <Boton variante="primario" ancho="completo" onClick={onCancelar}>
          Listo
        </Boton>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <header>
        <h2 className="text-lg font-semibold">Cerrar caja</h2>
        <p className="text-sm text-text-muted">
          Turno de {nombreOperador} · desde{" "}
          {new Date(abiertaEn).toLocaleString("es-AR", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </header>

      <p className="tarjeta-alt p-3 text-sm">
        Contá el efectivo que hay en la caja y anotá el total. No mires el sistema: el sentido del
        arqueo es que el conteo sea a ciegas.
      </p>

      <ul className="flex flex-col gap-2">
        {BILLETES_ARQUEO.map((b) => (
          <li key={b} className="flex items-center gap-3">
            <span className="num w-24 shrink-0 text-right font-medium">{formatearPesos(b)}</span>
            <span aria-hidden className="text-text-muted">
              ×
            </span>
            <Input
              inputMode="numeric"
              className="min-h-12 w-20 text-center"
              value={conteo[String(b)] ?? ""}
              onChange={(e) =>
                setConteo({ ...conteo, [String(b)]: Number(e.target.value.replace(/\D/g, "")) || 0 })
              }
              aria-label={`Cantidad de billetes de ${formatearPesos(b)}`}
            />
            <span className="num flex-1 text-right text-text-muted">
              {formatearPesos((conteo[String(b)] ?? 0) * b)}
            </span>
          </li>
        ))}

        <li className="flex items-center gap-3">
          <span className="w-24 shrink-0 text-right font-medium">Monedas</span>
          <Input
            inputMode="numeric"
            className="min-h-12 flex-1"
            value={monedas}
            onChange={(e) => setMonedas(e.target.value)}
            placeholder="0"
            aria-label="Total en monedas"
          />
        </li>
      </ul>

      <div className="flex items-baseline justify-between border-t border-border pt-3">
        <span className="text-sm uppercase tracking-wide text-text-muted">Total contado</span>
        <output aria-live="polite" className="num text-4xl font-bold">
          {formatearPesos(declarado)}
        </output>
      </div>

      <p className="flex items-center gap-2 text-sm text-warning">
        <Lock size={16} />
        Una vez confirmado no se puede cambiar.
      </p>

      <div className="flex gap-2">
        <Boton variante="fantasma" ancho="completo" onClick={onCancelar}>
          Volver
        </Boton>
        <Boton
          variante="primario"
          tamano="grande"
          ancho="completo"
          disabled={cargando || declarado <= 0}
          onClick={() => {
            onCerrar(declarado, conteo);
            setConfirmado(true);
          }}
        >
          Confirmar y cerrar
        </Boton>
      </div>
    </div>
  );
}
