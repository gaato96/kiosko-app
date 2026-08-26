"use client";

import { AlertCircle } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

const baseCampo = [
  "w-full rounded-[var(--radio)] border border-border bg-surface-alto px-4 text-base text-text",
  "shadow-[var(--sombra-1)] transition-[border-color,box-shadow,background-color] duration-150",
  "placeholder:text-text-sutil",
  "hover:border-border-fuerte",
  "focus:border-brand focus:outline-none focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--brand)_22%,transparent)]",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "aria-[invalid=true]:border-danger aria-[invalid=true]:shadow-[0_0_0_3px_color-mix(in_srgb,var(--danger)_18%,transparent)]",
].join(" ");

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(baseCampo, "min-h-14", className)} {...props} />;
  },
);

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(baseCampo, "min-h-28 py-3 leading-relaxed", className)} {...props} />;
});

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        baseCampo,
        "min-h-14 cursor-pointer appearance-none bg-no-repeat pr-10",
        "bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2394a1bb%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22/%3E%3C/svg%3E')]",
        "bg-[length:1.15rem] bg-[position:right_0.85rem_center]",
        className,
      )}
      {...props}
    />
  );
});

/**
 * <Campo> — etiqueta visible SIEMPRE. Nunca un placeholder haciendo de label:
 * en cuanto el usuario escribe, pierde de vista qué le estaban pidiendo.
 * El error va pegado al campo, no arriba de todo el formulario.
 */
export function Campo({
  etiqueta,
  ayuda,
  error,
  requerido,
  children,
  className,
}: {
  etiqueta: string;
  ayuda?: string;
  error?: string;
  requerido?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-2", className)}>
      <span className="flex items-center gap-1.5 text-sm font-semibold text-text">
        {etiqueta}
        {requerido ? (
          <span className="text-danger" aria-hidden>
            *
          </span>
        ) : null}
      </span>
      {children}
      {error ? (
        <span role="alert" className="flex items-center gap-1.5 text-sm font-medium text-danger">
          <AlertCircle size={14} className="shrink-0" aria-hidden />
          {error}
        </span>
      ) : ayuda ? (
        <span className="text-sm leading-snug text-text-muted">{ayuda}</span>
      ) : null}
    </label>
  );
}
