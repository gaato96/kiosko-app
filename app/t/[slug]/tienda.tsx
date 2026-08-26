"use client";

/**
 * La Vidriera: la tienda pública del kiosco.
 *
 * CLAVE DEL MÓDULO: el pedido SE GUARDA EN LA BASE ANTES de abrir WhatsApp.
 * Un wa.me suelto se pierde entre 40 chats, no descuenta stock, no deja
 * histórico y no se puede medir.
 *
 * Se lee como una tienda, no como un sistema de gestión: la ve alguien de
 * cualquier edad, apurado, en la calle, con una mano. Por eso el orden es
 * OFERTAS → MÁS PEDIDOS → categorías, y no un listado alfabético: en un kiosco
 * la compra es por impulso, y lo que no está a la vista no se vende.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Minus, Plus, Search, ShoppingCart, Trash2, X } from "lucide-react";
import { formatearPesos } from "@/lib/money";
import { formatearPeso, importeDesdeGramos } from "@/lib/peso";
import type { ProductoVidriera } from "@/lib/tipos";
import { cn } from "@/lib/utils";
import { Checkout } from "./checkout";

export type Comercio = {
  id: string;
  nombre: string;
  slug: string;
  telefono: string | null;
  direccion: string | null;
  logoUrl: string | null;
};

export type Zona = {
  id: string;
  nombre: string;
  costo_centavos: number;
  monto_minimo_centavos: number;
};

export type Categoria = { id: string; nombre: string; emoji: string | null; color: string };

/** Línea del carrito. En PESO la cantidad son gramos. */
type Linea = { productoId: string; cantidad: number };

const CLAVE_CARRITO = "kiosko:carrito";

/** Cuánto pesa por defecto una porción de fiambrería, en gramos. */
const PORCION_G = 250;

