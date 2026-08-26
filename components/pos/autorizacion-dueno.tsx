"use client";

/**
 * <AutorizacionDueno> — el modal que pide el PIN del dueño.
 *
 * Se dispara al anular, al descontar y al pasar un límite de crédito.
 * Dice en UNA línea qué se está autorizando y NUNCA autoriza sin dejar rastro:
 * el servidor escribe en `auditoria` al emitir el vale.
 *
 * El PIN no se guarda en el dispositivo. Se cambia por un `autorizacionId` que
 * caduca a los 15 minutos y es lo único que viaja en el outbox.
 *
 * Sin conexión no hay servidor que valide. En ese caso se ofrece seguir,
 * marcando la autorización como "offline": la operación queda registrada y el
 * dueño la ve destacada en la auditoría al sincronizar.
 */

import { useEffect, useState } from "react";
import { ShieldCheck, WifiOff } from "lucide-react";
import { Boton } from "@/components/ui/boton";
import { autorizarAccion, operadoresCacheados, type OperadorCacheado } from "@/lib/db/operadores";
import { useConexion } from "@/lib/hooks/use-conexion";
import { ESPERA_BLOQUEO_S, IngresoPin, MAX_INTENTOS_PIN } from "./pin";

export type AccionAutorizable = "anular_venta" | "descuento" | "exceder_credito";

export type Autorizacion = {
  autorizacionId: string | null;
  autorizadoPor: string;
  offline: boolean;
};

export function AutorizacionDueno({
  accion,
  descripcion,
  detalle,
  onAutorizado,
  onCancelar,
}: {
  accion: AccionAutorizable;
  /** Una línea, en criollo: "Anular la venta 145 por $12.400". */
  descripcion: string;
  detalle?: Record<string, unknown>;
  onAutorizado: (a: Autorizacion) => void;
  onCancelar: () => void;
}) {
  const enLinea = useConexion();
  const [duenos, setDuenos] = useState<OperadorCacheado[]>([]);
  const [elegido, setElegido] = useState<OperadorCacheado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fallidos, setFallidos] = useState(0);
  const [bloqueadoHasta, setBloqueadoHasta] = useState<number | null>(null);

  useEffect(() => {
    void (async () => {
      const todos = await operadoresCacheados();
      const soloDuenos = todos.filter((u) => u.rol === "dueno");
      setDuenos(soloDuenos);
      if (soloDuenos.length === 1) setElegido(soloDuenos[0] ?? null);
    })();
  }, []);

  async function confirmar(pin: string) {
    if (!elegido) return;
    const r = await autorizarAccion(elegido.id, pin, accion, detalle);

    if (r.id) {
      onAutorizado({ autorizacionId: r.id, autorizadoPor: elegido.id, offline: false });
      return;
    }

    if (r.offline) {
      setError("No se pudo verificar el PIN contra el servidor.");
      return;
    }

    const n = fallidos + 1;
    setFallidos(n);
    if (n >= MAX_INTENTOS_PIN) {
      setBloqueadoHasta(Date.now() + ESPERA_BLOQUEO_S * 1000);
      setFallidos(0);
      setError(null);
    } else {
      setError(`PIN incorrecto. Te quedan ${MAX_INTENTOS_PIN - n} intentos.`);
    }
  }

  return (
    <div className="flex flex-col gap-5 p-5">
      <header className="flex items-start gap-3">
        <ShieldCheck size={24} className="mt-0.5 shrink-0 text-warning" />
        <div>
          <h2 className="text-lg font-semibold">Autorización del dueño</h2>
          <p className="text-text-muted">{descripcion}</p>
        </div>
      </header>

      {!elegido ? (
        <div className="flex flex-col gap-2">
          {duenos.map((d) => (
            <Boton key={d.id} tamano="grande" ancho="completo" onClick={() => setElegido(d)}>
              {d.nombre}
            </Boton>
          ))}
          {duenos.length === 0 ? (
            <p className="text-text-muted">
              Este dispositivo todavía no sincronizó la lista de usuarios.
            </p>
          ) : null}
        </div>
      ) : (
        <IngresoPin
          titulo={elegido.nombre}
          detalle="PIN del dueño"
          onCompleto={confirmar}
          error={error}
          bloqueadoHasta={bloqueadoHasta}
        />
      )}

      {!enLinea && elegido ? (
        <div className="flex flex-col gap-2 rounded-[var(--radio)] border border-warning/40 bg-warning/10 p-3">
          <p className="flex items-center gap-2 text-sm text-warning">
            <WifiOff size={16} /> Sin conexión no se puede verificar el PIN.
          </p>
          <Boton
            variante="contorno"
            onClick={() =>
              onAutorizado({ autorizacionId: null, autorizadoPor: elegido.id, offline: true })
            }
          >
            Autorizar igual y dejarlo registrado
          </Boton>
        </div>
      ) : null}

      <Boton variante="fantasma" ancho="completo" onClick={onCancelar}>
        Cancelar
      </Boton>
    </div>
  );
}
