"use client";

/**
 * <ProductoCard> — la tarjeta de la grilla.
 *
 * Anatomía, y el orden importa:
 *   1. el DIBUJO, grande, sobre una plaqueta del color de la categoría
 *   2. el NOMBRE, dos líneas máximo
 *   3. el PRECIO, abajo, tabular
 *
 * El dibujo va primero porque el operador reconoce por silueta antes que por
 * texto. Una grilla de 22 rectángulos con solo nombre y precio se lee de a un
 * item por vez; con siluetas se barre de un vistazo.
 *
 * La foto real sigue siendo opcional y no la pide nadie: pedir fotos es la
 * fricción que hace abandonar la carga del catálogo.
 */

import { Scale } from "lucide-react";
import { Ilustracion } from "@/components/ui/ilustracion";
import { formatearPesos } from "@/lib/money";
import { descuentoPct, precioAnterior, precioVigente } from "@/lib/producto";
import type { Producto } from "@/lib/tipos";
import { cn, haptico } from "@/lib/utils";

export function ProductoCard({
  producto,
  color,
  categoriaNombre,
  onElegir,
}: {
  producto: Producto;
  color?: string | null;
  categoriaNombre?: string | null;
  onElegir: (p: Producto) => void;
}) {
  const esPeso = producto.tipo_venta === "PESO";
  // El precio que se muestra es EL QUE SE VA A COBRAR. Si hay oferta vigente,
  // es el de oferta: mostrar el de lista y cobrar otro es una discusión con el
  // cliente que ya lo vio en la Vidriera.
  const precio = precioVigente(producto);
  const antes = precioAnterior(producto);
  const descuento = descuentoPct(producto);
  const sinStock = producto.controla_stock && producto.stock_actual <= 0;
  const tinte = producto.color ?? color ?? "#56617a";

  return (
    <button
      onClick={() => {
        haptico(12);
        onElegir(producto);
      }}
      aria-label={`${producto.nombre}, ${formatearPesos(precio)}${esPeso ? " por kilo" : ""}${antes ? ", en oferta" : ""}`}
      style={{ ["--tinte" as string]: tinte }}
      className={cn(
        "presion group relative flex cursor-pointer flex-col gap-2 rounded-[var(--radio-lg)] p-2.5 text-left",
        "border border-border bg-surface shadow-[var(--sombra-1)]",
        "hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--tinte)_45%,transparent)] hover:shadow-[var(--sombra-2)]",
        "active:translate-y-0",
        sinStock && "opacity-55 grayscale",
      )}
    >
      {/* La plaqueta. Foto del producto si la hay; si no, el dibujo del
          arquetipo. La foto se recorta a cuadro (`object-cover`): las fotos de
          catálogo vienen con fondos y encuadres distintos, y recortarlas todas
          igual es lo que hace que la grilla se vea pareja. */}
      <span
        className="relative flex aspect-[5/4] items-center justify-center overflow-hidden rounded-[var(--radio)]"
        style={{ backgroundColor: `color-mix(in srgb, ${tinte} 13%, var(--superficie))` }}
      >
        {producto.imagen_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- archivo local y estático; next/image agregaría un salto al servidor en una pantalla que tiene que funcionar sin red
          <img
            src={producto.imagen_url}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.06]"
          />
        ) : (
          <Ilustracion
            nombre={producto.nombre}
            categoria={categoriaNombre}
            tipoVenta={producto.tipo_venta}
            color={tinte}
            className="h-[68%] w-[68%] transition-transform duration-300 ease-out group-hover:scale-[1.07]"
          />
        )}
        {esPeso ? (
          <span
            className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-surface/85 text-text-muted shadow-[var(--sombra-1)]"
            title="Se vende por peso"
          >
            <Scale size={13} aria-hidden />
          </span>
        ) : null}
        {descuento > 0 ? (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-plata px-1.5 py-0.5 text-[0.625rem] font-bold leading-tight text-plata-fg shadow-[var(--sombra-1)]">
            −{descuento}%
          </span>
        ) : null}
        {sinStock ? (
          <span className="absolute inset-x-0 bottom-0 bg-warning/90 py-0.5 text-center text-[0.625rem] font-bold uppercase tracking-wide text-white">
            Sin stock
          </span>
        ) : null}
      </span>

      <span className="line-clamp-2 min-h-[2.1rem] px-0.5 text-[0.8125rem] font-semibold leading-tight text-text">
        {producto.nombre}
      </span>

      <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 px-0.5">
        <span className="num text-base font-bold leading-none text-text">
          {formatearPesos(precio)}
        </span>
        {esPeso ? <span className="text-[0.6875rem] text-text-sutil">/kg</span> : null}
        {antes ? (
          <span className="num text-[0.6875rem] leading-none text-text-sutil line-through">
            {formatearPesos(antes)}
          </span>
        ) : null}
      </span>
    </button>
  );
}
