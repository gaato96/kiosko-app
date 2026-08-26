import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Superficie elevada estándar. Todo bloque de contenido del admin va acá adentro. */
export function Tarjeta({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("tarjeta overflow-hidden", className)} {...props}>
      {children}
    </div>
  );
}

export function TarjetaCabecera({
  titulo,
  detalle,
  icono: Icono,
  accion,
  className,
}: {
  titulo: string;
  detalle?: string;
  icono?: LucideIcon;
  accion?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {Icono ? (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radio-sm)] bg-brand-tenue text-brand">
            <Icono size={18} aria-hidden />
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold leading-tight">{titulo}</h2>
          {detalle ? <p className="truncate text-sm text-text-muted">{detalle}</p> : null}
        </div>
      </div>
      {accion}
    </header>
  );
}

/**
 * Encabezado de página del admin. Título grande, bajada corta y acciones a la
 * derecha. Sin migas de pan: la navegación lateral ya dice dónde estás.
 */
export function EncabezadoPagina({
  titulo,
  bajada,
  acciones,
  className,
}: {
  titulo: string;
  bajada?: string;
  acciones?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-6 flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{titulo}</h1>
        {bajada ? <p className="mt-1 max-w-2xl text-text-muted">{bajada}</p> : null}
      </div>
      {acciones ? <div className="flex flex-wrap items-center gap-2">{acciones}</div> : null}
    </header>
  );
}

/**
 * Tarjeta de métrica del panel. El número manda: grande, tabular, arriba de
 * todo. La etiqueta va abajo, chica, sin competir.
 */
export function Metrica({
  etiqueta,
  valor,
  detalle,
  icono: Icono,
  tono = "neutral",
  className,
}: {
  etiqueta: string;
  valor: React.ReactNode;
  detalle?: React.ReactNode;
  icono?: LucideIcon;
  tono?: "neutral" | "plata" | "atencion" | "peligro" | "info";
  className?: string;
}) {
  const tonos = {
    neutral: "text-text",
    plata: "text-plata",
    atencion: "text-warning",
    peligro: "text-danger",
    info: "text-info",
  } as const;

  const fondos = {
    neutral: "bg-surface-alt text-text-muted",
    plata: "bg-plata-tenue text-plata",
    atencion: "bg-warning-tenue text-warning",
    peligro: "bg-danger-tenue text-danger",
    info: "bg-info-tenue text-info",
  } as const;

  return (
    <div className={cn("tarjeta flex flex-col gap-3 p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <span className="rotulo">{etiqueta}</span>
        {Icono ? (
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radio-sm)]",
              fondos[tono],
            )}
          >
            <Icono size={16} aria-hidden />
          </span>
        ) : null}
      </div>
      <p className={cn("num text-3xl font-bold leading-none", tonos[tono])}>{valor}</p>
      {detalle ? <p className="text-sm text-text-muted">{detalle}</p> : null}
    </div>
  );
}
