import { ilustracionDe, SPRITE } from "@/lib/ilustraciones";
import { cn } from "@/lib/utils";

/**
 * El dibujo de un producto, tomando el color de su categoría.
 *
 * Es `<use>` contra un sprite externo, no un componente por dibujo: así los 55
 * dibujos no entran al bundle de JS del POS, que tiene presupuesto de 200 kB.
 */
export function Ilustracion({
  nombre,
  categoria,
  tipoVenta,
  color,
  className,
}: {
  nombre: string;
  categoria?: string | null;
  tipoVenta?: string | null;
  /** Color de la categoría. El dibujo entero se pinta con esto. */
  color?: string | null;
  className?: string;
}) {
  const simbolo = ilustracionDe(nombre, categoria, tipoVenta);

  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden
      focusable="false"
      className={cn("shrink-0", className)}
      style={color ? { color } : undefined}
    >
      <use href={`${SPRITE}#${simbolo}`} />
    </svg>
  );
}
