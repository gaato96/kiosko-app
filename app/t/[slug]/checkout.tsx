"use client";

/**
 * El paso final del pedido.
 *
 * El pedido SE GUARDA EN LA BASE ANTES de abrir WhatsApp. Si el visitante no
 * manda el mensaje, el pedido existe igual y el dueño lo ve en su bandeja.
 *
 * Se pregunta cómo va a pagar: sin eso, el del mostrador no sabe si tiene que
 * preparar el vuelto o si el pedido ya está cobrado.
 */

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { formatearPesos } from "@/lib/money";
import { formatearPeso } from "@/lib/peso";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { enlaceWhatsApp, mensajePedidoVidriera } from "@/lib/wa";
import type { ProductoVidriera } from "@/lib/tipos";
import { cn } from "@/lib/utils";
import type { Comercio, Zona } from "./tienda";

/** Lo que un kiosco cobra de verdad en un pedido a domicilio. */
const MEDIOS = [
  { valor: "EFECTIVO", etiqueta: "Efectivo", detalle: "Pagás al recibir" },
  { valor: "TRANSFERENCIA", etiqueta: "Transferencia", detalle: "Te pasamos el alias" },
  { valor: "DEBITO", etiqueta: "Débito", detalle: "Posnet en la puerta" },
  { valor: "QR", etiqueta: "QR / billetera", detalle: "Mercado Pago y similares" },
] as const;

/** Billetes con los que la gente paga de verdad. */
const BILLETES = [200000, 500000, 1000000, 2000000] as const;

