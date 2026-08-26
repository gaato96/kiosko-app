"use client";

/**
 * Alta y edición de un producto.
 *
 * Hasta ahora no existía: se podía importar el catálogo y cambiar precios, y
 * nada más. Un kiosco vende cosas que no están en ningún catálogo —el pan de
 * la panadería de al lado, el flete, la recarga, lo que fracciona él mismo— y
 * sin alta manual el sistema no le sirve.
 *
 * Dos decisiones de forma:
 *
 * · El margen se muestra MIENTRAS se escribe, no después de guardar. El error
 *   que arruina un kiosco es vender con margen negativo sin darse cuenta, y se
 *   evita mostrándolo en el momento en que se decide el precio, no en un
 *   reporte que se mira el mes que viene.
 *
 * · El stock inicial se manda como `stock_inicial` y el servidor lo asienta
 *   como movimiento CARGA_INICIAL. Regla de oro #3: el cliente nunca manda un
 *   stock absoluto.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Barcode, Trash2 } from "lucide-react";
import { Boton } from "@/components/ui/boton";
import { Campo, Input, Select, Textarea } from "@/components/ui/campo";
import { Hoja } from "@/components/ui/hoja";
import { formatearNumero, formatearPesos, margenPct, parsearPesos, precioPorMargen } from "@/lib/money";
import { formatearPeso, parsearPeso } from "@/lib/peso";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Categoria, Producto, TipoVenta } from "@/lib/tipos";
import { cn } from "@/lib/utils";

/** Los márgenes con los que trabaja un kiosco. Un toque en vez de una cuenta. */
const MARGENES = [25, 30, 35, 40, 50];

type Borrador = {
  nombre: string;
  categoriaId: string;
  codigoBarras: string;
  tipoVenta: TipoVenta;
  precio: string;
  costo: string;
  oferta: string;
  ofertaHasta: string;
  stockInicial: string;
  stockMinimo: string;
  controlaStock: boolean;
  visibleEnVidriera: boolean;
  descripcion: string;
};

function borradorDe(p: Producto | null, costo: number): Borrador {
  if (!p) {
    return {
      nombre: "",
      categoriaId: "",
      codigoBarras: "",
      tipoVenta: "UNIDAD",
      precio: "",
      costo: "",
      oferta: "",
      ofertaHasta: "",
      stockInicial: "",
      stockMinimo: "",
      controlaStock: true,
      visibleEnVidriera: true,
      descripcion: "",
    };
  }
  const esPeso = p.tipo_venta === "PESO";
  return {
    nombre: p.nombre,
    categoriaId: p.categoria_id ?? "",
    codigoBarras: p.codigo_barras ?? "",
    tipoVenta: p.tipo_venta,
    precio: formatearNumero((esPeso ? p.precio_por_kg_centavos : p.precio_venta_centavos) ?? 0),
    costo: costo > 0 ? formatearNumero(costo) : "",
    oferta: p.precio_oferta_centavos ? formatearNumero(p.precio_oferta_centavos) : "",
    // El <input type="date"> quiere AAAA-MM-DD y la base guarda un timestamptz.
    ofertaHasta: p.oferta_hasta ? p.oferta_hasta.slice(0, 10) : "",
    stockInicial: "",
    stockMinimo: esPeso ? formatearPeso(p.stock_minimo) : String(p.stock_minimo),
    controlaStock: p.controla_stock,
    visibleEnVidriera: p.visible_en_vidriera,
    descripcion: p.descripcion ?? "",
  };
}

