"use client";

/**
 * lib/store/ticket.ts — el ticket en curso.
 *
 * Estado local efímero, en Zustand, persistido para que cerrar la app a mitad
 * de una venta no borre nada. Vive APARTE del store de sesión: por eso cambiar
 * de operador no pierde el ticket.
 *
 * Todos los importes en centavos, todas las cantidades en enteros (unidades o
 * gramos). Acá no hay un solo float.
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { uuidv7 } from "uuidv7";
import type { MedioPago, TipoVenta } from "@/lib/tipos";

export type LineaTicket = {
  id: string;
  productoId: string | null;
  descripcion: string;
  tipoVenta: TipoVenta;
  /** Unidades si UNIDAD, GRAMOS si PESO. Entero siempre. */
  cantidad: number;
  /** Por unidad o por KILO. Congelado al agregar (regla del POS §2). */
  precioUnitarioCentavos: number;
  totalCentavos: number;
  /** Marca la línea cuando el stock cacheado ya estaba en cero o menos. */
  sinStock?: boolean;
  /** Los SERVICIO (recargas, SUBE) no descuentan stock. */
  esServicio?: boolean;
};

export type PagoTicket = {
  id: string;
  medio: MedioPago;
  montoCentavos: number;
  recibidoCentavos?: number;
  vueltoCentavos?: number;
  referencia?: string;
};

type EstadoTicket = {
  lineas: LineaTicket[];
  descuentoCentavos: number;
  clienteId: string | null;
  clienteNombre: string | null;
  nota: string | null;

  agregar: (linea: Omit<LineaTicket, "id">) => void;
  cambiarCantidad: (id: string, cantidad: number) => void;
  sumarUno: (id: string) => void;
  restarUno: (id: string) => void;
  quitar: (id: string) => void;
  definirDescuento: (centavos: number) => void;
  definirCliente: (id: string | null, nombre: string | null) => void;
  definirNota: (nota: string | null) => void;
  vaciar: () => void;
};

/** Recalcula el total de una línea a partir de la cantidad. */
function recalcular(l: LineaTicket, cantidad: number): LineaTicket {
  const total =
    l.tipoVenta === "PESO"
      ? Math.round((cantidad * l.precioUnitarioCentavos) / 1000)
      : cantidad * l.precioUnitarioCentavos;
  return { ...l, cantidad, totalCentavos: total };
}

export const usarTicket = create<EstadoTicket>()(
  persist(
    (set) => ({
      lineas: [],
      descuentoCentavos: 0,
      clienteId: null,
      clienteNombre: null,
      nota: null,

      agregar: (linea) =>
        set((s) => {
          // Regla del POS §4: agregar dos veces el mismo producto de UNIDAD suma
          // a la línea existente. Cada pesada, en cambio, es su propia línea:
          // 250 g y 180 g de jamón son dos cortes distintos y así se leen.
          if (linea.tipoVenta === "UNIDAD" && linea.productoId && !linea.esServicio) {
            const i = s.lineas.findIndex((l) => l.productoId === linea.productoId);
            if (i >= 0) {
              const actual = s.lineas[i]!;
              const nuevas = [...s.lineas];
              nuevas[i] = recalcular(actual, actual.cantidad + linea.cantidad);
              return { lineas: nuevas };
            }
          }
          return { lineas: [...s.lineas, { ...linea, id: uuidv7() }] };
        }),

      cambiarCantidad: (id, cantidad) =>
        set((s) => ({
          lineas:
            cantidad <= 0
              ? s.lineas.filter((l) => l.id !== id)
              : s.lineas.map((l) => (l.id === id ? recalcular(l, cantidad) : l)),
        })),

      sumarUno: (id) =>
        set((s) => ({
          lineas: s.lineas.map((l) =>
            l.id === id ? recalcular(l, l.cantidad + (l.tipoVenta === "PESO" ? 50 : 1)) : l,
          ),
        })),

      restarUno: (id) =>
        set((s) => ({
          lineas: s.lineas
            .map((l) =>
              l.id === id
                ? recalcular(l, Math.max(0, l.cantidad - (l.tipoVenta === "PESO" ? 50 : 1)))
                : l,
            )
            .filter((l) => l.cantidad > 0),
        })),

      quitar: (id) => set((s) => ({ lineas: s.lineas.filter((l) => l.id !== id) })),

      definirDescuento: (descuentoCentavos) => set({ descuentoCentavos }),
      definirCliente: (clienteId, clienteNombre) => set({ clienteId, clienteNombre }),
      definirNota: (nota) => set({ nota }),

      vaciar: () =>
        set({
          lineas: [],
          descuentoCentavos: 0,
          clienteId: null,
          clienteNombre: null,
          nota: null,
        }),
    }),
    { name: "kiosko:ticket", storage: createJSONStorage(() => localStorage) },
  ),
);

export function subtotalDe(lineas: LineaTicket[]): number {
  return lineas.reduce((a, l) => a + l.totalCentavos, 0);
}

export function totalDe(lineas: LineaTicket[], descuentoCentavos: number): number {
  return Math.max(0, subtotalDe(lineas) - descuentoCentavos);
}

/** Cuántos toques quedan: se usa para el badge del ticket en celular. */
export function cantidadItems(lineas: LineaTicket[]): number {
  return lineas.length;
}
