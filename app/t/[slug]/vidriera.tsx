"use client";

/**
 * El changuito y el checkout de la Vidriera.
 *
 * CLAVE DEL MÓDULO: el pedido SE GUARDA EN LA BASE ANTES de abrir WhatsApp.
 * Un wa.me suelto se pierde entre 40 chats, no descuenta stock, no deja
 * histórico y no se puede medir.
 *
 * Tratamiento visual propio: sigue el tema del dispositivo del visitante,
 * tarjetas más grandes y tipografía un punto más grande que en el POS. La lee
 * alguien de cualquier edad, apurado, en la calle.
 */

import { useEffect, useMemo, useState } from "react";
import { Check, MapPin, Minus, Plus, ShoppingCart, Store, X } from "lucide-react";
import { Ilustracion } from "@/components/ui/ilustracion";
import { formatearPesos } from "@/lib/money";
import { formatearPeso, importeDesdeGramos } from "@/lib/peso";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { enlaceWhatsApp, mensajePedidoVidriera } from "@/lib/wa";
import type { ProductoVidriera } from "@/lib/tipos";
import { cn } from "@/lib/utils";

type Comercio = {
  id: string;
  nombre: string;
  slug: string;
  telefono: string | null;
  direccion: string | null;
  logoUrl: string | null;
};

type Zona = { id: string; nombre: string; costo_centavos: number; monto_minimo_centavos: number };

/** Línea del changuito. En PESO la cantidad son gramos. */
type LineaChanguito = { productoId: string; cantidad: number };

const CLAVE_CHANGUITO = "kiosko:changuito";

