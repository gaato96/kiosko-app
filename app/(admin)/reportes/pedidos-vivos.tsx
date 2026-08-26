"use client";

/**
 * Los pedidos de la Vidriera, arriba de todo en el panel.
 *
 * Es lo único de esta pantalla con alguien esperando del otro lado: el resto
 * son números de algo que ya pasó. Por eso va primero, ocupa ancho completo y
 * es lo único que hace ruido.
 *
 * Un pedido que entra mientras el dueño mira el panel tiene que avisar solo.
 * Si hay que refrescar para enterarse, el canal no sirve: el cliente ya se fue
 * a pedir por otro lado.
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellOff, Bike, Store } from "lucide-react";
import { Pildora } from "@/components/ui/pildora";
import { formatearPesos } from "@/lib/money";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { PedidoVidriera } from "@/lib/tipos";
import { cn } from "@/lib/utils";

const ABIERTOS = ["NUEVO", "ACEPTADO", "PREPARANDO"];

export function PedidosVivos({
  iniciales,
  comercioId,
}: {
  iniciales: PedidoVidriera[];
  comercioId: string;
}) {
  const [pedidos, setPedidos] = useState<PedidoVidriera[]>(iniciales);
  const [avisar, setAvisar] = useState(true);
  const [recienLlegado, setRecienLlegado] = useState<string | null>(null);
  const audioRef = useRef<AudioContext | null>(null);

  /**
   * Un bip corto generado en el momento. No se usa un archivo de audio para no
   * sumar una descarga más a una app que tiene que arrancar rápido en una
   * tablet vieja.
   */
  const sonar = useCallback(() => {
    if (!avisar) return;
    try {
      audioRef.current ??= new AudioContext();
      const ctx = audioRef.current;
      if (ctx.state === "suspended") void ctx.resume();

      const osc = ctx.createOscillator();
      const vol = ctx.createGain();
      osc.connect(vol);
      vol.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.12);
      vol.gain.setValueAtTime(0.0001, ctx.currentTime);
      vol.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
      vol.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
      osc.start();
      osc.stop(ctx.currentTime + 0.42);
    } catch {
      // Sin audio disponible el aviso visual sigue estando. No es motivo para romper.
    }
  }, [avisar]);

  useEffect(() => {
    const supabase = supabaseBrowser();

    const canal = supabase
      .channel(`pedidos-panel-${comercioId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pedidos_vidriera",
          filter: `comercio_id=eq.${comercioId}`,
        },
        (payload) => {
          const nuevo = payload.new as PedidoVidriera | undefined;
          const viejo = payload.old as { id?: string } | undefined;

          setPedidos((antes) => {
            if (payload.eventType === "DELETE") {
              return antes.filter((p) => p.id !== viejo?.id);
            }
            if (!nuevo) return antes;

            // Un pedido que salió de los estados abiertos ya no va acá.
            if (!ABIERTOS.includes(nuevo.estado)) {
              return antes.filter((p) => p.id !== nuevo.id);
            }

            const i = antes.findIndex((p) => p.id === nuevo.id);
            if (i === -1) return [nuevo, ...antes];
            const copia = [...antes];
            copia[i] = nuevo;
            return copia;
          });

          if (payload.eventType === "INSERT" && nuevo) {
            sonar();
            setRecienLlegado(nuevo.id);
            setTimeout(() => setRecienLlegado(null), 6000);
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(canal);
    };
  }, [comercioId, sonar]);

  const nuevos = pedidos.filter((p) => p.estado === "NUEVO").length;

  if (pedidos.length === 0) {
    return (
      <section className="tarjeta flex flex-wrap items-center justify-between gap-3 border-dashed p-4">
        <p className="flex items-center gap-2.5 text-sm text-text-muted">
          <Store size={17} className="shrink-0 text-text-sutil" aria-hidden />
          No hay pedidos pendientes de la Vidriera.
        </p>
        <BotonAviso avisar={avisar} onCambiar={setAvisar} />
      </section>
    );
  }

  return (
    <section
      aria-label="Pedidos de la Vidriera"
      className={cn(
        "rounded-[var(--radio-lg)] border bg-surface shadow-[var(--sombra-2)]",
        nuevos > 0 ? "border-plata/45" : "border-border",
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-[var(--radio-sm)]",
              nuevos > 0 ? "bg-plata-tenue text-plata" : "bg-surface-alt text-text-muted",
            )}
          >
            <Bell size={18} aria-hidden />
          </span>
          <div>
            <h2 className="font-display text-base font-semibold leading-tight">
              Pedidos para preparar
            </h2>
            <p className="text-sm text-text-muted">
              {nuevos > 0
                ? `${nuevos} sin confirmar todavía`
                : `${pedidos.length} en curso`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <BotonAviso avisar={avisar} onCambiar={setAvisar} />
          <Link
            href="/vidriera"
            className="presion flex min-h-11 items-center rounded-[var(--radio)] border border-border bg-surface px-4 text-sm font-semibold hover:border-border-fuerte"
          >
            Ver todos
          </Link>
        </div>
      </header>

      <ul className="divide-y divide-border">
        {pedidos.slice(0, 6).map((p) => (
          <li
            key={p.id}
            className={cn(
              "flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 transition-colors",
              recienLlegado === p.id && "bg-plata-tenue",
            )}
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="num shrink-0 text-sm font-bold text-text-sutil">
                #{p.numero ?? "—"}
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold">{p.nombre_cliente}</p>
                <p className="flex items-center gap-1.5 text-sm text-text-muted">
                  {p.tipo_entrega === "ENVIO" ? (
                    <Bike size={14} className="shrink-0" aria-hidden />
                  ) : (
                    <Store size={14} className="shrink-0" aria-hidden />
                  )}
                  {p.tipo_entrega === "ENVIO" ? "Envío" : "Retira en el local"}
                  <span aria-hidden>·</span>
                  {new Date(p.creado_en).toLocaleTimeString("es-AR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <Pildora tono={p.estado === "NUEVO" ? "plata" : "neutral"}>
                {p.estado === "NUEVO" ? "Sin confirmar" : p.estado.toLowerCase()}
              </Pildora>
              <span className="num text-lg font-bold">{formatearPesos(p.total_centavos)}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function BotonAviso({
  avisar,
  onCambiar,
}: {
  avisar: boolean;
  onCambiar: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onCambiar(!avisar)}
      aria-pressed={avisar}
      title={avisar ? "Sonar cuando entra un pedido" : "Avisos en silencio"}
      className="presion flex min-h-11 items-center gap-2 rounded-[var(--radio)] px-3 text-sm font-semibold text-text-muted hover:bg-surface-alt hover:text-text"
    >
      {avisar ? <Bell size={16} aria-hidden /> : <BellOff size={16} aria-hidden />}
      <span className="hidden sm:inline">{avisar ? "Con sonido" : "Silenciado"}</span>
    </button>
  );
}
