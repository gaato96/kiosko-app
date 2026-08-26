import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Estados vacíos que enseñan (docs/04 §1.6). Nunca una pantalla en blanco:
 * siempre dicen qué falta y ofrecen el siguiente paso.
 */
export function EstadoVacio({
  icono: Icono,
  titulo,
  detalle,
  accion,
  className,
}: {
  icono?: LucideIcon;
  titulo: string;
  detalle?: string;
  accion?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-[var(--radio-lg)] border border-dashed border-border px-6 py-12 text-center",
        className,
      )}
    >
      {Icono ? (
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-alt text-text-sutil ring-1 ring-border">
          <Icono size={24} aria-hidden />
        </span>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <p className="font-display text-lg font-semibold text-text">{titulo}</p>
        {detalle ? (
          <p className="mx-auto max-w-sm text-sm leading-relaxed text-text-muted">{detalle}</p>
        ) : null}
      </div>
      {accion}
    </div>
  );
}