export function Vidriera({
  comercio,
  titulo,
  mensaje,
  horarios,
  productos,
  categorias,
  zonas,
}: {
  comercio: Comercio;
  titulo: string;
  mensaje: string | null;
  horarios: Record<string, [string, string]> | null;
  productos: ProductoVidriera[];
  categorias: Array<{ id: string; nombre: string; emoji: string | null; color: string }>;
  zonas: Zona[];
}) {
  const [changuito, setChanguito] = useState<LineaChanguito[]>([]);
  const [categoriaId, setCategoriaId] = useState<string | null>(null);
  const [vista, setVista] = useState<"catalogo" | "changuito" | "checkout" | "listo">("catalogo");
  const [numeroPedido, setNumeroPedido] = useState<number | null>(null);

  // El changuito sobrevive a que el visitante cierre la pestaña para consultar algo.
  useEffect(() => {
    const guardado = localStorage.getItem(`${CLAVE_CHANGUITO}:${comercio.slug}`);
    if (guardado) {
      try {
        setChanguito(JSON.parse(guardado) as LineaChanguito[]);
      } catch {
        // Un changuito corrupto no puede romper la página.
      }
    }
  }, [comercio.slug]);

  useEffect(() => {
    localStorage.setItem(`${CLAVE_CHANGUITO}:${comercio.slug}`, JSON.stringify(changuito));
  }, [changuito, comercio.slug]);

  const porId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);

  // El nombre de la categoria es el respaldo del dibujo cuando el nombre del
  // producto no alcanza para deducir de que se trata.
  const nombreCategoria = useMemo(() => {
    const mapa = new Map(categorias.map((c) => [c.id, c.nombre]));
    return (id: string | null) => (id ? (mapa.get(id) ?? null) : null);
  }, [categorias]);

  const lineas = changuito
    .map((l) => {
      const p = porId.get(l.productoId);
      if (!p) return null;
      const total =
        p.tipo_venta === "PESO"
          ? importeDesdeGramos(l.cantidad, p.precio_por_kg_centavos ?? 0)
          : (p.precio_venta_centavos ?? 0) * l.cantidad;
      return { producto: p, cantidad: l.cantidad, total };
    })
    .filter((x): x is { producto: ProductoVidriera; cantidad: number; total: number } => x !== null);

  const subtotal = lineas.reduce((a, l) => a + l.total, 0);
  const cantidadTotal = lineas.length;

  const visibles = categoriaId ? productos.filter((p) => p.categoria_id === categoriaId) : productos;

  const abierto = estaAbierto(horarios);

  function sumar(p: ProductoVidriera, paso = 1) {
    const incremento = p.tipo_venta === "PESO" ? 100 : paso;
    setChanguito((prev) => {
      const i = prev.findIndex((l) => l.productoId === p.id);
      if (i < 0) return [...prev, { productoId: p.id, cantidad: incremento }];
      const copia = [...prev];
      copia[i] = { ...copia[i]!, cantidad: copia[i]!.cantidad + incremento };
      return copia;
    });
  }

  function restar(p: ProductoVidriera) {
    const decremento = p.tipo_venta === "PESO" ? 100 : 1;
    setChanguito((prev) =>
      prev
        .map((l) => (l.productoId === p.id ? { ...l, cantidad: l.cantidad - decremento } : l))
        .filter((l) => l.cantidad > 0),
    );
  }

  if (vista === "listo") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 p-6 text-center">
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-success-tenue ring-4 ring-success/20">
          <Check size={40} strokeWidth={3} className="text-success" aria-hidden />
        </span>
        <h1 className="font-display text-2xl font-bold tracking-tight">Pedido enviado</h1>
        {numeroPedido ? (
          <p className="num text-lg text-text-muted">Pedido #{numeroPedido}</p>
        ) : null}
        <p className="text-text-muted">
          {comercio.nombre} ya lo tiene. Si no se abrió WhatsApp, no pasa nada: el pedido quedó
          registrado igual.
        </p>
        <button
          onClick={() => {
            setChanguito([]);
            setVista("catalogo");
          }}
          className="presion mt-2 min-h-14 cursor-pointer rounded-[var(--radio)] bg-acento px-7 font-semibold text-white shadow-[var(--sombra-2)] hover:brightness-110"
        >
          Hacer otro pedido
        </button>
      </main>
    );
  }

  if (vista === "checkout") {
    return (
      <Checkout
        comercio={comercio}
        lineas={lineas}
        subtotal={subtotal}
        zonas={zonas}
        onVolver={() => setVista("changuito")}
        onListo={(numero) => {
          setNumeroPedido(numero);
          setVista("listo");
        }}
      />
    );
  }

  return (
    <div className="min-h-dvh bg-bg pb-24 text-text">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur-lg">
        <div className="mx-auto flex max-w-3xl items-center gap-3.5 p-4">
          {comercio.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={comercio.logoUrl}
              alt=""
              className="h-14 w-14 rounded-[var(--radio)] object-cover shadow-[var(--sombra-1)]"
            />
          ) : (
            <span className="flex h-14 w-14 items-center justify-center rounded-[var(--radio)] bg-acento text-white shadow-[var(--sombra-2)]">
              <Store size={26} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-xl font-bold tracking-tight">{titulo}</h1>
            <p
              className={cn(
                "inline-flex items-center gap-1.5 text-sm font-semibold",
                abierto ? "text-success" : "text-text-muted",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "h-2 w-2 rounded-full",
                  abierto ? "animate-[latir_1.6s_ease-in-out_infinite] bg-success" : "bg-text-sutil",
                )}
              />
              {abierto === null ? comercio.direccion : abierto ? "Abierto ahora" : "Cerrado ahora"}
            </p>
          </div>
        </div>
        {mensaje ? (
          <p className="mx-auto max-w-3xl px-4 pb-4 text-sm text-text-muted">{mensaje}</p>
        ) : null}
      </header>

      {vista === "changuito" ? (
        <main className="mx-auto max-w-3xl p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-xl font-bold tracking-tight">Tu changuito</h2>
            <button
              onClick={() => setVista("catalogo")}
              className="flex min-h-11 items-center gap-1 px-3 text-sm text-acento"
            >
              Seguir comprando
            </button>
          </div>

          {lineas.length === 0 ? (
            <p className="rounded-[var(--radio-lg)] border border-dashed border-border p-10 text-center text-text-muted">
              Todavía no agregaste nada.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {lineas.map((l) => (
                <li
                  key={l.producto.id}
                  className="flex items-center gap-3 rounded-[var(--radio)] border border-border bg-surface p-3 shadow-[var(--sombra-1)]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{l.producto.nombre}</span>
                    <span className="num block text-sm text-text-muted">
                      {l.producto.tipo_venta === "PESO"
                        ? formatearPeso(l.cantidad)
                        : `${l.cantidad} u`}
                    </span>
                  </span>
                  <button
                    onClick={() => restar(l.producto)}
                    aria-label={`Sacar ${l.producto.nombre}`}
                    className="flex h-12 w-12 items-center justify-center rounded-lg bg-surface-alt"
                  >
                    <Minus size={18} />
                  </button>
                  <button
                    onClick={() => sumar(l.producto)}
                    aria-label={`Agregar ${l.producto.nombre}`}
                    className="flex h-12 w-12 items-center justify-center rounded-lg bg-surface-alt"
                  >
                    <Plus size={18} />
                  </button>
                  <span className="num w-24 text-right font-semibold">{formatearPesos(l.total)}</span>
                  <button
                    onClick={() => setChanguito((prev) => prev.filter((x) => x.productoId !== l.producto.id))}
                    aria-label={`Quitar ${l.producto.nombre}`}
                    className="flex h-12 w-10 items-center justify-center text-text-muted"
                  >
                    <X size={18} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </main>
      ) : (
        <main className="mx-auto max-w-3xl p-4">
          {categorias.length > 0 ? (
            <div className="mb-4 flex gap-2 overflow-x-auto sin-scrollbar">
              <Chip activo={categoriaId === null} onClick={() => setCategoriaId(null)}>
                Todo
              </Chip>
              {categorias.map((c) => (
                <Chip key={c.id} activo={categoriaId === c.id} onClick={() => setCategoriaId(c.id)}>
                  {c.emoji ? `${c.emoji} ` : ""}
                  {c.nombre}
                </Chip>
              ))}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3">
            {visibles.map((p) => {
              const enChanguito = changuito.find((l) => l.productoId === p.id);
              const precio =
                p.tipo_venta === "PESO" ? p.precio_por_kg_centavos : p.precio_venta_centavos;

              return (
                <article
                  key={p.id}
                  className={cn(
                    "group flex flex-col gap-2 overflow-hidden rounded-[var(--radio-lg)] border border-border bg-surface p-3",
                    "shadow-[var(--sombra-1)] transition-shadow duration-200 hover:shadow-[var(--sombra-2)]",
                    !p.disponible && "opacity-60 saturate-50",
                  )}
                >
                  <span
                    className="flex h-32 items-center justify-center overflow-hidden rounded-[var(--radio)]"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${p.color ?? "#94a3b8"} 14%, var(--superficie))`,
                    }}
                  >
                    {p.imagen_url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- archivo estatico local
                      <img
                        src={p.imagen_url}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.06]"
                      />
                    ) : (
                      <Ilustracion
                        nombre={p.nombre}
                        categoria={nombreCategoria(p.categoria_id)}
                        tipoVenta={p.tipo_venta}
                        color={p.color ?? "#5a6478"}
                        className="h-[62%] w-[62%] transition-transform duration-300 ease-out group-hover:scale-[1.08]"
                      />
                    )}
                  </span>

                  <h3 className="text-base font-semibold leading-snug">{p.nombre}</h3>

                  <p className="num text-xl font-bold">
                    {formatearPesos(precio ?? 0)}
                    {p.tipo_venta === "PESO" ? (
                      <span className="text-sm font-normal text-text-muted"> /kg</span>
                    ) : null}
                  </p>

                  {!p.disponible ? (
                    <p className="text-sm text-text-muted">Sin stock</p>
                  ) : enChanguito ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => restar(p)}
                        aria-label={`Sacar ${p.nombre}`}
                        className="presion flex h-12 flex-1 cursor-pointer items-center justify-center rounded-[var(--radio-sm)] border border-border bg-surface-alt hover:border-border-fuerte"
                      >
                        <Minus size={18} />
                      </button>
                      <span className="num min-w-12 text-center font-semibold">
                        {p.tipo_venta === "PESO"
                          ? formatearPeso(enChanguito.cantidad)
                          : enChanguito.cantidad}
                      </span>
                      <button
                        onClick={() => sumar(p)}
                        aria-label={`Agregar ${p.nombre}`}
                        className="presion flex h-12 flex-1 cursor-pointer items-center justify-center rounded-[var(--radio-sm)] border border-border bg-surface-alt hover:border-border-fuerte"
                      >
                        <Plus size={18} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => sumar(p)}
                      className="presion flex min-h-12 cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radio)] bg-acento font-semibold text-white shadow-[var(--sombra-1)] hover:brightness-110"
                    >
                      <Plus size={18} /> Agregar
                    </button>
                  )}
                </article>
              );
            })}
          </div>

          {visibles.length === 0 ? (
            <p className="p-8 text-center text-text-muted">No hay productos en esta categoría.</p>
          ) : null}
        </main>
      )}

      {cantidadTotal > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/92 p-3 shadow-[0_-8px_28px_-12px_rgb(0_0_0/0.28)] backdrop-blur-lg animate-[subir_0.28s_cubic-bezier(0.16,1,0.3,1)]">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <ShoppingCart size={22} className="shrink-0 text-acento" />
            <span className="num flex-1 text-sm">
              {cantidadTotal} {cantidadTotal === 1 ? "producto" : "productos"} ·{" "}
              <span className="font-bold">{formatearPesos(subtotal)}</span>
            </span>
            <button
              onClick={() => setVista(vista === "changuito" ? "checkout" : "changuito")}
              className="presion min-h-14 shrink-0 cursor-pointer rounded-[var(--radio)] bg-acento px-7 font-bold text-white shadow-[var(--sombra-2)] hover:brightness-110"
            >
              {vista === "changuito" ? "Hacer el pedido" : "Ver changuito"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Checkout({
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
  const [notas, setNotas] = useState("");
  const [aceptaPromos, setAceptaPromos] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const zona = zonas.find((z) => z.id === zonaId);
  const costoEnvio = esEnvio ? (zona?.costo_centavos ?? 0) : 0;
  const total = subtotal + costoEnvio;
  const faltaMinimo = esEnvio && zona ? subtotal < zona.monto_minimo_centavos : false;

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

    const resultado = data as { numero: number | null; total_centavos: number; costo_envio_centavos: number };

    // 2. Recién ahora se abre WhatsApp. Si el visitante no lo manda, el pedido
    //    ya existe igual y el dueño lo ve en su bandeja.
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
      notas: notas.trim() || null,
    });

    const url = enlaceWhatsApp(comercio.telefono, texto);
    if (url) window.open(url, "_blank", "noopener");

    onListo(resultado?.numero ?? null);
  }

  const listo = nombre.trim().length > 1 && telefono.replace(/\D/g, "").length >= 8 && (!esEnvio || direccion.trim().length > 3) && !faltaMinimo;

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-4 bg-bg p-4 text-text">
      <button onClick={onVolver} className="self-start text-sm text-acento">
        ← Volver al changuito
      </button>

      <h1 className="font-display text-2xl font-bold tracking-tight">Tus datos</h1>

      <label className="flex flex-col gap-1.5">
        <span className="font-medium">Nombre</span>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="min-h-14 rounded-[var(--radio)] border border-border bg-surface px-4 text-base shadow-[var(--sombra-1)] transition-[border-color,box-shadow] focus:border-acento focus:outline-none focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--acento)_22%,transparent)]"
          autoComplete="name"
          required
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="font-medium">Teléfono</span>
        <input
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          inputMode="tel"
          autoComplete="tel"
          placeholder="11 2233 4455"
          className="min-h-14 rounded-[var(--radio)] border border-border bg-surface px-4 text-base shadow-[var(--sombra-1)] transition-[border-color,box-shadow] focus:border-acento focus:outline-none focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--acento)_22%,transparent)]"
          required
        />
      </label>

      <div className="flex gap-2">
        <button
          onClick={() => setEsEnvio(false)}
          className={cn(
            "flex min-h-14 flex-1 items-center justify-center gap-2 rounded-xl border font-semibold",
            !esEnvio ? "border-acento bg-acento text-white" : "border-border bg-surface",
          )}
        >
          <Store size={18} /> Retiro
        </button>
        <button
          onClick={() => setEsEnvio(true)}
          disabled={zonas.length === 0}
          className={cn(
            "flex min-h-14 flex-1 items-center justify-center gap-2 rounded-xl border font-semibold disabled:opacity-40",
            esEnvio ? "border-acento bg-acento text-white" : "border-border bg-surface",
          )}
        >
          <MapPin size={18} /> Envío
        </button>
      </div>

      {esEnvio ? (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="font-medium">Dirección</span>
            <input
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              autoComplete="street-address"
              className="min-h-14 rounded-[var(--radio)] border border-border bg-surface px-4 text-base shadow-[var(--sombra-1)] transition-[border-color,box-shadow] focus:border-acento focus:outline-none focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--acento)_22%,transparent)]"
              required
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="font-medium">Zona</span>
            <select
              value={zonaId}
              onChange={(e) => setZonaId(e.target.value)}
              className="min-h-14 rounded-xl border border-border bg-surface px-3 text-base"
            >
              {zonas.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.nombre} — {formatearPesos(z.costo_centavos)}
                </option>
              ))}
            </select>
          </label>

          {faltaMinimo && zona ? (
            <p className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
              Para envíos a {zona.nombre} el pedido mínimo es{" "}
              {formatearPesos(zona.monto_minimo_centavos)}. Te faltan{" "}
              {formatearPesos(zona.monto_minimo_centavos - subtotal)}.
            </p>
          ) : null}
        </>
      ) : null}

      <label className="flex flex-col gap-1.5">
        <span className="font-medium">Alguna aclaración</span>
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={2}
          placeholder="Timbre 3B, dejar en portería…"
          className="rounded-xl border border-border bg-surface p-3 text-base"
        />
      </label>

      {/* Consentimiento explícito: sin esto, mandar promos después es spam. */}
      <label className="flex items-start gap-3 text-sm text-text-muted">
        <input
          type="checkbox"
          checked={aceptaPromos}
          onChange={(e) => setAceptaPromos(e.target.checked)}
          className="mt-1 h-5 w-5 accent-[var(--acento)]"
        />
        Quiero recibir las promos del kiosco por WhatsApp.
      </label>

      <div className="rounded-xl border border-border bg-surface p-3">
        <div className="flex justify-between text-sm">
          <span>Productos</span>
          <span className="num">{formatearPesos(subtotal)}</span>
        </div>
        {costoEnvio > 0 ? (
          <div className="flex justify-between text-sm">
            <span>Envío</span>
            <span className="num">{formatearPesos(costoEnvio)}</span>
          </div>
        ) : null}
        <div className="mt-2 flex items-baseline justify-between border-t border-border pt-2">
          <span className="font-semibold">Total</span>
          <span className="num text-2xl font-bold">{formatearPesos(total)}</span>
        </div>
      </div>

      {error ? <p className="text-danger">{error}</p> : null}

      <button
        onClick={confirmar}
        disabled={!listo || enviando}
        className="min-h-16 rounded-xl bg-acento text-lg font-bold text-white disabled:opacity-40"
      >
        {enviando ? "Enviando…" : "Confirmar pedido"}
      </button>

      <p className="text-center text-sm text-text-muted">
        Se envía por WhatsApp a {comercio.nombre}. El pago se arregla al recibirlo.
      </p>
    </main>
  );
}

function Chip({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "min-h-12 shrink-0 rounded-full border px-5 text-base font-medium",
        activo ? "border-acento bg-acento text-white" : "border-border bg-surface",
      )}
    >
      {children}
    </button>
  );
}

/** null = el comercio no configuró horarios. */
function estaAbierto(horarios: Record<string, [string, string]> | null): boolean | null {
  if (!horarios) return null;
  const dias = ["dom", "lun", "mar", "mie", "jue", "vie", "sab"];
  const ahora = new Date();
  const franja = horarios[dias[ahora.getDay()]!];
  if (!franja) return false;

  const minutos = ahora.getHours() * 60 + ahora.getMinutes();
  const [desde, hasta] = franja.map((h) => {
    const [hh, mm] = h.split(":").map(Number);
    return (hh ?? 0) * 60 + (mm ?? 0);
  });
  return minutos >= (desde ?? 0) && minutos <= (hasta ?? 1440);
}
