"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import * as React from "react";
import { cn, haptico } from "@/lib/utils";

/**
 * <Boton> — docs/04-DESIGN-SYSTEM.md §5.
 *
 * Jerarquía de color, no de tamaño:
 *   plata      verde. Plata que entra. COBRAR, CONFIRMAR, registrar pago.
 *   primario   tinta. La acción principal de una pantalla que no es plata.
 *   secundario superficie elevada. Alternativas.
 *   fantasma   sin caja. Iconos de barra, acciones terciarias.
 *   peligro    rojo. Anular, borrar, vaciar.
 *
 * Alto mínimo 56 px; 64 px en las acciones primarias del POS.
 */
const variantes = cva(
  [
    "presion group relative inline-flex select-none items-center justify-center gap-2",
    "font-semibold leading-none whitespace-nowrap",
    "rounded-[var(--radio)] border border-transparent",
    "disabled:pointer-events-none disabled:opacity-40",
    "cursor-pointer disabled:cursor-not-allowed",
  ].join(" "),
  {
    variants: {
      variante: {
        plata: [
          "bg-[linear-gradient(180deg,var(--plata-viva),var(--plata))] text-plata-fg",
          "shadow-[0_1px_0_rgb(255_255_255/0.2)_inset,0_4px_14px_-4px_color-mix(in_srgb,var(--plata)_60%,transparent)]",
          "hover:brightness-[1.07] active:brightness-95",
        ].join(" "),
        primario: [
          "bg-tinta text-brand-fg",
          "shadow-[0_1px_0_rgb(255_255_255/0.12)_inset,var(--sombra-2)]",
          "hover:bg-brand-suave",
        ].join(" "),
        secundario:
          "border-border bg-surface text-text shadow-[var(--sombra-1)] hover:border-border-fuerte hover:bg-surface-alt",
        fantasma: "text-text-muted hover:bg-surface-alt hover:text-text",
        peligro: "bg-danger text-white shadow-[var(--sombra-2)] hover:brightness-110",
        contorno: "border-border-fuerte text-text hover:border-tinta hover:bg-surface-alt",
        /** Alias histórico: `exito` era el verde de cobrar. */
        exito: [
          "bg-[linear-gradient(180deg,var(--plata-viva),var(--plata))] text-plata-fg",
          "shadow-[0_1px_0_rgb(255_255_255/0.2)_inset,0_4px_14px_-4px_color-mix(in_srgb,var(--plata)_60%,transparent)]",
          "hover:brightness-[1.07]",
        ].join(" "),
      },
      tamano: {
        /** 56 px: el mínimo del POS. */
        normal: "min-h-14 px-5 text-base",
        /** 64 px: acciones primarias del mostrador. */
        grande: "min-h-16 px-6 text-lg tracking-tight",
        /** 72 px: numpad. */
        numpad: "min-h-18 min-w-18 text-2xl",
        /** Fuera del POS (admin), donde no se cobra con una mano. */
        chico: "min-h-10 px-3.5 text-sm",
        /** Cuadrado, solo icono, en barras. */
        icono: "min-h-12 min-w-12 px-0",
        /** Cuadrado táctil, solo icono, en el POS. */
        "icono-pos": "min-h-14 min-w-14 px-0",
      },
      ancho: { auto: "", completo: "w-full" },
    },
    defaultVariants: { variante: "secundario", tamano: "normal", ancho: "auto" },
  },
);

export type BotonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof variantes> & {
    /** Vibración al tocar. Encendida por defecto en el POS. */
    vibrar?: boolean;
    /** Muestra un spinner y bloquea el botón. */
    cargando?: boolean;
  };

export const Boton = React.forwardRef<HTMLButtonElement, BotonProps>(function Boton(
  { className, variante, tamano, ancho, vibrar = true, cargando = false, onClick, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || cargando}
      aria-busy={cargando || undefined}
      className={cn(variantes({ variante, tamano, ancho }), className)}
      onClick={(e) => {
        if (vibrar) haptico(10);
        onClick?.(e);
      }}
      {...props}
    >
      {cargando ? (
        <Loader2 size={18} className="animate-spin motion-reduce:animate-none" aria-hidden />
      ) : null}
      {children}
    </button>
  );
});

export { variantes as variantesBoton };
