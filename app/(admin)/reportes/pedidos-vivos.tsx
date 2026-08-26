"use client";

/**
 * Los pedidos de la Vidriera, arriba de todo en el panel.
 *
 * Es lo único de esta pantalla con alguien esperando del otro lado: el resto
 * son números de algo que ya pasó. Por eso va primero, ocupa ancho completo y
 * es lo único que hace ruido.
 *
 * Acá se despacha, no se mira. El pedido se confirma, se prepara y se marca
 * entregado desde esta misma lista: hasta ahora había que irse a otra pantalla
 * y el panel quedaba mintiendo con "1 en curso" el resto del día.
 */

import Link from "next/link";
import { Bell, BellOff, Store } from "lucide-react";
import { TarjetaPedido } from "@/components/pedidos/tarjeta-pedido";
import { usePedidos } from "@/components/pedidos/use-pedidos";
import type { PedidoConItems, ZonaEnvio } from "@/lib/tipos";
import { cn } from "@/lib/utils";

export function PedidosVivos({
  iniciales,
  comercioId,
  zonas,
}: {
  iniciales: PedidoConItems[];
  comercioId: string;
  zonas: ZonaEnvio[];
}) {
  const { pedidos, recienLlegado, aviso, limpiarAviso, conSonido, setConSonido, correrPaso } =
    usePedidos({ comercioId, iniciales, soloAbiertos: true, limite: 20, avisar: true });

  const nuevos = pedidos.filter((p) => p.estado === "NUEVO").length;
  const nombreZona = (id: string | null) => zonas.find((z) => z.id === id)?.nombre ?? null;

  if (pedidos.length === 0) {
    return (
      <section className="tarjeta flex flex-wrap items-center justify-between gap-3 border-dashed p-4">
        <p className="flex items-center gap-2.5 text-sm text-text-muted">
          <Store size={17} className="shrink-0 text-text-sutil" aria-hidden />
          No hay pedidos pendientes de la Vidriera.
        </p>
        <BotonAviso conSonido={conSonido} onCambiar={setConSonido} />
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
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radio-sm)]",
              nuevos > 0 ? "bg-plata-tenue text-plata" : "bg-surface-alt text-text-muted",
            )}
          >
            <Bell size={18} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold leading-tight">
              Pedidos para preparar
            </h2>
            <p className="text-sm text-text-muted">
              {nuevos > 0 ? `${nuevos} sin confirmar todavía` : `${pedidos.length} en curso`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <BotonAviso conSonido={conSonido} onCambiar={setConSonido} />
          <Link
            href="/vidriera"
            className="presion flex min-h-11 items-center rounded-[var(--radio)] border border-border bg-surface px-4 text-sm font-semibold hover:border-border-fuerte"
          >
            Ver todos
          </Link>
        </div>
      </header>

      {aviso ? (
        <button
          type="button"
          onClick={limpiarAviso}
          className="block w-full border-b border-border bg-surface-alt/60 px-4 py-2.5 text-left text-sm sm:px-5"
        >
          {aviso}
        </button>
      ) : null}

      <div className="flex flex-col gap-3 p-3 sm:p-4">
        {pedidos.map((p) => (
          <TarjetaPedido
            key={p.id}
            pedido={p}
            zona={nombreZona(p.zona_id)}
            onPaso={correrPaso}
            recienLlegado={recienLlegado === p.id}
            // Plegada de arranque salvo que esté sin confirmar: lo urgente se
            // abre solo, lo que ya está en curso no ocupa media pantalla.
            compacta={p.estado !== "NUEVO"}
          />
        ))}
      </div>
    </section>
  );
}

function BotonAviso({
  conSonido,
  onCambiar,
}: {
  conSonido: boolean;
  onCambiar: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onCambiar(!conSonido)}
      aria-pressed={conSonido}
      title={conSonido ? "Sonar cuando entra un pedido" : "Avisos en silencio"}
      className="presion flex min-h-11 items-center gap-2 rounded-[var(--radio)] px-3 text-sm font-semibold text-text-muted hover:bg-surface-alt hover:text-text"
    >
      {conSonido ? <Bell size={16} aria-hidden /> : <BellOff size={16} aria-hidden />}
      <span className="hidden sm:inline">{conSonido ? "Con sonido" : "Silenciado"}</span>
    </button>
  );
}