export function Tienda({
  comercio,
  titulo,
  mensaje,
  horarios,
  productos,
  categorias,
  zonas,
  masVendidos,
}: {
  comercio: Comercio;
  titulo: string;
  mensaje: string | null;
  horarios: Record<string, [string, string]> | null;
  productos: ProductoVidriera[];
  categorias: Categoria[];
  zonas: Zona[];
  masVendidos: string[];
}) {
  const [carrito, setCarrito] = useState<Linea[]>([]);
  const [consulta, setConsulta] = useState("");
  const [categoriaId, setCategoriaId] = useState<string | null>(null);
  const [vista, setVista] = useState<"tienda" | "carrito" | "checkout" | "listo">("tienda");
  const [numeroPedido, setNumeroPedido] = useState<number | null>(null);
  const [sugerido, setSugerido] = useState<ProductoVidriera | null>(null);
  const buscadorRef = useRef<HTMLInputElement>(null);

  // El carrito sobrevive a que el visitante cierre la pestaña para consultar algo.
  useEffect(() => {
    const guardado = localStorage.getItem(`${CLAVE_CARRITO}:${comercio.slug}`);
    if (!guardado) return;
    try {
      setCarrito(JSON.parse(guardado) as Linea[]);
    } catch {
      // Un carrito corrupto no puede romper la página.
    }
  }, [comercio.slug]);

  useEffect(() => {
    localStorage.setItem(`${CLAVE_CARRITO}:${comercio.slug}`, JSON.stringify(carrito));
  }, [carrito, comercio.slug]);

  const porId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);
  const nombreCategoria = useMemo(() => {
    const m = new Map(categorias.map((c) => [c.id, c.nombre]));
    return (id: string | null) => (id ? (m.get(id) ?? null) : null);
  }, [categorias]);

  const precioDe = useCallback(
    (p: ProductoVidriera) =>
      p.tipo_venta === "PESO"
        ? (p.precio_por_kg_centavos ?? 0)
        : (p.precio_vigente_centavos ?? p.precio_venta_centavos ?? 0),
    [],
  );

  const lineas = useMemo(
    () =>
      carrito
        .map((l) => {
          const producto = porId.get(l.productoId);
          if (!producto) return null;
          const total =
            producto.tipo_venta === "PESO"
              ? importeDesdeGramos(l.cantidad, producto.precio_por_kg_centavos ?? 0)
              : (producto.precio_vigente_centavos ?? producto.precio_venta_centavos ?? 0) *
                l.cantidad;
          return { producto, cantidad: l.cantidad, total };
        })
        .filter((l): l is { producto: ProductoVidriera; cantidad: number; total: number } =>
          Boolean(l),
        ),
    [carrito, porId],
  );

  const subtotal = lineas.reduce((a, l) => a + l.total, 0);
  const unidades = lineas.length;

  const agregar = useCallback(
    (p: ProductoVidriera) => {
      const paso = p.tipo_venta === "PESO" ? PORCION_G : 1;
      setCarrito((antes) => {
        const i = antes.findIndex((l) => l.productoId === p.id);
        if (i === -1) return [...antes, { productoId: p.id, cantidad: paso }];
        const copia = [...antes];
        copia[i] = { ...copia[i]!, cantidad: copia[i]!.cantidad + paso };
        return copia;
      });
      setSugerido(p);
    },
    [],
  );

  const cambiar = useCallback((id: string, delta: number, tipoVenta: string) => {
    const paso = tipoVenta === "PESO" ? PORCION_G : 1;
    setCarrito((antes) =>
      antes
        .map((l) => (l.productoId === id ? { ...l, cantidad: l.cantidad + delta * paso } : l))
        .filter((l) => l.cantidad > 0),
    );
  }, []);

  const quitar = useCallback((id: string) => {
    setCarrito((antes) => antes.filter((l) => l.productoId !== id));
  }, []);

  const cantidadDe = useCallback(
    (id: string) => carrito.find((l) => l.productoId === id)?.cantidad ?? 0,
    [carrito],
  );

  // ---------------------------------------------------------------- Secciones
  const enOferta = useMemo(() => productos.filter((p) => p.en_oferta && p.disponible), [productos]);

  const populares = useMemo(() => {
    const orden = new Map(masVendidos.map((id, i) => [id, i]));
    return productos
      .filter((p) => orden.has(p.id) && p.disponible)
      .sort((a, b) => (orden.get(a.id) ?? 99) - (orden.get(b.id) ?? 99))
      .slice(0, 8);
  }, [productos, masVendidos]);

  /**
   * Venta cruzada: al agregar algo, se ofrece lo que suele acompañarlo.
   * Sin historial de compras conjuntas se usa la señal que sí existe: misma
   * categoría cuando la hay, y lo más pedido del local cuando no.
   */
  const relacionados = useMemo(() => {
    if (!sugerido) return [];
    const enCarrito = new Set(carrito.map((l) => l.productoId));

    const misma = productos.filter(
      (p) =>
        p.id !== sugerido.id &&
        p.disponible &&
        !enCarrito.has(p.id) &&
        p.categoria_id === sugerido.categoria_id,
    );

    const resto = populares.filter((p) => p.id !== sugerido.id && !enCarrito.has(p.id));
    return [...misma, ...resto].slice(0, 6);
  }, [sugerido, productos, carrito, populares]);

  const busqueda = consulta.trim().toLowerCase();

  const visibles = useMemo(() => {
    let lista = productos;
    if (busqueda) {
      lista = lista.filter((p) => p.nombre.toLowerCase().includes(busqueda));
    } else if (categoriaId) {
      lista = lista.filter((p) => p.categoria_id === categoriaId);
    }
    return lista;
  }, [productos, busqueda, categoriaId]);

  const abierto = estaAbierto(horarios);

  // ------------------------------------------------------------------ Pantallas
  if (vista === "listo") {
    return (
      <PedidoEnviado
        numero={numeroPedido}
        telefono={comercio.telefono}
        onVolver={() => {
          setCarrito([]);
          setVista("tienda");
        }}
      />
    );
  }

  if (vista === "checkout") {
    return (
      <Checkout
        comercio={comercio}
        lineas={lineas}
        subtotal={subtotal}
        zonas={zonas}
        onVolver={() => setVista("carrito")}
        onListo={(numero) => {
          setNumeroPedido(numero);
          setVista("listo");
        }}
      />
    );
  }

  return (
    <div className="min-h-dvh bg-lienzo pb-28 text-text">
      <Encabezado
        comercio={comercio}
        titulo={titulo}
        mensaje={mensaje}
        abierto={abierto}
        unidades={unidades}
        onVerCarrito={() => setVista("carrito")}
      />

      {vista === "carrito" ? (
        <Carrito
          lineas={lineas}
          subtotal={subtotal}
          onCambiar={cambiar}
          onQuitar={quitar}
          onSeguir={() => setVista("tienda")}
        />
      ) : (
        <main className="mx-auto max-w-5xl px-4 pt-4">
          <Buscador
            ref={buscadorRef}
            valor={consulta}
            onCambio={(v) => {
              setConsulta(v);
              if (v) setCategoriaId(null);
            }}
          />

          {busqueda ? (
            <Seccion titulo={`Resultados para "${consulta}"`}>
              {visibles.length === 0 ? (
                <SinResultados
                  consulta={consulta}
                  onLimpiar={() => {
                    setConsulta("");
                    buscadorRef.current?.focus();
                  }}
                />
              ) : (
                <Grilla>
                  {visibles.map((p) => (
                    <TarjetaProducto
                      key={p.id}
                      producto={p}
                      categoria={nombreCategoria(p.categoria_id)}
                      cantidad={cantidadDe(p.id)}
                      precio={precioDe(p)}
                      onAgregar={agregar}
                      onCambiar={cambiar}
                    />
                  ))}
                </Grilla>
              )}
            </Seccion>
          ) : (
            <>
              {enOferta.length > 0 && !categoriaId ? (
                <Seccion titulo="Ofertas de hoy" detalle="Mientras dure el stock">
                  <Grilla>
                    {enOferta.map((p) => (
                      <TarjetaProducto
                        key={p.id}
                        producto={p}
                        categoria={nombreCategoria(p.categoria_id)}
                        cantidad={cantidadDe(p.id)}
                        precio={precioDe(p)}
                        onAgregar={agregar}
                        onCambiar={cambiar}
                      />
                    ))}
                  </Grilla>
                </Seccion>
              ) : null}

              {populares.length > 0 && !categoriaId ? (
                <Seccion titulo="Los más pedidos" detalle="Lo que más sale del local">
                  <Grilla>
                    {populares.map((p) => (
                      <TarjetaProducto
                        key={p.id}
                        producto={p}
                        categoria={nombreCategoria(p.categoria_id)}
                        cantidad={cantidadDe(p.id)}
                        precio={precioDe(p)}
                        onAgregar={agregar}
                        onCambiar={cambiar}
                      />
                    ))}
                  </Grilla>
                </Seccion>
              ) : null}

              <Categorias
                categorias={categorias}
                activa={categoriaId}
                onElegir={setCategoriaId}
                conteo={(id) => productos.filter((p) => p.categoria_id === id).length}
              />

              <Seccion
                titulo={
                  categoriaId
                    ? (categorias.find((c) => c.id === categoriaId)?.nombre ?? "Productos")
                    : "Todo el catálogo"
                }
                detalle={`${visibles.length} ${visibles.length === 1 ? "producto" : "productos"}`}
              >
                <Grilla>
                  {visibles.map((p) => (
                    <TarjetaProducto
                      key={p.id}
                      producto={p}
                      categoria={nombreCategoria(p.categoria_id)}
                      cantidad={cantidadDe(p.id)}
                      precio={precioDe(p)}
                      onAgregar={agregar}
                      onCambiar={cambiar}
                    />
                  ))}
                </Grilla>
              </Seccion>
            </>
          )}
        </main>
      )}

      {/* Venta cruzada: aparece al agregar algo y se va sola. No es un modal:
          no corta la navegación ni obliga a cerrarlo para seguir comprando. */}
      {sugerido && relacionados.length > 0 && vista === "tienda" ? (
        <Relacionados
          base={sugerido}
          productos={relacionados}
          precioDe={precioDe}
          onAgregar={agregar}
          onCerrar={() => setSugerido(null)}
        />
      ) : null}

      {unidades > 0 ? (
        <BarraCarrito
          unidades={unidades}
          subtotal={subtotal}
          enCarrito={vista === "carrito"}
          onAccion={() => setVista(vista === "carrito" ? "checkout" : "carrito")}
        />
      ) : null}
    </div>
  );
}

