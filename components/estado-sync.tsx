"use client";

/**
 * <EstadoSync> — la píldora de estado, siempre visible en el POS.
 *
 *   ● En línea
 *   ◐ Sincronizando (3)
 *   ○ Sin conexión — 7 ventas guardadas
 *
 * El usuario nunca tiene que adivinar si su trabajo se guardó.
 */

import { useLiveQuery } from "dexie-react-hooks";
import { Cloud, CloudOff, RefreshCw } from "lucide-react";
import { db } from "@/lib/db/schema";
import { useConexion } from "@/lib/hooks/use-conexion";
import { cn } from "@/lib/utils";

export function EstadoSync({ className, onClick }: { className?: string; onClick?: () => void }) {
  const enLinea = useConexion();

  const conteos = useLiveQuery(async () => {
    const cola = await db().outbox.toArray();
    return {
      pendientes: cola.filter((i) => i.estado !== "ok").length,
      ventas: cola.filter((i) => i.tipo === "venta").length,
    };
  }, []);

  const pendientes = conteos?.pendientes ?? 0;
  const ventas = conteos?.ventas ?? 0;

  let estado: "linea" | "sincronizando" | "sin-conexion";
  if (!enLinea) estado = "sin-conexion";
  else if (pendientes > 0) estado = "sincronizando";
  else estado = "linea";

  const estilos = {
    linea: "border-success/40 text-success",
    sincronizando: "border-info/40 text-info",
    "sin-conexion": "border-warning/40 text-warning",
  } as const;

  const texto = {
    linea: "En línea",
    sincronizando: `Sincronizando (${pendientes})`,
    "sin-conexion":
      ventas > 0
        ? `Sin conexión — ${ventas} ${ventas === 1 ? "venta guardada" : "ventas guardadas"}`
        : "Sin conexión",
  } as const;

  const Icono = estado === "sin-conexion" ? CloudOff : estado === "sincronizando" ? RefreshCw : Cloud;

  const Contenedor = onClick ? "button" : "div";

  return (
    <Contenedor
      onClick={onClick}
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-2 rounded-full border bg-surface px-3 py-1.5 text-sm font-medium",
        estilos[estado],
        className,
      )}
    >
      <Icono
        size={16}
        aria-hidden
        className={estado === "sincronizando" ? "animate-spin motion-reduce:animate-none" : ""}
      />
      <span>{texto[estado]}</span>
    </Contenedor>
  );
}
