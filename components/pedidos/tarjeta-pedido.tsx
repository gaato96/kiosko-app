"use client";

/**
 * La tarjeta de un pedido de la Vidriera.
 *
 * Antes esto mostraba número, nombre y total, y nada más. Con eso no se puede
 * atender: no se sabe QUÉ pidió, ni A DÓNDE va, ni CUÁNTO hay que cobrarle
 * cuando lo entregás. Había que abrir otra pantalla para armar el paquete.
 *
 * Ahora lo que se necesita para preparar y entregar está entero acá.
 *
 * Se usa igual en el panel y en la bandeja, que tienen anchos muy distintos.
 * Por eso adapta con `@container` y no con breakpoints de ventana: lo que
 * decide si el pie de acciones entra en una fila es el ancho de LA TARJETA, no
 * el del celular.
 */

import { useState } from "react";
import {
  Bike,
  Check,
  ChevronDown,
  Loader2,
  MapPin,
  MessageCircle,
  Receipt,
  Store,
  Wallet,
} from "lucide-react";
import { Pildora } from "@/components/ui/pildora";
import { formatearPesos } from "@/lib/money";
import { cobroDe, ETIQUETA_ESTADO, lineaDeItem, pasosDe, type PasoPedido } from "@/lib/pedidos";
import { enlaceWhatsApp } from "@/lib/wa";
import type { EstadoPedido, PedidoConItems } from "@/lib/tipos";
import { cn, horaCorta } from "@/lib/utils";

export type AccionPedido = (pedido: PedidoConItems, paso: PasoPedido) => Promise<void>;

