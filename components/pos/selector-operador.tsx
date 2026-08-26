"use client";

/**
 * <SelectorOperador> — quién está atendiendo ahora.
 *
 * Cambia el operador sin cerrar la sesión de Supabase y SIN PERDER EL TICKET
 * EN CURSO: el store del ticket vive aparte del store de sesión, a propósito.
 */

import { useCallback, useEffect, useState } from "react";
import { Boton } from "@/components/ui/boton";
import {
  operadoresCacheados,
  refrescarOperadores,
  validarPin,
  type OperadorCacheado,
} from "@/lib/db/operadores";
import { usarSesion } from "@/lib/store/sesion";
import { ESPERA_BLOQUEO_S, IngresoPin, MAX_INTENTOS_PIN } from "./pin";
import { cn } from "@/lib/utils";

export function SelectorOperador({
  onListo,
  onCancelar,
}: {
  onListo?: () => void;
  onCancelar?: () => void;
}) {
  const comercioId = usarSesion((s) => s.comercioId);
  const definirOperador = usarSesion((s) => s.definirOperador);

  const [lista, setLista] = useState<OperadorCacheado[]>([]);
  const [elegido, setElegido] = useState<OperadorCacheado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fallidos, setFallidos] = useState(0);
  const [bloqueadoHasta, setBloqueadoHasta] = useState<number | null>(null);

  useEffect(() => {
    void (async () => {
      setLista(await operadoresCacheados());
      if (comercioId && navigator.onLine) {
        try {
          setLista(await refrescarOperadores(comercioId));
        } catch {
          // Sin red se sigue con la lista cacheada. Es justamente para esto.
        }
      }
    })();
  }, [comercioId]);

  const confirmar = useCallback(
    async (pin: string) => {
      if (!elegido) return;
      const r = await validarPin(elegido.id, pin);

      if (r.ok) {
        definirOperador({ id: elegido.id, nombre: elegido.nombre, rol: elegido.rol });
        setFallidos(0);
        onListo?.();
        return;
      }

      if (r.offline) {
        setError("Sin conexión no se puede verificar el PIN. Probá cuando vuelva internet.");
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
    },
    [elegido, fallidos, definirOperador, onListo],
  );

  if (elegido) {
    return (
      <div className="flex flex-col items-center gap-6">
        <IngresoPin
          titulo={elegido.nombre}
          detalle="Poné tu PIN de 4 dígitos"
          onCompleto={confirmar}
          error={error}
          bloqueadoHasta={bloqueadoHasta}
        />
        <Boton
          variante="fantasma"
          onClick={() => {
            setElegido(null);
            setError(null);
          }}
        >
          Elegir a otra persona
        </Boton>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <h2 className="text-xl font-semibold">¿Quién atiende?</h2>

      <div className="grid w-full max-w-md grid-cols-2 gap-3 sm:grid-cols-3">
        {lista.map((u) => (
          <button
            key={u.id}
            onClick={() => {
              setElegido(u);
              setError(null);
            }}
            className={cn(
              "flex min-h-32 flex-col items-center justify-center gap-2 rounded-[var(--radio)]",
              "border border-border bg-surface p-3 hover:bg-surface-alt",
            )}
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-fg">
              {u.nombre.charAt(0).toUpperCase()}
            </span>
            <span className="text-center text-sm font-medium leading-tight">{u.nombre}</span>
            {u.rol === "dueno" ? <span className="text-xs text-text-muted">Dueño</span> : null}
          </button>
        ))}
      </div>

      {lista.length === 0 ? (
        <p className="text-text-muted">Todavía no hay operadores cargados.</p>
      ) : null}

      {onCancelar ? (
        <Boton variante="fantasma" onClick={onCancelar}>
          Cancelar
        </Boton>
      ) : null}
    </div>
  );
}