export function EditorProducto({
  abierto,
  producto,
  costo,
  categorias,
  onCerrar,
}: {
  abierto: boolean;
  /** `null` es un alta. */
  producto: Producto | null;
  costo: number;
  categorias: Categoria[];
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [b, setB] = useState<Borrador>(() => borradorDe(producto, costo));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (abierto) {
      setB(borradorDe(producto, costo));
      setError(null);
    }
  }, [abierto, producto, costo]);

  const esPeso = b.tipoVenta === "PESO";
  const precioCentavos = parsearPesos(b.precio) ?? 0;
  const costoCentavos = parsearPesos(b.costo) ?? 0;
  const ofertaCentavos = parsearPesos(b.oferta) ?? 0;
  const margen = useMemo(
    () => (costoCentavos > 0 ? margenPct(precioCentavos, costoCentavos) : null),
    [precioCentavos, costoCentavos],
  );

  const set = <K extends keyof Borrador>(k: K, v: Borrador[K]) =>
    setB((prev) => ({ ...prev, [k]: v }));

  function aplicarMargen(pct: number) {
    if (costoCentavos <= 0) return;
    set("precio", formatearNumero(precioPorMargen(costoCentavos, pct)));
  }

  async function guardar() {
    setGuardando(true);
    setError(null);

    const cantidad = (texto: string) =>
      esPeso ? (parsearPeso(texto) ?? 0) : Math.max(0, Math.round(Number(texto) || 0));

    const payload: Record<string, unknown> = {
      nombre: b.nombre.trim(),
      categoria_id: b.categoriaId || null,
      codigo_barras: b.codigoBarras.trim() || null,
      descripcion: b.descripcion.trim() || null,
      tipo_venta: b.tipoVenta,
      precio_venta_centavos: esPeso ? null : precioCentavos,
      precio_por_kg_centavos: esPeso ? precioCentavos : null,
      precio_costo_centavos: costoCentavos,
      // La oferta solo tiene sentido por unidad: un precio fijo de oferta
      // sobre algo que se cobra por kilo no quiere decir nada.
      precio_oferta_centavos: !esPeso && ofertaCentavos > 0 ? ofertaCentavos : null,
      oferta_hasta: !esPeso && ofertaCentavos > 0 && b.ofertaHasta
        ? `${b.ofertaHasta}T23:59:59-03:00`
        : null,
      controla_stock: b.controlaStock,
      stock_minimo: b.controlaStock ? cantidad(b.stockMinimo) : 0,
      visible_en_vidriera: b.visibleEnVidriera,
    };

    if (producto) payload.id = producto.id;
    // Solo en el alta: después el stock se mueve por /stock, con su motivo.
    else if (b.controlaStock) payload.stock_inicial = cantidad(b.stockInicial);

    const { error: e } = await supabaseBrowser().rpc("guardar_producto", { payload });
    setGuardando(false);

    if (e) return setError(e.message);
    onCerrar();
    router.refresh();
  }

  async function archivar() {
    if (!producto) return;
    setGuardando(true);
    const { error: e } = await supabaseBrowser().rpc("archivar_producto", { p_id: producto.id });
    setGuardando(false);
    if (e) return setError(e.message);
    onCerrar();
    router.refresh();
  }

  return (
    <Hoja
      abierta={abierto}
      onCerrar={onCerrar}
      tamano="ancha"
      titulo={producto ? producto.nombre : "Nuevo producto"}
      descripcion={
        producto ? "Los cambios de precio quedan en el historial." : "Lo mínimo es nombre y precio."
      }
    >
      <div className="flex flex-col gap-5 p-5">
        <Campo etiqueta="Nombre" requerido>
          <Input
            value={b.nombre}
            onChange={(e) => set("nombre", e.target.value)}
            placeholder="Coca-Cola 1,5 L"
            autoFocus
          />
        </Campo>

        <div className="grid gap-5 sm:grid-cols-2">
          <Campo etiqueta="Categoría">
            <Select value={b.categoriaId} onChange={(e) => set("categoriaId", e.target.value)}>
              <option value="">Sin categoría</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji ? `${c.emoji} ` : ""}
                  {c.nombre}
                </option>
              ))}
            </Select>
          </Campo>

          <Campo etiqueta="Cómo se vende">
            <Select
              value={b.tipoVenta}
              onChange={(e) => set("tipoVenta", e.target.value as TipoVenta)}
            >
              <option value="UNIDAD">Por unidad</option>
              <option value="PESO">Por peso (balanza)</option>
            </Select>
          </Campo>
        </div>

        {/* Precio y costo juntos: la decisión es una sola. */}
        <fieldset className="tarjeta-alt/50 flex flex-col gap-4 rounded-[var(--radio-lg)] p-4">
          <legend className="rotulo px-1">Plata</legend>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              etiqueta={esPeso ? "Precio por kilo" : "Precio de venta"}
              requerido
              ayuda="Lo que paga el cliente."
            >
              <Input
                inputMode="decimal"
                value={b.precio}
                onChange={(e) => set("precio", e.target.value)}
                placeholder="0"
                className="num"
              />
            </Campo>

            <Campo
              etiqueta={esPeso ? "Costo por kilo" : "Costo"}
              ayuda="Lo que te sale a vos. Solo lo ves vos."
            >
              <Input
                inputMode="decimal"
                value={b.costo}
                onChange={(e) => set("costo", e.target.value)}
                placeholder="0"
                className="num"
              />
            </Campo>
          </div>

          {/* Los márgenes de un toque. Sacan la calculadora del medio. */}
          {costoCentavos > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-text-muted">Poner precio con margen:</span>
              {MARGENES.map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => aplicarMargen(pct)}
                  className="presion min-h-11 rounded-full border border-border bg-surface px-3.5 text-sm font-semibold hover:border-tinta"
                >
                  {pct}%
                </button>
              ))}
            </div>
          ) : null}

          <ResumenMargen margen={margen} precio={precioCentavos} costo={costoCentavos} />
        </fieldset>

        {/* La oferta se guarda como precio aparte y NO pisa el de lista: al
            vencer, el precio vuelve solo al que estaba. Vale igual en el
            mostrador y en la Vidriera, así que el cliente que la vio online
            paga lo mismo en la mano. */}
        {!esPeso ? (
          <fieldset className="flex flex-col gap-4">
            <legend className="rotulo mb-2">Oferta</legend>

            <div className="grid gap-4 sm:grid-cols-2">
              <Campo etiqueta="Precio de oferta" ayuda="Dejalo vacío si no está en promoción.">
                <Input
                  inputMode="decimal"
                  value={b.oferta}
                  onChange={(e) => set("oferta", e.target.value)}
                  placeholder="0"
                  className="num"
                />
              </Campo>

              <Campo etiqueta="Hasta" ayuda="Sin fecha, la oferta no vence.">
                <Input
                  type="date"
                  value={b.ofertaHasta}
                  onChange={(e) => set("ofertaHasta", e.target.value)}
                  disabled={ofertaCentavos <= 0}
                  className="num"
                />
              </Campo>
            </div>

            {ofertaCentavos > 0 && precioCentavos > 0 ? (
              ofertaCentavos >= precioCentavos ? (
                <p className="flex items-center gap-2 text-sm font-semibold text-warning">
                  <AlertTriangle size={15} aria-hidden />
                  La oferta tiene que ser menor que el precio de lista.
                </p>
              ) : (
                <p className="text-sm text-text-muted">
                  Se muestra{" "}
                  <span className="num font-semibold text-text">
                    {formatearPesos(ofertaCentavos)}
                  </span>{" "}
                  con{" "}
                  <span className="num line-through">{formatearPesos(precioCentavos)}</span> tachado
                  · {Math.round(((precioCentavos - ofertaCentavos) / precioCentavos) * 100)}% off
                  {costoCentavos > 0
                    ? ofertaCentavos > costoCentavos
                      ? ` · te siguen quedando ${formatearPesos(ofertaCentavos - costoCentavos)}`
                      : " · CUIDADO: la oferta queda abajo del costo"
                    : ""}
                </p>
              )
            ) : null}
          </fieldset>
        ) : null}

        <fieldset className="flex flex-col gap-4">
          <legend className="rotulo mb-2">Stock</legend>

          <Interruptor
            valor={b.controlaStock}
            onCambiar={(v) => set("controlaStock", v)}
            titulo="Llevar el stock de este producto"
            detalle="Apagalo para servicios, recargas o cosas que no se cuentan."
          />

          {b.controlaStock ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {!producto ? (
                <Campo
                  etiqueta={esPeso ? "Stock inicial (kg)" : "Stock inicial"}
                  ayuda="Lo que tenés ahora. Queda asentado como carga inicial."
                >
                  <Input
                    inputMode="decimal"
                    value={b.stockInicial}
                    onChange={(e) => set("stockInicial", e.target.value)}
                    placeholder="0"
                    className="num"
                  />
                </Campo>
              ) : null}

              <Campo
                etiqueta={esPeso ? "Mínimo (kg)" : "Mínimo"}
                ayuda="Debajo de esto aparece en “para reponer”."
              >
                <Input
                  inputMode="decimal"
                  value={b.stockMinimo}
                  onChange={(e) => set("stockMinimo", e.target.value)}
                  placeholder="0"
                  className="num"
                />
              </Campo>
            </div>
          ) : null}
        </fieldset>

        <fieldset className="flex flex-col gap-4">
          <legend className="rotulo mb-2">Ficha</legend>

          <Campo etiqueta="Código de barras" ayuda="Podés dispararlo con la pistola sobre el campo.">
            <div className="relative">
              <Barcode
                size={18}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-sutil"
                aria-hidden
              />
              <Input
                value={b.codigoBarras}
                onChange={(e) => set("codigoBarras", e.target.value)}
                placeholder="7790895003035"
                className="num pl-11"
                inputMode="numeric"
              />
            </div>
          </Campo>

          <Interruptor
            valor={b.visibleEnVidriera}
            onCambiar={(v) => set("visibleEnVidriera", v)}
            titulo="Mostrarlo en la Vidriera"
            detalle="Si lo apagás se sigue vendiendo en el mostrador, pero no online."
          />

          <Campo etiqueta="Descripción" ayuda="Solo se ve en la Vidriera. Opcional.">
            <Textarea
              value={b.descripcion}
              onChange={(e) => set("descripcion", e.target.value)}
              rows={2}
            />
          </Campo>
        </fieldset>

        {error ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-[var(--radio)] border border-danger/30 bg-danger-tenue p-3.5 text-sm font-medium text-danger"
          >
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
            {error}
          </p>
        ) : null}
      </div>

      {/* El pie se queda pegado abajo: en celular el formulario es largo y el
          botón de guardar no puede quedar a tres pantallas de scroll. */}
      <footer className="borde-seguro sticky bottom-0 flex gap-2 border-t border-border bg-surface/95 px-4 pt-4 backdrop-blur">
        {producto ? (
          <Boton variante="fantasma" tamano="chico" onClick={archivar} disabled={guardando}>
            <Trash2 size={16} /> Dar de baja
          </Boton>
        ) : null}
        <Boton
          variante="primario"
          ancho="completo"
          cargando={guardando}
          onClick={guardar}
          disabled={
            b.nombre.trim() === "" ||
            precioCentavos <= 0 ||
            (ofertaCentavos > 0 && ofertaCentavos >= precioCentavos)
          }
          className="flex-1"
        >
          {producto ? "Guardar cambios" : "Crear producto"}
        </Boton>
      </footer>
    </Hoja>
  );
}