/* ========================================================================== */

function Encabezado({
  comercio,
  titulo,
  mensaje,
  abierto,
  unidades,
  onVerCarrito,
}: {
  comercio: Comercio;
  titulo: string;
  mensaje: string | null;
  abierto: boolean;
  unidades: number;
  onVerCarrito: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/92 backdrop-blur-lg">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
        {comercio.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- logo del comercio, URL externa
          <img
            src={comercio.logoUrl}
            alt=""
            className="h-11 w-11 shrink-0 rounded-[var(--radio-sm)] object-cover"
          />
        ) : (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radio-sm)] bg-acento text-lg font-bold text-white">
            {titulo.charAt(0).toUpperCase()}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-lg font-bold leading-tight">{titulo}</h1>
          <p
            className={cn(
              "flex items-center gap-1.5 text-sm font-semibold",
              abierto ? "text-success" : "text-text-muted",
            )}
          >
            <span
              aria-hidden
              className={cn("h-2 w-2 rounded-full", abierto ? "bg-success" : "bg-text-sutil")}
            />
            {abierto ? "Abierto ahora" : "Cerrado"}
            {comercio.direccion ? (
              <span className="truncate font-normal text-text-muted">· {comercio.direccion}</span>
            ) : null}
          </p>
        </div>

        <button
          onClick={onVerCarrito}
          className="presion relative flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-surface hover:border-border-fuerte"
          aria-label={`Ver carrito, ${unidades} productos`}
        >
          <ShoppingCart size={20} aria-hidden />
          {unidades > 0 ? (
            <span className="num absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-acento px-1 text-[0.6875rem] font-bold text-white">
              {unidades}
            </span>
          ) : null}
        </button>
      </div>

      {mensaje ? (
        <p className="mx-auto max-w-5xl px-4 pb-3 text-sm text-text-muted">{mensaje}</p>
      ) : null}
    </header>
  );
}

