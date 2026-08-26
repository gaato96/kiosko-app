"use client";

/**
 * La bandeja de pedidos.
 *
 * Con realtime y badge: el dueño no depende de mirar WhatsApp entre cuarenta
 * chats. Con un toque el pedido se convierte en venta y DESCUENTA STOCK, que es
 * exactamente lo que un wa.me suelto no hace.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, Copy, ExternalLink, MapPin, QrCode, Store, X } from "lucide-react";
import { Boton } from "@/components/ui/boton";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { Hoja } from "@/components/ui/hoja";
import { formatearPesos } from "@/lib/money";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { EstadoPedido, PedidoVidriera, ZonaEnvio } from "@/lib/tipos";
import { cn, horaCorta } from "@/lib/utils";

const ETIQUETA_ESTADO: Record<EstadoPedido, { texto: string; clase: string }> = {
  NUEVO: { texto: "Nuevo", clase: "bg-primary text-primary-fg" },
  ACEPTADO: { texto: "Aceptado", clase: "bg-info/20 text-info" },
  PREPARANDO: { texto: "Preparando", clase: "bg-warning/20 text-warning" },
  ENTREGADO: { texto: "Entregado", clase: "bg-success/20 text-success" },
  RECHAZADO: { texto: "Rechazado", clase: "bg-danger/20 text-danger" },
};

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
  pedidos: PedidoVidriera[];
  zonas: ZonaEnvio[];
}) {
  const router = useRouter();
  const [pedidos, setPedidos] = useState(iniciales);
  const [qrAbierto, setQrAbierto] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const nuevos = pedidos.filter((p) => p.estado === "NUEVO").length;

  // Realtime: el pedido aparece solo, sin recargar.
  useEffect(() => {
    const sb = supabaseBrowser();
    const canal = sb
      .channel(`pedidos:${comercioId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedidos_vidriera", filter: `comercio_id=eq.${comercioId}` },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      void sb.removeChannel(canal);
    };
  }, [comercioId, router]);

  useEffect(() => setPedidos(iniciales), [iniciales]);

  async function convertir(pedido: PedidoVidriera) {
    const { error } = await supabaseBrowser().rpc("convertir_pedido_en_venta", {
      p_pedido_id: pedido.id,
    });
    if (error) return setAviso(`No se pudo convertir: ${error.message}`);
    setAviso(`Pedido #${pedido.numero} convertido en venta. El stock ya bajó.`);
    router.refresh();
  }

  async function cambiarEstado(pedido: PedidoVidriera, estado: EstadoPedido) {
    const { error } = await supabaseBrowser()
      .from("pedidos_vidriera")
      .update({ estado })
      .eq("id", pedido.id);
    if (error) return setAviso(error.message);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-wrap items-center gap-3 tarjeta p-5">
        <div className="min-w-56 flex-1">
          <p className="text-xs uppercase tracking-wide text-text-muted">Tu link público</p>
          <p className="truncate font-mono text-sm">{url || `/t/${slug}`}</p>
          {!activa ? (
            <p className="mt-1 text-sm text-warning">
              La vidriera está apagada. Prendela en Configuración para que el link funcione.
            </p>
          ) : null}
        </div>
        <Boton
          onClick={() => {
            void navigator.clipboard.writeText(url);
            setAviso("Link copiado. Pegalo en el estado de WhatsApp.");
          }}
        >
          <Copy size={18} /> Copiar
        </Boton>
        <Boton onClick={() => setQrAbierto(true)}>
          <QrCode size={18} /> QR para imprimir
        </Boton>
        <a href={url || `/t/${slug}`} target="_blank" rel="noopener">
          <Boton variante="fantasma">
            <ExternalLink size={18} /> Ver
          </Boton>
        </a>
      </section>

      {aviso ? (
        <p className="tarjeta p-4">{aviso}</p>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Bell size={20} /> Pedidos
          {nuevos > 0 ? (
            <span className="num rounded-full bg-primary px-2 py-0.5 text-sm text-primary-fg">
              {nuevos} nuevos
            </span>
          ) : null}
        </h2>

        {pedidos.length === 0 ? (
          <EstadoVacio
            icono={Store}
            titulo="Todavía no entró ningún pedido"
            detalle="Pegá el link en el estado de WhatsApp y pegá el QR en la puerta. Es el único módulo que te hace ganar plata en vez de ahorrarte tiempo."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {pedidos.map((p) => {
              const zona = zonas.find((z) => z.id === p.zona_id);
              const etiqueta = ETIQUETA_ESTADO[p.estado];

              return (
                <li
                  key={p.id}
                  className={cn(
                    "rounded-[var(--radio)] border bg-surface p-4",
                    p.estado === "NUEVO" ? "border-primary" : "border-border",
                  )}
                >
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-48 flex-1">
                      <p className="flex items-center gap-2 font-semibold">
                        <span className="num">#{p.numero ?? "—"}</span> {p.nombre_cliente}
                        <span className={cn("rounded px-2 py-0.5 text-xs font-medium", etiqueta.clase)}>
                          {etiqueta.texto}
                        </span>
                      </p>
                      <p className="num text-sm text-text-muted">
                        {horaCorta(p.creado_en)} · {p.telefono}
                      </p>
                      <p className="mt-1 flex items-center gap-1 text-sm">
                        {p.tipo_entrega === "ENVIO" ? (
                          <>
                            <MapPin size={14} /> {p.direccion}
                            {zona ? ` · ${zona.nombre}` : ""}
                          </>
                        ) : (
                          <>
                            <Store size={14} /> Retira en el local
                          </>
                        )}
                      </p>
                      {p.notas ? <p className="mt-1 text-sm text-text-muted">“{p.notas}”</p> : null}
                    </div>

                    <div className="text-right">
                      <p className="num text-2xl font-bold">{formatearPesos(p.total_centavos)}</p>
                      {p.costo_envio_centavos > 0 ? (
                        <p className="num text-xs text-text-muted">
                          incluye {formatearPesos(p.costo_envio_centavos)} de envío
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {p.venta_id ? (
                      <span className="flex items-center gap-1 text-sm text-success">
                        <Check size={16} /> Ya es una venta
                      </span>
                    ) : (
                      <>
                        <Boton tamano="chico" variante="primario" onClick={() => convertir(p)}>
                          <Check size={16} /> Aceptar y descontar stock
                        </Boton>
                        <Boton tamano="chico" onClick={() => cambiarEstado(p, "PREPARANDO")}>
                          Preparando
                        </Boton>
                        <Boton tamano="chico" onClick={() => cambiarEstado(p, "ENTREGADO")}>
                          Entregado
                        </Boton>
                        <Boton
                          tamano="chico"
                          variante="fantasma"
                          onClick={() => cambiarEstado(p, "RECHAZADO")}
                        >
                          <X size={16} /> Rechazar
                        </Boton>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
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
        <canvas ref={canvasRef} aria-label={`Código QR de ${destino}`} />
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