/**
 * El margen, en el momento en que se decide el precio.
 *
 * Un margen negativo se avisa con la misma fuerza que un error de validación:
 * es plata que se pierde en cada venta y no se nota hasta fin de mes.
 */
function ResumenMargen({
  margen,
  precio,
  costo,
}: {
  margen: number | null;
  precio: number;
  costo: number;
}) {
  if (margen === null || precio <= 0) {
    return (
      <p className="text-sm text-text-muted">
        Cargá el costo y te muestro el margen y la ganancia por unidad.
      </p>
    );
  }

  const negativo = margen < 0;
  const flaco = margen >= 0 && margen < 15;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-[var(--radio)] border px-4 py-3",
        negativo
          ? "border-danger/40 bg-danger-tenue"
          : flaco
            ? "border-warning/40 bg-warning-tenue"
            : "border-border bg-surface",
      )}
    >
      <div>
        <p className="rotulo">Margen</p>
        <p
          className={cn(
            "num text-2xl font-bold leading-tight",
            negativo ? "text-danger" : flaco ? "text-warning" : "text-success",
          )}
        >
          {margen.toFixed(0)}%
        </p>
      </div>

      <div className="text-right">
        <p className="rotulo">Te queda</p>
        <p className="num text-lg font-semibold leading-tight">{formatearPesos(precio - costo)}</p>
      </div>

      {negativo ? (
        <p className="flex w-full items-center gap-2 text-sm font-semibold text-danger">
          <AlertTriangle size={15} aria-hidden />
          Estás vendiendo abajo del costo: perdés {formatearPesos(costo - precio)} en cada venta.
        </p>
      ) : flaco ? (
        <p className="w-full text-sm text-warning">
          Margen flaco. Con la inflación de un mes te quedás sin nada.
        </p>
      ) : null}
    </div>
  );
}

/** Interruptor táctil. La fila entera es el área de toque, no solo la perilla. */
function Interruptor({
  valor,
  onCambiar,
  titulo,
  detalle,
}: {
  valor: boolean;
  onCambiar: (v: boolean) => void;
  titulo: string;
  detalle: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={valor}
      onClick={() => onCambiar(!valor)}
      className="presion flex min-h-14 w-full items-center gap-3 rounded-[var(--radio)] border border-border bg-surface px-4 py-3 text-left hover:border-border-fuerte"
    >
      <span className="min-w-0 flex-1">
        <span className="block font-semibold leading-tight">{titulo}</span>
        <span className="block text-sm leading-snug text-text-muted">{detalle}</span>
      </span>
      <span
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full transition-colors",
          valor ? "bg-tinta" : "bg-border-fuerte",
        )}
        aria-hidden
      >
        <span
          className={cn(
            "absolute top-1 h-5 w-5 rounded-full bg-white shadow-[var(--sombra-1)] transition-[left]",
            valor ? "left-6" : "left-1",
          )}
        />
      </span>
    </button>
  );
}