export function Checkout({
  comercio,
  lineas,
  subtotal,
  zonas,
  onVolver,
  onListo,
}: {
  comercio: Comercio;
  lineas: Array<{ producto: ProductoVidriera; cantidad: number; total: number }>;
  subtotal: number;
  zonas: Zona[];
  onVolver: () => void;
  onListo: (numero: number | null) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [direccion, setDireccion] = useState("");
  const [esEnvio, setEsEnvio] = useState(zonas.length > 0);
  const [zonaId, setZonaId] = useState(zonas[0]?.id ?? "");
  const [medio, setMedio] = useState<string>("EFECTIVO");
  const [pagaCon, setPagaCon] = useState<number | null>(null);
  const [notas, setNotas] = useState("");
  const [aceptaPromos, setAceptaPromos] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const zona = zonas.find((z) => z.id === zonaId);
  const costoEnvio = esEnvio ? (zona?.costo_centavos ?? 0) : 0;
  const total = subtotal + costoEnvio;
  const faltaMinimo = esEnvio && zona ? subtotal < zona.monto_minimo_centavos : false;
  const vuelto = medio === "EFECTIVO" && pagaCon ? Math.max(0, pagaCon - total) : 0;

  async function confirmar() {
    setEnviando(true);
    setError(null);

    // 1. El pedido se GUARDA primero. Esta es toda la diferencia con un wa.me suelto.
    const { data, error } = await supabaseBrowser().rpc("crear_pedido_vidriera", {
      payload: {
        slug: comercio.slug,
        nombre_cliente: nombre.trim(),
        telefono: telefono.trim(),
        direccion: esEnvio ? direccion.trim() : null,
        tipo_entrega: esEnvio ? "ENVIO" : "RETIRO",
        zona_id: esEnvio ? zonaId || null : null,
        notas: notas.trim() || null,
        acepta_promos: aceptaPromos,
        medio_pago: medio,
        paga_con_centavos: medio === "EFECTIVO" ? pagaCon : null,
        items: lineas.map((l) => ({ producto_id: l.producto.id, cantidad: l.cantidad })),
      },
    });

    setEnviando(false);

    if (error) {
      setError(
        error.message.includes("Demasiados")
          ? "Hiciste varios pedidos seguidos. Esperá unos minutos."
          : "No se pudo enviar el pedido. Probá de nuevo en un momento.",
      );
      return;
    }

    const resultado = data as {
      numero: number | null;
      total_centavos: number;
      costo_envio_centavos: number;
    };

    // 2. Recién ahora se abre WhatsApp.
    const texto = mensajePedidoVidriera({
      numero: resultado?.numero ?? null,
      nombreCliente: nombre.trim(),
      telefono: telefono.trim(),
      direccion: esEnvio ? direccion.trim() : null,
      esEnvio,
      lineas: lineas.map((l) => ({
        descripcion: l.producto.nombre,
        cantidad: l.cantidad,
        tipoVenta: l.producto.tipo_venta,
        totalCentavos: l.total,
      })),
      costoEnvioCentavos: resultado?.costo_envio_centavos ?? costoEnvio,
      totalCentavos: resultado?.total_centavos ?? total,
      notas: [
        notas.trim() || null,
        `Paga con: ${MEDIOS.find((m) => m.valor === medio)?.etiqueta ?? medio}`,
        medio === "EFECTIVO" && pagaCon ? `Abona con ${formatearPesos(pagaCon)}` : null,
      ]
        .filter(Boolean)
        .join(". "),
    });

    const url = enlaceWhatsApp(comercio.telefono, texto);
    if (url) window.open(url, "_blank", "noopener");

    onListo(resultado?.numero ?? null);
  }

  const listo =
    nombre.trim().length > 1 &&
    telefono.replace(/\D/g, "").length >= 8 &&
    (!esEnvio || direccion.trim().length > 3) &&
    !faltaMinimo;

  return (
    <main className="min-h-dvh bg-lienzo pb-28">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/92 px-4 py-3 backdrop-blur-lg">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <button
            onClick={onVolver}
            aria-label="Volver al carrito"
            className="presion flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-surface hover:border-border-fuerte"
          >
            <ArrowLeft size={19} />
          </button>
          <h1 className="font-display text-lg font-bold tracking-tight">Confirmar pedido</h1>
        </div>
      </header>

      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pt-5">
        <Bloque titulo="Tus datos">
          <Campo etiqueta="Nombre y apellido">
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              autoComplete="name"
              className={ENTRADA}
              required
            />
          </Campo>

          <Campo etiqueta="Teléfono" ayuda="Para avisarte cuando esté listo">
            <input
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              inputMode="tel"
              autoComplete="tel"
              placeholder="381 123 4567"
              className={ENTRADA}
              required
            />
          </Campo>
        </Bloque>

        <Bloque titulo="¿Cómo lo recibís?">
          <div className="grid grid-cols-2 gap-2.5">
            <Opcion activa={!esEnvio} onClick={() => setEsEnvio(false)} titulo="Retiro" detalle="Paso a buscarlo" />
            <Opcion
              activa={esEnvio}
              onClick={() => setEsEnvio(true)}
              titulo="Envío"
              detalle={zonas.length ? "A domicilio" : "No disponible"}
              deshabilitada={zonas.length === 0}
            />
          </div>

          {esEnvio ? (
            <>
              <Campo etiqueta="Dirección">
                <input
                  value={direccion}
                  onChange={(e) => setDireccion(e.target.value)}
                  autoComplete="street-address"
                  placeholder="Calle, número, piso"
                  className={ENTRADA}
                  required
                />
              </Campo>

              {zonas.length > 1 ? (
                <Campo etiqueta="Zona">
                  <select
                    value={zonaId}
                    onChange={(e) => setZonaId(e.target.value)}
                    className={cn(ENTRADA, "cursor-pointer")}
                  >
                    {zonas.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.nombre} — {formatearPesos(z.costo_centavos)}
                      </option>
                    ))}
                  </select>
                </Campo>
              ) : null}

              {faltaMinimo && zona ? (
                <p className="rounded-[var(--radio)] border border-warning/30 bg-warning-tenue px-3 py-2.5 text-sm font-medium text-warning">
                  Para {zona.nombre} el mínimo es {formatearPesos(zona.monto_minimo_centavos)}. Te
                  faltan {formatearPesos(zona.monto_minimo_centavos - subtotal)}.
                </p>
              ) : null}
            </>
          ) : null}
        </Bloque>

        <Bloque titulo="¿Cómo pagás?">
          <div className="grid grid-cols-2 gap-2.5">
            {MEDIOS.map((m) => (
              <Opcion
                key={m.valor}
                activa={medio === m.valor}
                onClick={() => {
                  setMedio(m.valor);
                  if (m.valor !== "EFECTIVO") setPagaCon(null);
                }}
                titulo={m.etiqueta}
                detalle={m.detalle}
              />
            ))}
          </div>

          {medio === "EFECTIVO" ? (
            <div>
              <p className="mb-2 text-sm text-text-muted">
                ¿Con cuánto abonás? Así te llevamos el vuelto justo.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setPagaCon(null)}
                  className={cn(CHIP, pagaCon === null ? CHIP_ON : CHIP_OFF)}
                >
                  Justo
                </button>
                {BILLETES.filter((b) => b >= total).map((b) => (
                  <button
                    key={b}
                    onClick={() => setPagaCon(b)}
                    className={cn(CHIP, "num", pagaCon === b ? CHIP_ON : CHIP_OFF)}
                  >
                    {formatearPesos(b)}
                  </button>
                ))}
              </div>
              {vuelto > 0 ? (
                <p className="num mt-2.5 text-sm font-semibold text-success">
                  Tu vuelto: {formatearPesos(vuelto)}
                </p>
              ) : null}
            </div>
          ) : null}
        </Bloque>

        <Bloque titulo="Algo más">
          <Campo etiqueta="Aclaraciones" ayuda="Opcional">
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={2}
              placeholder="Timbre roto, golpear la puerta…"
              className={cn(ENTRADA, "min-h-20 py-3")}
            />
          </Campo>

          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={aceptaPromos}
              onChange={(e) => setAceptaPromos(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-[var(--acento)]"
            />
            <span className="text-text-muted">
              Quiero enterarme de las promos del kiosco por WhatsApp.
            </span>
          </label>
        </Bloque>

        <section className="rounded-[var(--radio-lg)] border border-border bg-surface p-4 shadow-[var(--sombra-1)]">
          <ul className="mb-3 flex flex-col gap-1.5 text-sm">
            {lineas.map((l) => (
              <li key={l.producto.id} className="flex justify-between gap-3">
                <span className="min-w-0 truncate text-text-muted">
                  {l.producto.tipo_venta === "PESO"
                    ? formatearPeso(l.cantidad)
                    : `${l.cantidad}×`}{" "}
                  {l.producto.nombre}
                </span>
                <span className="num shrink-0">{formatearPesos(l.total)}</span>
              </li>
            ))}
          </ul>

          {costoEnvio > 0 ? (
            <div className="flex justify-between border-t border-dashed border-border pt-2 text-sm text-text-muted">
              <span>Envío</span>
              <span className="num">{formatearPesos(costoEnvio)}</span>
            </div>
          ) : null}

          <div className="mt-2 flex items-baseline justify-between border-t border-border pt-3">
            <span className="rotulo">Total</span>
            <span className="num text-3xl font-bold">{formatearPesos(total)}</span>
          </div>
        </section>

        {error ? (
          <p
            role="alert"
            className="rounded-[var(--radio)] border border-danger/30 bg-danger-tenue p-3 text-sm font-medium text-danger"
          >
            {error}
          </p>
        ) : null}
      </div>

      <div className="borde-seguro fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 px-3 pt-3 backdrop-blur-lg">
        <div className="mx-auto max-w-2xl">
          <button
            onClick={confirmar}
            disabled={!listo || enviando}
            className="presion min-h-14 w-full cursor-pointer rounded-full bg-acento font-bold text-white shadow-[var(--sombra-2)] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {enviando ? "Enviando…" : `Confirmar pedido · ${formatearPesos(total)}`}
          </button>
        </div>
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */

const ENTRADA =
  "min-h-13 w-full rounded-[var(--radio)] border border-border bg-surface px-4 text-base " +
  "shadow-[var(--sombra-1)] transition-[border-color,box-shadow] placeholder:text-text-sutil " +
  "focus:border-acento focus:outline-none focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--acento)_20%,transparent)]";

const CHIP = "presion min-h-11 cursor-pointer rounded-full border px-4 text-sm font-semibold";
const CHIP_ON = "border-acento bg-acento text-white";
const CHIP_OFF = "border-border bg-surface hover:border-border-fuerte";

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-bold tracking-tight">{titulo}</h2>
      {children}
    </section>
  );
}

function Campo({
  etiqueta,
  ayuda,
  children,
}: {
  etiqueta: string;
  ayuda?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold">{etiqueta}</span>
      {children}
      {ayuda ? <span className="text-xs text-text-muted">{ayuda}</span> : null}
    </label>
  );
}

function Opcion({
  activa,
  onClick,
  titulo,
  detalle,
  deshabilitada,
}: {
  activa: boolean;
  onClick: () => void;
  titulo: string;
  detalle: string;
  deshabilitada?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={deshabilitada}
      aria-pressed={activa}
      className={cn(
        "presion flex min-h-16 cursor-pointer flex-col justify-center rounded-[var(--radio)] border px-4 text-left",
        "disabled:cursor-not-allowed disabled:opacity-40",
        activa
          ? "border-acento bg-acento text-white shadow-[var(--sombra-2)]"
          : "border-border bg-surface hover:border-border-fuerte",
      )}
    >
      <span className="text-sm font-bold leading-tight">{titulo}</span>
      <span className={cn("text-xs", activa ? "text-white/75" : "text-text-muted")}>{detalle}</span>
    </button>
  );
}
