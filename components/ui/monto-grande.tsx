import { cn } from "@/lib/utils";
import { formatearPesos } from "@/lib/money";

/**
 * <MontoGrande> — el componente de un solo número enorme.
 * Total del ticket, vuelto y resultado de la balanza. Siempre tabular-nums.
 *
 * El signo $ va más chico y opaco: lo que se lee de reojo son los dígitos.
 */
export function MontoGrande({
  centavos,
  variante = "neutral",
  etiqueta,
  tamano = "grande",
  className,
}: {
  centavos: number;
  variante?: "neutral" | "exito" | "peligro" | "atencion" | "plata";
  etiqueta?: string;
  tamano?: "chico" | "medio" | "grande" | "balanza";
  className?: string;
}) {
  const colores = {
    neutral: "text-text",
    exito: "text-success",
    plata: "text-plata",
    peligro: "text-danger",
    atencion: "text-warning",
  } as const;

  const tamanos = {
    chico: "text-2xl",
    medio: "text-3xl sm:text-4xl",
    grande: "text-5xl sm:text-6xl",
    balanza: "text-6xl sm:text-7xl",
  } as const;

  const texto = formatearPesos(centavos);
  const [signo, ...resto] = [texto.slice(0, 1), texto.slice(1)];

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {etiqueta ? <span className="rotulo">{etiqueta}</span> : null}
      <output
        aria-live="polite"
        aria-label={texto}
        className={cn(
          "num flex items-baseline font-bold leading-[0.95]",
          tamanos[tamano],
          colores[variante],
        )}
      >
        <span className="mr-0.5 text-[0.55em] font-semibold opacity-55" aria-hidden>
          {signo}
        </span>
        <span aria-hidden>{resto.join("")}</span>
      </output>
    </div>
  );
}
