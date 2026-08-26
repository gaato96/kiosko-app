"use client";

/**
 * La bandeja de pedidos.
 *
 * La atiende quien esté en el mostrador, dueño o empleado: el pedido entra y
 * hay alguien esperando la confirmación del otro lado.
 *
 * Con un toque el pedido se convierte en venta y DESCUENTA STOCK, que es
 * exactamente lo que un wa.me suelto no hace. Confirmar y entregar son dos
 * pasos distintos a propósito: que la mercadería ya haya bajado del stock no
 * significa que salió del local.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, BellOff, Copy, ExternalLink, Inbox, QrCode, Store } from "lucide-react";
import { TarjetaPedido } from "@/components/pedidos/tarjeta-pedido";
import { usePedidos } from "@/components/pedidos/use-pedidos";
import { Boton } from "@/components/ui/boton";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { Hoja } from "@/components/ui/hoja";
import { ESTADOS_ABIERTOS } from "@/lib/pedidos";
import type { PedidoConItems, ZonaEnvio } from "@/lib/tipos";
import { cn } from "@/lib/utils";

type Filtro = "abiertos" | "todos";

export function BandejaPedidos({
  comercioId,
  slug,
  url,
  activa,
  pedidos: iniciales,
  zonas,
}: {
  comercioId: string;
  slug: string;
  url: string;
  activa: boolean;
  pedidos: PedidoConItems[];
  zonas: ZonaEnvio[];
}) {
  const [qrAbierto, setQrAbierto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("abiertos");

  const { pedidos, recienLlegado, aviso, limpiarAviso, conSonido, setConSonido, correrPaso } =
    usePedidos({ comercioId, iniciales, avisar: true });

  const abiertos = useMemo(
    () => pedidos.filter((p) => ESTADOS_ABIERTOS.includes(p.estado)),
    [pedidos],
  );
  const visibles = filtro === "abiertos" ? abiertos : pedidos;
  const nuevos = pedidos.filter((p) => p.estado === "NUEVO").length;
  const nombreZona = (id: string | null) => zonas.find((z) => z.id === id)?.nombre ?? null;

  return (
    <div className="flex flex-col gap-5">
      {/* El link público. Compacto: se mira una vez y después nunca más. */}
      <section className="tarjeta flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-3">
        <div className="min-w-0 flex-1">
          <p className="rotulo">Tu link público</p>
          <p className="truncate font-mono text-sm text-text-muted">{url || `/t/${slug}`}</p>
          {!activa ? (
            <p className="mt-1 text-sm font-medium text-warning">
              La vidriera está apagada. Prendela en Configuración para que el link funcione.
            </p>
          ) : null}
        </div>

        {/* En celular los tres botones van en una fila de anchos iguales: son
            del mismo peso y así ninguno queda de 30 px de ancho. */}
        <div className="grid grid-cols-3 gap-2 sm:flex sm:shrink-0">
          <Boton
            tamano="chico"
            onClick={() => {
              void navigator.clipboard.writeText(url);
              setCopiado(true);
              setTimeout(() => setCopiado(false), 2500);
            }}
          >
            <Copy size={16} /> {copiado ? "Copiado" : "Copiar"}
          </Boton>
          <Boton tamano="chico" onClick={() => setQrAbierto(true)}>
            <QrCode size={16} /> QR
          </Boton>
          <a
            href={url || `/t/${slug}`}
            target="_blank"
            rel="noopener"
            className="presion flex min-h-11 items-center justify-center gap-2 rounded-[var(--radio)] px-3.5 text-sm font-semibold text-text-muted hover:bg-surface-alt hover:text-text"
          >
            <ExternalLink size={16} aria-hidden /> Ver
          </a>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            Pedidos
            {nuevos > 0 ? (
              <span className="num rounded-full bg-plata px-2.5 py-0.5 text-sm font-bold text-plata-fg">
                {nuevos}
              </span>
            ) : null}
          </h2>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setConSonido(!conSonido)}
              aria-pressed={conSonido}
              title={conSonido ? "Sonar cuando entra un pedido" : "Avisos en silencio"}
              className="presion flex min-h-11 items-center gap-2 rounded-[var(--radio)] px-3 text-sm font-semibold text-text-muted hover:bg-surface-alt hover:text-text"
            >
              {conSonido ? <Bell size={16} aria-hidden /> : <BellOff size={16} aria-hidden />}
              <span className="hidden sm:inline">{conSonido ? "Con sonido" : "Silenciado"}</span>
            </button>

            <div
              role="tablist"
              aria-label="Qué pedidos mostrar"
              className="flex rounded-[var(--radio)] border border-border bg-surface p-0.5"
            >
              {(
                [
                  ["abiertos", `En curso${abiertos.length ? ` (${abiertos.length})` : ""}`],
                  ["todos", "Todos"],
                ] as const
              ).map(([valor, texto]) => (
                <button
                  key={valor}
                  role="tab"
                  aria-selected={filtro === valor}
                  onClick={() => setFiltro(valor)}
                  className={cn(
                    "presion min-h-10 rounded-[calc(var(--radio)-0.15rem)] px-3.5 text-sm font-semibold",
                    filtro === valor
                      ? "bg-tinta text-brand-fg"
                      : "text-text-muted hover:text-text",
                  )}
                >
                  {texto}
                </button>
              ))}
            </div>
          </div>
        </header>

        {aviso ? (
          <button
            type="button"
            onClick={limpiarAviso}
            className="tarjeta-alt/60 w-full p-3.5 text-left text-sm"
          >
            {aviso}
          </button>
        ) : null}

        {visibles.length === 0 ? (
          <EstadoVacio
            icono={filtro === "abiertos" ? Inbox : Store}
            titulo={
              filtro === "abiertos"
                ? "No queda nada por despachar"
                : "Todavía no entró ningún pedido"
            }
            detalle={
              filtro === "abiertos"
                ? "Todos los pedidos están entregados. Cuando entre uno nuevo suena y aparece acá solo."
                : "Pegá el link en el estado de WhatsApp y el QR en la puerta. Es el único módulo que te hace ganar plata en vez de ahorrarte tiempo."
            }
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {visibles.map((p) => (
              <li key={p.id}>
                <TarjetaPedido
                  pedido={p}
                  zona={nombreZona(p.zona_id)}
                  onPaso={correrPaso}
                  recienLlegado={recienLlegado === p.id}
                  compacta={!ESTADOS_ABIERTOS.includes(p.estado)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <Hoja abierta={qrAbierto} onCerrar={() => setQrAbierto(false)} titulo="QR para imprimir">
        <CodigoQR url={url} slug={slug} />
      </Hoja>
    </div>
  );
}

/**
 * QR generado LOCALMENTE.
 *
 * Nada de un servicio externo de imágenes: mandarle el link del comercio a un
 * tercero es una fuga innecesaria, y además dejaría de funcionar justo cuando
 * el kiosco se queda sin internet. La librería entra por import dinámico, así
 * que solo se descarga cuando alguien abre esta pantalla.
 */
function CodigoQR({ url, slug }: { url: string; slug: string }) {
  const destino = url || `/t/${slug}`;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    void (async () => {
      const QRCode = (await import("qrcode")).default;
      if (canvasRef.current) {
        await QRCode.toCanvas(canvasRef.current, destino, {
          width: 320,
          margin: 2,
          color: { dark: "#000000", light: "#ffffff" },
          errorCorrectionLevel: "M",
        });
      }
    })();
  }, [destino]);

  return (
    <div className="flex flex-col items-center gap-4 p-6 text-center">
      <div className="rounded-xl bg-white p-4">
        <canvas ref={canvasRef} aria-label={`Código QR de ${destino}`} className="max-w-full" />
      </div>

      <p className="break-all font-mono text-sm">{destino}</p>

      <p className="text-sm text-text-muted">
        Imprimilo y pegalo en la puerta y en el mostrador. También sirve en la caja de los pedidos a
        domicilio.
      </p>

      <Boton variante="primario" ancho="completo" onClick={() => window.print()}>
        Imprimir
      </Boton>
    </div>
  );
}
