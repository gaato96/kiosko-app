"use client";

/**
 * El estado vivo de los pedidos, compartido por el panel y la bandeja.
 *
 * Las dos pantallas leían por su cuenta, cada una con su copia y su propia
 * suscripción. Resultado: marcabas un pedido como entregado en la bandeja y el
 * panel lo seguía contando en "pedidos a preparar" hasta que apretabas F5.
 * Ahora las dos usan esto y ven exactamente lo mismo.
 *
 * Se llama `usePedidos` y no `usarPedidos` porque la regla `rules-of-hooks` de
 * eslint reconoce los hooks por el prefijo `use`. Con el nombre en español deja
 * de validar el orden de los hooks adentro, que es exactamente el error que
 * esa regla existe para agarrar.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import {
  avisarDelSistema,
  pedirPermisoDeAviso,
  useTablaEnVivo,
} from "@/lib/supabase/realtime";
import { ESTADOS_ABIERTOS } from "@/lib/pedidos";
import { formatearPesos } from "@/lib/money";
import type { PedidoConItems, PedidoVidriera } from "@/lib/tipos";
import type { PasoPedido } from "@/lib/pedidos";

const SELECT = "*, items:pedidos_items(*)";

export function usePedidos({
  comercioId,
  iniciales,
  soloAbiertos = false,
  limite = 50,
  avisar = false,
}: {
  comercioId: string;
  iniciales: PedidoConItems[];
  /** El panel muestra solo lo que falta despachar; la bandeja muestra todo. */
  soloAbiertos?: boolean;
  limite?: number;
  /** Bip y notificación del sistema cuando entra uno nuevo. */
  avisar?: boolean;
}) {
  const [pedidos, setPedidos] = useState(iniciales);
  const [conSonido, setConSonido] = useState(avisar);
  const [aviso, setAviso] = useState<string | null>(null);
  const [recienLlegado, setRecienLlegado] = useState<string | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const conocidos = useRef(new Set(iniciales.map((p) => p.id)));

  /**
   * Un bip corto generado en el momento. No se descarga un archivo de audio
   * para no sumarle otro pedido de red a una app que tiene que abrir rápido en
   * una tablet vieja.
   */
  const sonar = useCallback(() => {
    if (!conSonido) return;
    try {
      audio.current ??= new AudioContext();
      const ctx = audio.current;
      if (ctx.state === "suspended") void ctx.resume();
      const osc = ctx.createOscillator();
      const vol = ctx.createGain();
      osc.connect(vol);
      vol.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.12);
      vol.gain.setValueAtTime(0.0001, ctx.currentTime);
      vol.gain.exponentialRampToValueAtTime(0.32, ctx.currentTime + 0.02);
      vol.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
      osc.start();
      osc.stop(ctx.currentTime + 0.47);
    } catch {
      // Sin audio el aviso visual sigue. No es motivo para romper la pantalla.
    }
  }, [conSonido]);

  const anunciar = useCallback(
    (nuevos: PedidoVidriera[]) => {
      sonar();
      setRecienLlegado(nuevos[0]!.id);
      setTimeout(() => setRecienLlegado(null), 8000);
      const p = nuevos[0]!;
      avisarDelSistema(
        nuevos.length === 1 ? `Pedido nuevo de ${p.nombre_cliente}` : `${nuevos.length} pedidos nuevos`,
        `${formatearPesos(p.total_centavos)} · ${p.tipo_entrega === "ENVIO" ? "Envío" : "Retira en el local"}`,
        p.id,
      );
    },
    [sonar],
  );

  const recargar = useCallback(async () => {
    let q = supabaseBrowser()
      .from("pedidos_vidriera")
      .select(SELECT)
      .order("creado_en", { ascending: false })
      .limit(limite);
    if (soloAbiertos) q = q.in("estado", ESTADOS_ABIERTOS);

    const { data } = await q;
    if (!data) return;

    const lista = data as unknown as PedidoConItems[];

    // Los que aparecieron desde la última mirada. Sirve cuando el websocket
    // estuvo caído: el repaso los trae y el aviso suena igual.
    const nuevos = lista.filter(
      (p) => p.estado === "NUEVO" && !conocidos.current.has(p.id),
    );
    lista.forEach((p) => conocidos.current.add(p.id));

    setPedidos(lista);
    if (nuevos.length > 0 && avisar) anunciar(nuevos);
  }, [limite, soloAbiertos, avisar, anunciar]);

  useTablaEnVivo<PedidoVidriera>({
    canal: `pedidos-${comercioId}`,
    tabla: "pedidos_vidriera",
    filtro: `comercio_id=eq.${comercioId}`,
    // El evento de realtime trae la fila de `pedidos_vidriera` pero NO sus
    // items, que viven en otra tabla. Por eso se relee: mostrar un pedido sin
    // saber qué pidió no sirve para nada.
    onCambio: (cambio) => {
      const fila = cambio.new as PedidoVidriera | undefined;
      if (cambio.eventType === "INSERT" && fila && !conocidos.current.has(fila.id)) {
        conocidos.current.add(fila.id);
        if (avisar) anunciar([fila]);
      }
      void recargar();
    },
    onRepaso: recargar,
  });

  useEffect(() => {
    if (avisar && conSonido) void pedirPermisoDeAviso();
  }, [avisar, conSonido]);

  /** Ejecuta un paso del circuito y deja el estado local al día. */
  const correrPaso = useCallback(
    async (pedido: PedidoConItems, paso: PasoPedido) => {
      const sb = supabaseBrowser();

      if (paso.estado === "CONVERTIR") {
        const { error } = await sb.rpc("convertir_pedido_en_venta", { p_pedido_id: pedido.id });
        setAviso(
          error
            ? `No se pudo confirmar: ${error.message}`
            : `Pedido #${pedido.numero} confirmado. El stock ya bajó.`,
        );
      } else {
        const { error } = await sb.rpc("cambiar_estado_pedido", {
          p_pedido_id: pedido.id,
          p_estado: paso.estado,
        });
        setAviso(
          error
            ? error.message
            : paso.estado === "ENTREGADO"
              ? `Pedido #${pedido.numero} entregado.`
              : null,
        );
      }

      await recargar();
    },
    [recargar],
  );

  return {
    pedidos,
    recienLlegado,
    aviso,
    limpiarAviso: () => setAviso(null),
    conSonido,
    setConSonido,
    correrPaso,
    recargar,
  };
}
