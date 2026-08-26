"use client";

import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

/** Etiqueta de estado. No es un botón: no se toca, informa. */
const pildora = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold leading-none",
  {
    variants: {
      tono: {
        neutral: "border-border bg-surface-alt text-text-muted",
        plata: "border-plata/30 bg-plata-tenue text-plata",
        exito: "border-success/30 bg-success-tenue text-success",
        atencion: "border-warning/30 bg-warning-tenue text-warning",
        peligro: "border-danger/30 bg-danger-tenue text-danger",
        info: "border-info/30 bg-info-tenue text-info",
        marca: "border-brand/30 bg-brand-tenue text-brand",
      },
    },
    defaultVariants: { tono: "neutral" },
  },
);

export function Pildora({
  className,
  tono,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof pildora>) {
  return <span className={cn(pildora({ tono }), className)} {...props} />;
}
