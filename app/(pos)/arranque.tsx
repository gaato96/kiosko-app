"use client";

/**
 * Arranque del POS: no pinta nada, prepara el terreno.
 *
 *  - carga la sesión y el dispositivo en el store
 *  - registra el dispositivo en el servidor (si hay red)
 *  - baja el catálogo a Dexie y arma el índice del buscador
 *  - deja corriendo el sincronizador de fondo
 *  - pide el wake lock para que la tablet no se apague en el mostrador
 *
 * Nada de esto bloquea el cobro: el POS ya funciona con lo que haya en Dexie.
 */

import { useEffect } from "react";
import { idDispositivo, nombreDispositivo } from "@/lib/db/device";
import { refrescarOperadores } from "@/lib/db/operadores";
import { iniciarSyncAutomatico } from "@/lib/db/sync";
import { refrescarIndice } from "@/lib/pos/buscar";
import { usarSesion } from "@/lib/store/sesion";
import type { Rol } from "@/lib/tipos";

export function ArranquePos({
  comercioId,
  comercioNombre,
  rol,
  usuarioId,
}: {
  comercioId: string;
  comercioNombre: string | null;
  rol: Rol;
  usuarioId: string;
}) {
  const definirCuenta = usarSesion((s) => s.definirCuenta);
  const definirDispositivo = usarSesion((s) => s.definirDispositivo);

  // Primero se rehidrata el store desde localStorage (el operador del turno,
  // el dispositivo, la caja abierta) y recién después se pisa la cuenta con lo
  // que dice el servidor. Ver `skipHydration` en lib/store/sesion.ts.
  useEffect(() => {
    void usarSesion.persist.rehydrate();
  }, []);

  useEffect(() => {
    definirCuenta({ comercioId, comercioNombre, rolCuenta: rol, usuarioId });
  }, [comercioId, comercioNombre, rol, usuarioId, definirCuenta]);

  useEffect(() => {
    let cancelado = false;

    void (async () => {
      const id = await idDispositivo();
      const nombre = await nombreDispositivo();
      if (cancelado) return;
      definirDispositivo(id, nombre);

      // El índice del buscador se arma con lo que ya está en Dexie: si el
      // kiosco abre sin internet, el mostrador igual busca.
      await refrescarIndice();

      if (!navigator.onLine) return;

      try {
        const { supabaseBrowser } = await import("@/lib/supabase/browser");
        await supabaseBrowser()
          .from("dispositivos")
          .upsert({ id, comercio_id: comercioId, nombre, ultimo_uso: new Date().toISOString() });
        await refrescarOperadores(comercioId);
      } catch {
        // Sin red no pasa nada: se reintenta en el próximo arranque.
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [comercioId, definirDispositivo]);

  useEffect(() => {
    const detener = iniciarSyncAutomatico(comercioId);
    return detener;
  }, [comercioId]);

  // Después de cada sync el catálogo puede haber cambiado: se rearma el índice.
  useEffect(() => {
    const alSincronizar = () => void refrescarIndice();
    window.addEventListener("kiosko:sincronizado", alSincronizar);
    return () => window.removeEventListener("kiosko:sincronizado", alSincronizar);
  }, []);

  // Wake lock: la tablet del mostrador no se apaga sola entre cliente y cliente.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;

    const pedir = async () => {
      try {
        if ("wakeLock" in navigator && document.visibilityState === "visible") {
          lock = await navigator.wakeLock.request("screen");
        }
      } catch {
        // El wake lock es un lujo, no un requisito.
      }
    };

    void pedir();
    document.addEventListener("visibilitychange", pedir);
    return () => {
      document.removeEventListener("visibilitychange", pedir);
      void lock?.release();
    };
  }, []);

  return null;
}