const Buscador = function Buscador({
  ref,
  valor,
  onCambio,
}: {
  ref?: React.Ref<HTMLInputElement>;
  valor: string;
  onCambio: (v: string) => void;
}) {
  return (
    <div className="relative">
      <Search
        size={18}
        aria-hidden
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-sutil"
      />
      <input
        ref={ref}
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        type="search"
        placeholder="Buscar en el kiosco…"
        aria-label="Buscar productos"
        className="min-h-13 w-full rounded-full border border-border bg-surface pl-11 pr-11 text-base shadow-[var(--sombra-1)] transition-[border-color,box-shadow] placeholder:text-text-sutil focus:border-acento focus:outline-none focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--acento)_20%,transparent)]"
      />
      {valor ? (
        <button
          onClick={() => onCambio("")}
          aria-label="Borrar la búsqueda"
          className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-text-sutil hover:bg-surface-alt hover:text-text"
        >
          <X size={17} />
        </button>
      ) : null}
    </div>
  );
};

function Seccion({
  titulo,
  detalle,
  children,
}: {
  titulo: string;
  detalle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-7">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-xl font-bold tracking-tight">{titulo}</h2>
        {detalle ? <p className="shrink-0 text-sm text-text-muted">{detalle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Grilla({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(9.5rem,1fr))] sm:gap-4 sm:[grid-template-columns:repeat(auto-fill,minmax(11rem,1fr))]">
      {children}
    </div>
  );
}

function Categorias({
  categorias,
  activa,
  onElegir,
  conteo,
}: {
  categorias: Categoria[];
  activa: string | null;
  onElegir: (id: string | null) => void;
  conteo: (id: string) => number;
}) {
  if (categorias.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="mb-3 font-display text-xl font-bold tracking-tight">Categorías</h2>
      {/* Grilla, no tira horizontal: en una tira, la mitad de las categorías
          quedan fuera de pantalla y nadie scrollea de costado para descubrirlas. */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        <BotonCategoria activa={activa === null} nombre="Todo" onClick={() => onElegir(null)} />
        {categorias.map((c) => (
          <BotonCategoria
            key={c.id}
            activa={activa === c.id}
            nombre={c.nombre}
            color={c.color}
            cuenta={conteo(c.id)}
            onClick={() => onElegir(activa === c.id ? null : c.id)}
          />
        ))}
      </div>
    </section>
  );
}

function BotonCategoria({
  activa,
  nombre,
  color,
  cuenta,
  onClick,
}: {
  activa: boolean;
  nombre: string;
  color?: string;
  cuenta?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={activa}
      className={cn(
        "presion flex min-h-14 cursor-pointer items-center gap-2.5 rounded-[var(--radio)] border px-3.5 text-left",
        activa
          ? "border-acento bg-acento text-white shadow-[var(--sombra-2)]"
          : "border-border bg-surface hover:border-border-fuerte",
      )}
    >
      {color ? (
        <span
          aria-hidden
          className="h-7 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: activa ? "rgb(255 255 255 / 0.7)" : color }}
        />
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold leading-tight">{nombre}</span>
        {cuenta !== undefined ? (
          <span
            className={cn(
              "num block text-xs",
              activa ? "text-white/75" : "text-text-sutil",
            )}
          >
            {cuenta}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function TarjetaProducto({
  producto,
  categoria,
  cantidad,
  precio,
  onAgregar,
  onCambiar,
}: {
  producto: ProductoVidriera;
  categoria: string | null;
  cantidad: number;
  precio: number;
  onAgregar: (p: ProductoVidriera) => void;
  onCambiar: (id: string, delta: number, tipoVenta: string) => void;
}) {
  const esPeso = producto.tipo_venta === "PESO";
  const tinte = producto.color ?? "#5a6478";

  return (
    <article
      className={cn(
        "group flex flex-col overflow-hidden rounded-[var(--radio-lg)] border border-border bg-surface",
        "shadow-[var(--sombra-1)] transition-shadow duration-200 hover:shadow-[var(--sombra-2)]",
        !producto.disponible && "opacity-60",
      )}
    >
      <div
        className="relative aspect-square overflow-hidden"
        style={{ backgroundColor: `color-mix(in srgb, ${tinte} 10%, var(--superficie))` }}
      >
        {producto.imagen_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- archivo estático local
          <img
            src={producto.imagen_url}
            alt={producto.nombre}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-105"
          />
        ) : (
          <IlustracionTienda nombre={producto.nombre} categoria={categoria} color={tinte} />
        )}

        {producto.en_oferta ? (
          <span className="absolute left-2 top-2 rounded-full bg-acento px-2.5 py-1 text-[0.6875rem] font-bold uppercase tracking-wide text-white shadow-[var(--sombra-1)]">
            Oferta
          </span>
        ) : null}

        {!producto.disponible ? (
          <span className="absolute inset-x-0 bottom-0 bg-tinta/85 py-1 text-center text-xs font-semibold text-white">
            Sin stock
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <h3 className="line-clamp-2 min-h-[2.4rem] text-sm font-semibold leading-snug">
          {producto.nombre}
        </h3>

        <div className="mt-auto">
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="num text-lg font-bold">{formatearPesos(precio)}</span>
            {esPeso ? <span className="text-xs text-text-sutil">por kilo</span> : null}
            {producto.en_oferta && producto.precio_venta_centavos ? (
              <span className="num text-sm text-text-sutil line-through">
                {formatearPesos(producto.precio_venta_centavos)}
              </span>
            ) : null}
          </p>

          {esPeso ? (
            <p className="num text-xs text-text-muted">
              {formatearPeso(PORCION_G)} ={" "}
              {formatearPesos(importeDesdeGramos(PORCION_G, producto.precio_por_kg_centavos ?? 0))}
            </p>
          ) : null}
        </div>

        {!producto.disponible ? (
          <p className="text-sm text-text-muted">No disponible</p>
        ) : cantidad > 0 ? (
          <div className="flex items-center gap-1 rounded-full border border-border bg-surface-alt p-1">
            <button
              onClick={() => onCambiar(producto.id, -1, producto.tipo_venta)}
              aria-label={`Sacar ${producto.nombre}`}
              className="presion flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-surface text-text hover:text-acento"
            >
              <Minus size={16} />
            </button>
            <span className="num flex-1 text-center text-sm font-bold">
              {esPeso ? formatearPeso(cantidad) : cantidad}
            </span>
            <button
              onClick={() => onCambiar(producto.id, 1, producto.tipo_venta)}
              aria-label={`Sumar ${producto.nombre}`}
              className="presion flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-surface text-text hover:text-acento"
            >
              <Plus size={16} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => onAgregar(producto)}
            className="presion flex min-h-12 w-full cursor-pointer items-center justify-center gap-1.5 rounded-full bg-acento text-sm font-bold text-white shadow-[var(--sombra-1)] hover:brightness-110"
          >
            Agregar
          </button>
        )}
      </div>
    </article>
  );
}

/** Respaldo cuando el producto no tiene foto todavía. */
function IlustracionTienda({
  nombre,
  categoria,
  color,
}: {
  nombre: string;
  categoria: string | null;
  color: string;
}) {
  return (
    <span className="flex h-full w-full flex-col items-center justify-center gap-1 px-2 text-center">
      <span
        className="font-display text-3xl font-bold leading-none"
        style={{ color }}
        aria-hidden
      >
        {nombre.charAt(0).toUpperCase()}
      </span>
      {categoria ? <span className="text-[0.625rem] text-text-sutil">{categoria}</span> : null}
    </span>
  );
}

function SinResultados({ consulta, onLimpiar }: { consulta: string; onLimpiar: () => void }) {
  return (
    <div className="rounded-[var(--radio-lg)] border border-dashed border-border px-6 py-12 text-center">
      <p className="font-display text-lg font-semibold">No encontramos “{consulta}”</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-text-muted">
        Puede estar con otro nombre. Probá con una palabra más corta, o mirá las categorías.
      </p>
      <button
        onClick={onLimpiar}
        className="presion mt-5 min-h-12 cursor-pointer rounded-full bg-acento px-6 font-semibold text-white"
      >
        Ver todo el catálogo
      </button>
    </div>
  );
}

function Relacionados({
  base,
  productos,
  precioDe,
  onAgregar,
  onCerrar,
}: {
  base: ProductoVidriera;
  productos: ProductoVidriera[];
  precioDe: (p: ProductoVidriera) => number;
  onAgregar: (p: ProductoVidriera) => void;
  onCerrar: () => void;
}) {
  return (
    <aside className="fixed inset-x-0 bottom-20 z-30 animate-[subir_0.28s_cubic-bezier(0.16,1,0.3,1)]">
      <div className="mx-auto max-w-5xl px-4">
        <div className="rounded-[var(--radio-lg)] border border-border bg-surface p-3 shadow-[var(--sombra-3)]">
          <div className="mb-2.5 flex items-center justify-between gap-2 px-1">
            <p className="truncate text-sm font-semibold">
              Agregaste {base.nombre}. ¿Va con algo más?
            </p>
            <button
              onClick={onCerrar}
              aria-label="Cerrar sugerencias"
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-text-sutil hover:bg-surface-alt hover:text-text"
            >
              <X size={16} />
            </button>
          </div>

          <ul className="flex gap-2 overflow-x-auto pb-1 sin-scrollbar">
            {productos.map((p) => (
              <li key={p.id} className="shrink-0">
                <button
                  onClick={() => onAgregar(p)}
                  className="presion flex w-36 cursor-pointer flex-col items-start gap-1 rounded-[var(--radio)] border border-border bg-surface-alt p-2 text-left hover:border-acento"
                >
                  <span className="line-clamp-2 min-h-[2.1rem] text-xs font-semibold leading-tight">
                    {p.nombre}
                  </span>
                  <span className="num text-sm font-bold text-acento">
                    + {formatearPesos(precioDe(p))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </aside>
  );
}

function Carrito({
  lineas,
  subtotal,
  onCambiar,
  onQuitar,
  onSeguir,
}: {
  lineas: Array<{ producto: ProductoVidriera; cantidad: number; total: number }>;
  subtotal: number;
  onCambiar: (id: string, delta: number, tipoVenta: string) => void;
  onQuitar: (id: string) => void;
  onSeguir: () => void;
}) {
  return (
    <main className="mx-auto max-w-3xl px-4 pt-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-bold tracking-tight">Tu carrito</h2>
        <button
          onClick={onSeguir}
          className="presion min-h-11 cursor-pointer rounded-full px-4 text-sm font-semibold text-acento hover:bg-surface-alt"
        >
          Seguir comprando
        </button>
      </div>

      {lineas.length === 0 ? (
        <p className="rounded-[var(--radio-lg)] border border-dashed border-border px-6 py-12 text-center text-text-muted">
          Todavía no agregaste nada.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {lineas.map((l) => {
            const esPeso = l.producto.tipo_venta === "PESO";
            return (
              <li
                key={l.producto.id}
                className="flex items-center gap-3 rounded-[var(--radio-lg)] border border-border bg-surface p-3 shadow-[var(--sombra-1)]"
              >
                {l.producto.imagen_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- archivo estático local
                  <img
                    src={l.producto.imagen_url}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-[var(--radio-sm)] object-cover"
                  />
                ) : null}

                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold leading-tight">{l.producto.nombre}</p>
                  <p className="num text-sm text-text-muted">
                    {esPeso ? formatearPeso(l.cantidad) : `${l.cantidad} u`} ·{" "}
                    {formatearPesos(l.total)}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1 rounded-full border border-border p-1">
                  <button
                    onClick={() => onCambiar(l.producto.id, -1, l.producto.tipo_venta)}
                    aria-label={`Sacar ${l.producto.nombre}`}
                    className="presion flex h-10 w-10 cursor-pointer items-center justify-center rounded-full hover:bg-surface-alt"
                  >
                    <Minus size={15} />
                  </button>
                  <button
                    onClick={() => onCambiar(l.producto.id, 1, l.producto.tipo_venta)}
                    aria-label={`Sumar ${l.producto.nombre}`}
                    className="presion flex h-10 w-10 cursor-pointer items-center justify-center rounded-full hover:bg-surface-alt"
                  >
                    <Plus size={15} />
                  </button>
                </div>

                <button
                  onClick={() => onQuitar(l.producto.id)}
                  aria-label={`Quitar ${l.producto.nombre}`}
                  className="presion flex h-10 w-9 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radio-sm)] text-text-sutil hover:bg-danger-tenue hover:text-danger"
                >
                  <Trash2 size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {lineas.length > 0 ? (
        <div className="mt-5 flex items-baseline justify-between border-t border-dashed border-border pt-4">
          <span className="rotulo">Subtotal</span>
          <span className="num text-2xl font-bold">{formatearPesos(subtotal)}</span>
        </div>
      ) : null}
    </main>
  );
}

function BarraCarrito({
  unidades,
  subtotal,
  enCarrito,
  onAccion,
}: {
  unidades: number;
  subtotal: number;
  enCarrito: boolean;
  onAccion: () => void;
}) {
  return (
    <div className="borde-seguro fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 px-3 pt-3 shadow-[0_-8px_28px_-12px_rgb(19_26_38/0.25)] backdrop-blur-lg">
      <div className="mx-auto flex max-w-5xl items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-text-muted">
            {unidades} {unidades === 1 ? "producto" : "productos"}
          </p>
          <p className="num text-xl font-bold leading-none">{formatearPesos(subtotal)}</p>
        </div>
        <button
          onClick={onAccion}
          className="presion min-h-14 shrink-0 cursor-pointer rounded-full bg-acento px-7 font-bold text-white shadow-[var(--sombra-2)] hover:brightness-110"
        >
          {enCarrito ? "Hacer el pedido" : "Ver carrito"}
        </button>
      </div>
    </div>
  );
}

function PedidoEnviado({
  numero,
  telefono,
  onVolver,
}: {
  numero: number | null;
  telefono: string | null;
  onVolver: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-5 px-6 text-center">
      <span className="flex h-20 w-20 items-center justify-center rounded-full bg-success-tenue ring-4 ring-success/20">
        <Check size={40} strokeWidth={3} className="text-success" aria-hidden />
      </span>

      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Pedido enviado</h1>
        {numero ? <p className="num mt-1 text-lg text-text-muted">Pedido #{numero}</p> : null}
      </div>

      <p className="text-text-muted">
        Ya lo recibimos. {telefono ? "Te confirmamos por WhatsApp en unos minutos." : "Te confirmamos en unos minutos."}
      </p>

      <button
        onClick={onVolver}
        className="presion mt-2 min-h-14 cursor-pointer rounded-full bg-acento px-7 font-semibold text-white shadow-[var(--sombra-2)] hover:brightness-110"
      >
        Hacer otro pedido
      </button>
    </main>
  );
}

/* ========================================================================== */

/** Los horarios vienen como { lunes: ["08:00","22:00"], ... }. */
function estaAbierto(horarios: Record<string, [string, string]> | null): boolean {
  if (!horarios) return true;

  const ahora = new Date();
  const dias = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
  const hoy = dias[ahora.getDay()]!;

  const franja = horarios[hoy] ?? horarios[hoy.replace("miercoles", "miércoles")] ?? null;
  if (!franja) return false;

  const [desde, hasta] = franja;
  const minutos = ahora.getHours() * 60 + ahora.getMinutes();
  const aMinutos = (h: string) => {
    const [hh, mm] = h.split(":").map(Number);
    return (hh ?? 0) * 60 + (mm ?? 0);
  };

  return minutos >= aMinutos(desde) && minutos <= aMinutos(hasta);
}
