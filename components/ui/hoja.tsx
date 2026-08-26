"use client";

/**
 * <Hoja> — la única capa modal del proyecto.
 *
 * Regla del design system §1: un toque, una acción. NADA de modales anidados
 * en el flujo de cobro. Por eso esto es deliberadamente pobre: se abre, ocupa
 * toda la pantalla en celular y se cierra. No apila.
 */

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export function Hoja({
  abierta,
  onCerrar,
  titulo,
  descripcion,
  children,
  tamano = "media",
  bloqueante = false,
}: {
  abierta: boolean;
  onCerrar: () => void;
  titulo?: string;
  descripcion?: string;
  children: React.ReactNode;
  tamano?: "media" | "ancha" | "completa";
  /** Un modal bloqueante no se cierra con Escape ni tocando afuera (apertura de caja). */
  bloqueante?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierta || bloqueante) return;
    const alTeclado = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    document.addEventListener("keydown", alTeclado);
    return () => document.removeEventListener("keydown", alTeclado);
  }, [abierta, bloqueante, onCerrar]);

  useEffect(() => {
    if (abierta) ref.current?.focus();
  }, [abierta]);

  if (!abierta) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgb(4_7_14/0.72)] p-0 backdrop-blur-[6px] animate-[aparecer_0.16s_ease-out] sm:items-center sm:p-6"
      onClick={bloqueante ? undefined : onCerrar}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "flex max-h-dvh w-full flex-col overflow-y-auto border border-border bg-surface outline-none",
          "shadow-[var(--sombra-3)] animate-[subir_0.28s_cubic-bezier(0.16,1,0.3,1)]",
          tamano === "completa"
            ? "h-dvh sm:max-w-none sm:rounded-none"
            : cn(
                "rounded-t-[var(--radio-xl)] sm:rounded-[var(--radio-xl)]",
                tamano === "ancha" ? "sm:max-w-3xl" : "sm:max-w-lg",
              ),
        )}
      >
        {titulo ? (
          <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-surface/95 px-5 py-4 backdrop-blur">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold leading-tight">{titulo}</h2>
              {descripcion ? (
                <p className="mt-0.5 text-sm text-text-muted">{descripcion}</p>
              ) : null}
            </div>
            {!bloqueante ? (
              <button
                onClick={onCerrar}
                aria-label="Cerrar"
                className="presion -mr-1.5 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-text-muted hover:bg-surface-alt hover:text-text"
              >
                <X size={20} />
              </button>
            ) : null}
          </header>
        ) : null}
        {children}
      </div>
    </div>
  );
}
