"use client";

/**
 * lib/imagenes.ts — subida de fotos al Storage de Supabase.
 *
 * Tres lugares suben imágenes y los tres pasan por acá: la foto del producto,
 * el logo del kiosco y el avatar del usuario.
 *
 * Dos decisiones que importan:
 *
 * · La imagen se COMPRIME EN EL CELULAR antes de subirla. Una foto de una
 *   cámara de teléfono son 4 MB; con la conexión del mostrador eso es medio
 *   minuto de espera y datos del dueño. Redimensionada y en WebP queda en
 *   unos 60 kB sin que se note la diferencia en una tarjeta de 120 px.
 *
 * · La ruta SIEMPRE arranca con el `comercio_id`. La política del bucket mira
 *   esa primera carpeta para decidir quién puede escribir: sin eso, cualquier
 *   usuario autenticado podría pisar las fotos de otro kiosco.
 */

import { uuidv7 } from "uuidv7";
import { supabaseBrowser } from "@/lib/supabase/browser";

export const BUCKET_IMAGENES = "imagenes";

export type CarpetaImagen = "productos" | "logo" | "usuarios";

/** Lado máximo por destino. Nadie mira la foto de un producto a pantalla completa. */
const LADO_MAXIMO: Record<CarpetaImagen, number> = {
  productos: 900,
  logo: 512,
  usuarios: 400,
};

export const TAMANO_MAXIMO_BYTES = 5 * 1024 * 1024;

/** Decodifica el archivo sin pasar por el DOM cuando el navegador lo permite. */
async function decodificar(archivo: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(archivo);
    } catch {
      // Algunos HEIC de iPhone no los decodifica createImageBitmap: cae al <img>.
    }
  }

  const url = URL.createObjectURL(archivo);
  try {
    return await new Promise<HTMLImageElement>((resolver, rechazar) => {
      const img = new Image();
      img.onload = () => resolver(img);
      img.onerror = () => rechazar(new Error("No se pudo leer la imagen"));
      img.src = url;
    });
  } finally {
    // El bitmap ya está en memoria; el objectURL no hace falta más.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/**
 * Redimensiona al lado máximo y devuelve WebP. Si el navegador no sabe
 * codificar WebP (Safari viejo) devuelve JPEG, que sabe cualquiera.
 */
export async function comprimirImagen(
  archivo: File,
  ladoMaximo: number,
): Promise<{ blob: Blob; extension: string }> {
  const fuente = await decodificar(archivo);
  const anchoOriginal = "width" in fuente ? fuente.width : 0;
  const altoOriginal = "height" in fuente ? fuente.height : 0;

  if (anchoOriginal === 0 || altoOriginal === 0) {
    throw new Error("No se pudo leer la imagen");
  }

  const escala = Math.min(1, ladoMaximo / Math.max(anchoOriginal, altoOriginal));
  const ancho = Math.round(anchoOriginal * escala);
  const alto = Math.round(altoOriginal * escala);

  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen");
  ctx.drawImage(fuente as CanvasImageSource, 0, 0, ancho, alto);
  if ("close" in fuente) fuente.close();

  const blob = await new Promise<Blob | null>((resolver) =>
    lienzo.toBlob(resolver, "image/webp", 0.82),
  );

  if (blob && blob.type === "image/webp") return { blob, extension: "webp" };

  const jpeg = await new Promise<Blob | null>((resolver) =>
    lienzo.toBlob(resolver, "image/jpeg", 0.85),
  );
  if (!jpeg) throw new Error("No se pudo procesar la imagen");
  return { blob: jpeg, extension: "jpg" };
}

/**
 * Sube y devuelve la URL pública. El nombre es un UUID v7 nuevo en cada
 * subida a propósito: reusar el nombre deja la foto vieja cacheada en el
 * service worker y en el CDN, y el dueño ve la anterior durante días.
 */
export async function subirImagen(opciones: {
  archivo: File;
  comercioId: string;
  carpeta: CarpetaImagen;
}): Promise<string> {
  const { archivo, comercioId, carpeta } = opciones;

  if (!archivo.type.startsWith("image/")) {
    throw new Error("Eso no es una imagen.");
  }
  if (archivo.size > TAMANO_MAXIMO_BYTES) {
    throw new Error("La imagen es muy pesada. Probá con una más chica de 5 MB.");
  }

  const { blob, extension } = await comprimirImagen(archivo, LADO_MAXIMO[carpeta]);
  const ruta = `${comercioId}/${carpeta}/${uuidv7()}.${extension}`;

  const sb = supabaseBrowser();
  const { error } = await sb.storage.from(BUCKET_IMAGENES).upload(ruta, blob, {
    contentType: blob.type,
    cacheControl: "31536000",
    upsert: false,
  });

  if (error) throw new Error(`No se pudo subir la imagen: ${error.message}`);

  const { data } = sb.storage.from(BUCKET_IMAGENES).getPublicUrl(ruta);
  return data.publicUrl;
}

/**
 * Borra una imagen del bucket a partir de su URL pública.
 *
 * Es "mejor esfuerzo": que quede un archivo huérfano es mucho menos grave que
 * romper el guardado del producto porque el borrado falló.
 */
export async function borrarImagen(url: string | null | undefined): Promise<void> {
  const ruta = rutaDesdeUrl(url);
  if (!ruta) return;
  try {
    await supabaseBrowser().storage.from(BUCKET_IMAGENES).remove([ruta]);
  } catch {
    // Silencio a propósito.
  }
}

/** `https://…/storage/v1/object/public/imagenes/{ruta}` → `{ruta}`. */
export function rutaDesdeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const marca = `/${BUCKET_IMAGENES}/`;
  const i = url.indexOf(marca);
  if (i === -1) return null;
  const ruta = url.slice(i + marca.length).split("?")[0];
  return ruta ? decodeURIComponent(ruta) : null;
}
