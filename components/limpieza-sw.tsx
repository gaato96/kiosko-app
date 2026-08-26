"use client";

import { useEffect } from "react";

/**
 * En desarrollo el service worker está deshabilitado (next.config.ts), pero un
 * SW registrado en una visita anterior sigue vivo y sirve un shell viejo: la
 * app aparece sin estilos y no hay forma de darse cuenta desde el código.
 *
 * Esto lo desregistra y limpia sus caches. En producción no hace nada.
 */
export function LimpiezaServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (!("serviceWorker" in navigator)) return;

    void navigator.serviceWorker.getRegistrations().then(async (regs) => {
      if (regs.length === 0) return;
      await Promise.all(regs.map((r) => r.unregister()));
      if ("caches" in window) {
        const nombres = await caches.keys();
        await Promise.all(nombres.map((n) => caches.delete(n)));
      }
      location.reload();
    });
  }, []);

  return null;
}
