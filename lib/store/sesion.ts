"use client";

/**
 * Store de sesión (Zustand).
 *
 * Distingue dos cosas que se confunden seguido:
 *   - la SESIÓN de Supabase: una sola por dispositivo, la del negocio;
 *   - el OPERADOR actual: quién está atendiendo ahora, el que se estampa en
 *     cada venta. Cambia con un PIN, sin cerrar sesión y sin perder el ticket.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Rol } from "@/lib/tipos";

export type Operador = { id: string; nombre: string; rol: Rol };

type EstadoSesion = {
  comercioId: string | null;
  comercioNombre: string | null;
  rolCuenta: Rol | "anon";
  usuarioId: string | null;

  operador: Operador | null;
  dispositivoId: string | null;
  dispositivoNombre: string | null;

  cajaSesionId: string | null;

  definirCuenta: (d: {
    comercioId: string | null;
    comercioNombre?: string | null;
    rolCuenta: Rol | "anon";
    usuarioId: string | null;
  }) => void;
  definirOperador: (o: Operador | null) => void;
  definirDispositivo: (id: string, nombre: string) => void;
  definirCaja: (id: string | null) => void;
  limpiar: () => void;
};

/**
 * Se persiste en localStorage y no en IndexedDB a propósito: es un puñado de
 * bytes que tiene que estar disponible de forma síncrona en el primer render
 * del POS. Los datos de negocio sí van a Dexie.
 */
export const usarSesion = create<EstadoSesion>()(
  persist(
    (set) => ({
      comercioId: null,
      comercioNombre: null,
      rolCuenta: "anon",
      usuarioId: null,
      operador: null,
      dispositivoId: null,
      dispositivoNombre: null,
      cajaSesionId: null,

      definirCuenta: (d) =>
        set({
          comercioId: d.comercioId,
          comercioNombre: d.comercioNombre ?? null,
          rolCuenta: d.rolCuenta,
          usuarioId: d.usuarioId,
        }),
      definirOperador: (operador) => set({ operador }),
      definirDispositivo: (dispositivoId, dispositivoNombre) =>
        set({ dispositivoId, dispositivoNombre }),
      definirCaja: (cajaSesionId) => set({ cajaSesionId }),
      limpiar: () =>
        set({
          comercioId: null,
          comercioNombre: null,
          rolCuenta: "anon",
          usuarioId: null,
          operador: null,
          cajaSesionId: null,
        }),
    }),
    {
      name: "kiosko:sesion",
      storage: createJSONStorage(() => localStorage),
      /**
       * La rehidratación NO es automática, y es a propósito.
       *
       * Por defecto zustand lee localStorage mientras se evalúa el módulo. En
       * el servidor no hay localStorage, así que el HTML sale con el operador
       * y el comercio en null; en el navegador el store ya viene lleno para el
       * primer render. React compara los dos y tira el error de hidratación
       * que se veía en la consola del POS.
       *
       * Con `skipHydration` los dos primeros renders dicen lo mismo y el store
       * se llena un tick después, desde <ArranquePos>.
       */
      skipHydration: true,
    },
  ),
);

/** El usuario_id que se estampa en la venta: el operador si hay, si no la cuenta. */
export function operadorEfectivo(): string | null {
  const s = usarSesion.getState();
  return s.operador?.id ?? s.usuarioId;
}
