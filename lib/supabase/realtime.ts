"use client";

/**
 * lib/supabase/realtime.ts — suscripciones en vivo que de verdad llegan.
 *
 * ATENCIÓN, ACÁ HUBO UN BUG CARO. El socket de Realtime arranca con la clave
 * anónima. El token del usuario se le aplica recién cuando `onAuthStateChange`
 * termina de recuperar la sesión de las cookies, y eso pasa DESPUÉS de que un
 * componente que se suscribe al montar ya llamó a `.subscribe()`.
 *
 * El resultado es el peor posible para depurar: el canal responde `SUBSCRIBED`,
 * no tira ningún error, y el servidor descarta en silencio todos los eventos
 * porque la política RLS (`comercio_id = comercio_id()`) evalúa el JWT anónimo,
 * donde no hay `comercio_id`. Parece que anda y no llega nada nunca.
 *
 * Por eso acá se hace `await realtime.setAuth(token)` ANTES de suscribirse, y
 * se vuelve a aplicar en cada refresco de token.
 *
 * Además hay repaso periódico. No es paranoia: un kiosco tiene wifi de módem
 * de la compañía de cable con el microondas al lado. El websocket se cae y
 * vuelve, y mientras estaba caído entraron pedidos. El repaso los recupera.
 */

import { useEffect, useRef } from "react";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { supabaseBrowser } from "./browser";

type Opciones<T extends { [key: string]: unknown }> = {
  /** Nombre único del canal. Dos pestañas del mismo usuario pueden repetirlo. */
  canal: string;
  tabla: string;
  /** Filtro de PostgREST, por ejemplo `comercio_id=eq.<uuid>`. */
  filtro?: string;
  onCambio: (cambio: RealtimePostgresChangesPayload<T>) => void;
  /**
   * Red de contención. Corre cada `repasoMs`, al volver la conexión y al
   * volver a mirar la pestaña. Si el websocket estuvo caído, esto es lo único
   * que trae lo que pasó mientras tanto.
   */
  onRepaso?: () => void | Promise<void>;
  repasoMs?: number;
};

export function useTablaEnVivo<T extends { [key: string]: unknown }>({
  canal,
  tabla,
  filtro,
  onCambio,
  onRepaso,
  repasoMs = 30_000,
}: Opciones<T>) {
  // Las funciones van por ref para que el efecto no se vuelva a armar cada
  // render. Rearmar el canal en cada render es una fuga de sockets.
  const refCambio = useRef(onCambio);
  const refRepaso = useRef(onRepaso);
  refCambio.current = onCambio;
  refRepaso.current = onRepaso;

  useEffect(() => {
    const sb = supabaseBrowser();
    let vivo = true;
    let suscripcion: RealtimeChannel | null = null;

    async function abrir() {
      const { data } = await sb.auth.getSession();
      if (!vivo) return;

      // El paso que faltaba. Sin esto RLS descarta todo en silencio.
      await sb.realtime.setAuth(data.session?.access_token);
      if (!vivo) return;

      suscripcion = sb
        .channel(canal)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: tabla, ...(filtro ? { filter: filtro } : {}) },
          (cambio) => refCambio.current(cambio as RealtimePostgresChangesPayload<T>),
        )
        .subscribe();
    }

    void abrir();

    // Token nuevo, socket nuevo: si no se reaplica, a la hora deja de llegar.
    const { data: escucha } = sb.auth.onAuthStateChange((evento, sesion) => {
      if (evento === "TOKEN_REFRESHED" && sesion) void sb.realtime.setAuth(sesion.access_token);
    });

    const repasar = () => void refRepaso.current?.();
    const reloj = setInterval(repasar, repasoMs);
    const alVolver = () => {
      if (document.visibilityState === "visible") repasar();
    };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("online", repasar);

    return () => {
      vivo = false;
      clearInterval(reloj);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("online", repasar);
      escucha.subscription.unsubscribe();
      if (suscripcion) void sb.removeChannel(suscripcion);
    };
  }, [canal, tabla, filtro, repasoMs]);
}

/**
 * Permiso de notificaciones del sistema.
 *
 * El bip solo se escucha si la pestaña está en primer plano y el kiosco no
 * tiene música. La notificación del navegador aparece igual con la app atrás,
 * que es donde está el 90% del tiempo mientras se atiende el mostrador.
 */
export async function pedirPermisoDeAviso(): Promise<boolean> {
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  return (await Notification.requestPermission()) === "granted";
}

export function avisarDelSistema(titulo: string, cuerpo: string, tag?: string) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    // `tag` evita que el mismo pedido apile diez globos si el evento se repite.
    new Notification(titulo, { body: cuerpo, tag, icon: "/icons/icono-192.png" });
  } catch {
    // Un navegador sin soporte no es motivo para romper la pantalla.
  }
}
