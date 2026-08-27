import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Vibración corta. En el mostrador lo visual solo no alcanza.
 *
 * Va envuelta en try/catch porque esto se llama ANTES del `onClick` real en
 * los botones y en las teclas del numpad: si `vibrate` llegara a tirar —hay
 * navegadores que lo hacen cuando la política de permisos lo bloquea— se
 * llevaría puesta la acción del botón, y desde el mostrador eso se ve como un
 * teclado que no responde.
 */
export function haptico(patron: number | number[] = 10): void {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(patron);
    }
  } catch {
    // Un lujo, no un requisito.
  }
}

/**
 * La zona del negocio. Está fijada a propósito: el dominio es argentino y el
 * servidor de Vercel corre en UTC. Sin fijarla, una venta de las 21:00 de un
 * martes cae en el miércoles y el panel del día la pierde.
 */
export const ZONA_NEGOCIO = "America/Argentina/Buenos_Aires";

/** Partes de una fecha ya convertidas a la hora de Argentina. */
function partesEnZona(d: Date): { anio: string; mes: string; dia: string; diaSemana: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_NEGOCIO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });

  const partes = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  const CORTOS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return {
    anio: partes.year!,
    mes: partes.month!,
    dia: partes.day!,
    diaSemana: Math.max(0, CORTOS.indexOf(partes.weekday!)),
  };
}

/** Fecha del negocio en YYYY-MM-DD. Es la que se le manda a los RPC. */
export function fechaLocal(d = new Date()): string {
  const { anio, mes, dia } = partesEnZona(d);
  return `${anio}-${mes}-${dia}`;
}

export function horaCorta(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-AR", {
    timeZone: ZONA_NEGOCIO,
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", {
    timeZone: ZONA_NEGOCIO,
    day: "2-digit",
    month: "2-digit",
  });
}

/** Fecha larga para encabezados: "25/08/2026". */
export function fechaLarga(d = new Date()): string {
  return d.toLocaleDateString("es-AR", {
    timeZone: ZONA_NEGOCIO,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;

export function nombreDia(d = new Date()): string {
  return DIAS[partesEnZona(d).diaSemana]!;
}