export function TarjetaPedido({
  pedido,
  zona,
  onPaso,
  recienLlegado,
  compacta,
}: {
  pedido: PedidoConItems;
  zona?: string | null;
  onPaso: AccionPedido;
  recienLlegado?: boolean;
  /** En el panel arranca plegada: son varios pedidos, uno abajo del otro. */
  compacta?: boolean;
}) {
  const [abierta, setAbierta] = useState(!compacta);
  const [trabajando, setTrabajando] = useState<string | null>(null);

  const etiqueta = ETIQUETA_ESTADO[pedido.estado];
  const cobro = cobroDe(pedido);
  const pasos = pasosDe(pedido);
  const unidades = pedido.items.length;

  async function correr(paso: PasoPedido) {
    setTrabajando(paso.estado);
    try {
      await onPaso(pedido, paso);
    } finally {
      setTrabajando(null);
    }
  }

  return (
    <article
      className={cn(
        "@container overflow-hidden rounded-[var(--radio-lg)] border bg-surface transition-colors",
        pedido.estado === "NUEVO" ? "border-plata/45 shadow-[var(--sombra-2)]" : "border-border",
        recienLlegado && "animate-[latido_1.4s_ease-in-out_2] border-plata bg-plata-tenue",
      )}
    >
      {/* Cabecera. Siempre visible, incluso plegada: es lo que se mira de reojo. */}
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
        className="presion flex w-full items-start gap-3 p-4 text-left hover:bg-surface-alt/60"
      >
        <span
          className={cn(
            "num flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radio-sm)] text-sm font-bold",
            pedido.estado === "NUEVO" ? "bg-plata text-plata-fg" : "bg-surface-alt text-text-muted",
          )}
          aria-hidden
        >
          #{pedido.numero ?? "—"}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate font-semibold">{pedido.nombre_cliente}</span>
            <Pildora tono={etiqueta.tono}>{etiqueta.texto}</Pildora>
            {pedido.venta_id ? (
              <Pildora tono="neutral" title="Ya bajó del stock y quedó registrado como venta">
                <Check size={12} aria-hidden /> Stock descontado
              </Pildora>
            ) : null}
          </span>

          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-text-muted">
            <span className="inline-flex items-center gap-1.5">
              {pedido.tipo_entrega === "ENVIO" ? (
                <Bike size={14} aria-hidden />
              ) : (
                <Store size={14} aria-hidden />
              )}
              {pedido.tipo_entrega === "ENVIO" ? "Envío" : "Retira"}
            </span>
            <span aria-hidden>·</span>
            <span className="num">{horaCorta(pedido.creado_en)}</span>
            <span aria-hidden>·</span>
            <span>
              {unidades} {unidades === 1 ? "producto" : "productos"}
            </span>
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-2">
          <span className="num text-lg font-bold @[26rem]:text-xl">
            {formatearPesos(pedido.total_centavos)}
          </span>
          <ChevronDown
            size={18}
            className={cn("text-text-sutil transition-transform", abierta && "rotate-180")}
            aria-hidden
          />
        </span>
      </button>

      {abierta ? (
        <div className="border-t border-border">
          {/* Qué pidió. Esta es la lista con la que se arma la bolsa. */}
          <section className="px-4 py-3">
            <h4 className="rotulo mb-2 flex items-center gap-1.5">
              <Receipt size={13} aria-hidden /> Qué pidió
            </h4>
            {pedido.items.length === 0 ? (
              <p className="text-sm text-text-muted">
                Este pedido entró sin detalle. Llamalo antes de prepararlo.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {pedido.items.map((i) => (
                  <li key={i.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="num mr-2 font-bold text-text">
                        {lineaDeItem(i).split(" · ")[0]}
                      </span>
                      <span className="break-words">{i.descripcion}</span>
                    </span>
                    <span className="num shrink-0 text-text-muted">
                      {formatearPesos(i.total_centavos)}
                    </span>
                  </li>
                ))}
                {pedido.costo_envio_centavos > 0 ? (
                  <li className="flex items-baseline justify-between gap-3 py-2 text-sm text-text-muted">
                    <span>Envío{zona ? ` · ${zona}` : ""}</span>
                    <span className="num">{formatearPesos(pedido.costo_envio_centavos)}</span>
                  </li>
                ) : null}
              </ul>
            )}
          </section>

          {/* A dónde va y cómo se cobra: las dos cosas que se miran al salir. */}
          <div className="grid gap-px bg-border @[30rem]:grid-cols-2">
            <Dato
              icono={pedido.tipo_entrega === "ENVIO" ? MapPin : Store}
              rotulo={pedido.tipo_entrega === "ENVIO" ? "A dónde va" : "Retira en el local"}
            >
              {pedido.tipo_entrega === "ENVIO" ? (
                <>
                  <p className="font-semibold text-text">
                    {pedido.direccion || "Sin dirección — llamalo antes de salir"}
                  </p>
                  {zona ? <p className="text-text-muted">Zona {zona}</p> : null}
                </>
              ) : (
                <p className="text-text-muted">El cliente lo pasa a buscar.</p>
              )}
            </Dato>

            <Dato icono={Wallet} rotulo={cobro.titulo}>
              <p className="num font-semibold text-text">
                {formatearPesos(pedido.total_centavos)}
                <span className="ml-1.5 text-sm font-normal text-text-muted">{cobro.medio}</span>
              </p>
              {cobro.vuelto !== null ? (
                <p className="num text-text-muted">
                  Abona con {formatearPesos(pedido.paga_con_centavos ?? 0)} ·{" "}
                  <strong className="font-semibold text-text">
                    vuelto {formatearPesos(cobro.vuelto)}
                  </strong>
                </p>
              ) : null}
              {cobro.falta !== null ? (
                <p className="num text-warning">
                  Dijo que abona con {formatearPesos(pedido.paga_con_centavos ?? 0)}: le faltan{" "}
                  {formatearPesos(cobro.falta)}.
                </p>
              ) : null}
            </Dato>
          </div>

          {pedido.notas ? (
            <p className="border-t border-border px-4 py-3 text-sm">
              <span className="rotulo mr-2">Nota</span>
              <span className="italic text-text-muted">“{pedido.notas}”</span>
            </p>
          ) : null}

          {/* Pie de acciones. En columna cuando la tarjeta es angosta: cuatro
              botones apretados en una fila son cuatro errores de dedo. */}
          <footer className="flex flex-col gap-2 border-t border-border bg-surface-alt/40 p-3 @[30rem]:flex-row @[30rem]:flex-wrap @[30rem]:items-center">
            {pasos.map((paso) => (
              <button
                key={paso.estado}
                type="button"
                disabled={trabajando !== null}
                onClick={() => void correr(paso)}
                title={paso.ayuda}
                className={cn(
                  "presion flex min-h-12 items-center justify-center gap-2 rounded-[var(--radio)] px-4 text-sm font-bold disabled:opacity-40",
                  paso.tono === "plata" &&
                    "flex-1 bg-[linear-gradient(180deg,var(--plata-viva),var(--plata))] text-plata-fg shadow-[var(--sombra-2)] @[30rem]:flex-none",
                  paso.tono === "primario" && "bg-tinta text-brand-fg shadow-[var(--sombra-1)]",
                  paso.tono === "secundario" &&
                    "border border-border bg-surface text-text hover:border-border-fuerte",
                  paso.tono === "peligro" &&
                    "text-danger hover:bg-danger-tenue @[30rem]:ml-auto",
                )}
              >
                {trabajando === paso.estado ? (
                  <Loader2 size={16} className="animate-spin" aria-hidden />
                ) : null}
                {paso.texto}
              </button>
            ))}

            <a
              href={enlaceWhatsApp(pedido.telefono, "") ?? "#"}
              target="_blank"
              rel="noopener"
              className={cn(
                "presion flex min-h-12 items-center justify-center gap-2 rounded-[var(--radio)] px-4 text-sm font-semibold text-text-muted hover:bg-surface hover:text-text",
                pasos.length === 0 && "flex-1",
              )}
            >
              <MessageCircle size={16} aria-hidden />
              <span className="num">{pedido.telefono}</span>
            </a>
          </footer>
        </div>
      ) : null}
    </article>
  );
}

function Dato({
  icono: Icono,
  rotulo,
  children,
}: {
  icono: typeof MapPin;
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface px-4 py-3 text-sm">
      <h4 className="rotulo mb-1 flex items-center gap-1.5">
        <Icono size={13} aria-hidden /> {rotulo}
      </h4>
      {children}
    </div>
  );
}

/** Los estados que un botón del panel puede pedir. */
export type EstadoPedible = EstadoPedido | "CONVERTIR";
