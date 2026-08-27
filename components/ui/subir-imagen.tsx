"use client";

/**
 * <SubirImagen> — la foto, desde la cámara del celular o desde la PC.
 *
 * Dos botones separados y no un único "elegir archivo": en Android e iOS, un
 * `<input type=file>` pelado abre un menú de sistema donde "Cámara" es una
 * opción más entre Drive, Fotos y Archivos. El dueño que está parado frente a
 * la góndola quiere sacar la foto ahora, y `capture="environment"` abre la
 * cámara trasera directo.
 *
 * La foto NO es obligatoria en ningún lado (docs/00-PRD: cargar fotos es
 * fricción y mata la adopción). Esto es un extra, y por eso se puede sacar con
 * un toque sin ningún cartel de confirmación.
 */

import { useId, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { borrarImagen, subirImagen, type CarpetaImagen } from "@/lib/imagenes";
import { cn } from "@/lib/utils";

export function SubirImagen({
  valor,
  onCambio,
  comercioId,
  carpeta,
  forma = "cuadrada",
  etiqueta = "Foto",
  ayuda,
  className,
}: {
  valor: string | null;
  onCambio: (url: string | null) => void;
  comercioId: string;
  carpeta: CarpetaImagen;
  forma?: "cuadrada" | "redonda";
  etiqueta?: string;
  ayuda?: string;
  className?: string;
}) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const camaraRef = useRef<HTMLInputElement>(null);
  const archivoRef = useRef<HTMLInputElement>(null);
  const idBase = useId();

  async function tomar(archivo: File | undefined) {
    if (!archivo) return;
    setSubiendo(true);
    setError(null);
    try {
      const anterior = valor;
      const url = await subirImagen({ archivo, comercioId, carpeta });
      onCambio(url);
      // La anterior se limpia recién cuando la nueva ya está arriba.
      void borrarImagen(anterior);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir la imagen");
    } finally {
      setSubiendo(false);
      // Se limpia el input o volver a elegir el MISMO archivo no dispara change.
      if (camaraRef.current) camaraRef.current.value = "";
      if (archivoRef.current) archivoRef.current.value = "";
    }
  }

  function quitar() {
    const anterior = valor;
    onCambio(null);
    void borrarImagen(anterior);
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <span className="text-sm font-semibold text-text">{etiqueta}</span>

      <div className="flex items-center gap-3">
        <div
          className={cn(
            "relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden border border-border bg-surface-alt",
            forma === "redonda" ? "rounded-full" : "rounded-[var(--radio)]",
          )}
        >
          {valor ? (
            // <img> y no next/image: la URL sale del Storage del propio kiosco
            // y no vale la pena pasarla por el optimizador para 80 px.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={valor} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImagePlus size={22} className="text-text-sutil" aria-hidden />
          )}

          {subiendo ? (
            <span className="absolute inset-0 flex items-center justify-center bg-surface/70">
              <Loader2 size={20} className="animate-spin text-text-muted" aria-hidden />
            </span>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-1 flex-wrap gap-2">
          <label
            htmlFor={`${idBase}-camara`}
            className="presion flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radio)] border border-border bg-surface px-3.5 text-sm font-semibold hover:border-border-fuerte"
          >
            <Camera size={16} aria-hidden /> Sacar foto
          </label>
          <input
            ref={camaraRef}
            id={`${idBase}-camara`}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => void tomar(e.target.files?.[0])}
          />

          <label
            htmlFor={`${idBase}-archivo`}
            className="presion flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radio)] border border-border bg-surface px-3.5 text-sm font-semibold hover:border-border-fuerte"
          >
            <ImagePlus size={16} aria-hidden /> Desde la compu
          </label>
          <input
            ref={archivoRef}
            id={`${idBase}-archivo`}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => void tomar(e.target.files?.[0])}
          />

          {valor ? (
            <button
              type="button"
              onClick={quitar}
              className="presion flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radio)] px-3 text-sm font-semibold text-text-muted hover:bg-danger-tenue hover:text-danger"
            >
              <Trash2 size={16} aria-hidden /> Quitar
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : ayuda ? (
        <p className="text-sm leading-snug text-text-muted">{ayuda}</p>
      ) : null}
    </div>
  );
}
