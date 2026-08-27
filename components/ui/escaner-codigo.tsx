"use client";

/**
 * <EscanerCodigo> — leer el código de barras con la cámara del celular.
 *
 * El kiosco que tiene pistola la usa: el lector se comporta como un teclado y
 * escribe solo en el campo. El que no la tiene —que es el que está cargando el
 * catálogo desde el celular, sentado en el mostrador— hasta ahora tenía que
 * tipear trece dígitos a mano por producto. Eso no lo hace nadie: es el motivo
 * real por el que los códigos quedan vacíos y después la pistola no encuentra
 * nada.
 *
 * Usa `BarcodeDetector`, que viene nativo en Chrome de Android (que es el
 * navegador del 90% de los kioscos). Donde no está, se avisa y se sigue
 * pudiendo tipear: nunca se bloquea la carga del producto por esto.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { CameraOff, ScanBarcode, X } from "lucide-react";
import { Boton } from "@/components/ui/boton";
import { haptico } from "@/lib/utils";

/** Los simbolismos que existen de verdad en una góndola argentina. */
const FORMATOS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"];

type DetectorDeCodigos = {
  detect: (fuente: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
};

type ConstructorDetector = {
  new (opciones?: { formats?: string[] }): DetectorDeCodigos;
  getSupportedFormats?: () => Promise<string[]>;
};

function constructorDetector(): ConstructorDetector | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { BarcodeDetector?: ConstructorDetector };
  return w.BarcodeDetector ?? null;
}

/** `true` si este navegador puede leer códigos con la cámara. */
export function hayEscaner(): boolean {
  return (
    constructorDetector() !== null &&
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

export function EscanerCodigo({
  abierto,
  onLeido,
  onCerrar,
}: {
  abierto: boolean;
  onLeido: (codigo: string) => void;
  onCerrar: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  // El callback se guarda en una ref para que el bucle de detección no dependa
  // de la identidad de la función: si dependiera, cada render del padre
  // reiniciaría la cámara y el visor parpadearía sin parar.
  const alLeer = useRef(onLeido);
  alLeer.current = onLeido;

  const cerrar = useCallback(() => onCerrar(), [onCerrar]);

  useEffect(() => {
    if (!abierto) return;

    const Detector = constructorDetector();
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setError(
        "Este navegador no puede leer códigos con la cámara. Escribilo a mano o usá la pistola.",
      );
      return;
    }

    let stream: MediaStream | null = null;
    let vivo = true;
    let cuadro = 0;
    setError(null);

    const detector = new Detector({ formats: FORMATOS });

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          // La trasera: nadie escanea un producto con la cámara selfie.
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch {
        if (vivo) {
          setError("No pudimos abrir la cámara. Revisá el permiso del navegador.");
        }
        return;
      }

      if (!vivo || !videoRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      videoRef.current.srcObject = stream;
      try {
        await videoRef.current.play();
      } catch {
        // Autoplay bloqueado: el atributo playsInline y muted ya lo cubren en
        // la práctica; si igual falla, el usuario ve el visor negro y cierra.
      }

      const mirar = async () => {
        if (!vivo || !videoRef.current) return;
        try {
          const encontrados = await detector.detect(videoRef.current);
          const codigo = encontrados[0]?.rawValue?.trim();
          if (codigo) {
            haptico([20, 40, 20]);
            alLeer.current(codigo);
            return;
          }
        } catch {
          // Un cuadro que no se pudo analizar no es un error: se prueba el
          // siguiente. Cortar acá haría que un frame borroso mate el escáner.
        }
        cuadro = requestAnimationFrame(() => void mirar());
      };

      cuadro = requestAnimationFrame(() => void mirar());
    })();

    return () => {
      vivo = false;
      cancelAnimationFrame(cuadro);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    const alTeclado = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrar();
    };
    document.addEventListener("keydown", alTeclado);
    return () => document.removeEventListener("keydown", alTeclado);
  }, [abierto, cerrar]);

  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[rgb(4_7_14/0.94)]">
      <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-4 text-white">
        <p className="flex items-center gap-2 font-display text-base font-semibold">
          <ScanBarcode size={20} aria-hidden /> Apuntá al código
        </p>
        <button
          type="button"
          onClick={cerrar}
          aria-label="Cerrar el escáner"
          className="presion flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
        >
          <X size={22} />
        </button>
      </header>

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        {error ? (
          <div className="flex max-w-sm flex-col items-center gap-3 px-6 text-center text-white">
            <CameraOff size={32} aria-hidden />
            <p className="text-balance">{error}</p>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              muted
              playsInline
              className="h-full w-full object-cover"
              aria-label="Visor de la cámara"
            />
            {/* La mira: sin una guía visible la gente aleja el teléfono medio
                metro y el código nunca entra en foco. */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-8 top-1/2 h-32 -translate-y-1/2 rounded-[var(--radio-lg)] border-2 border-white/80 shadow-[0_0_0_100vmax_rgb(4_7_14/0.45)]"
            />
          </>
        )}
      </div>

      <footer className="borde-seguro shrink-0 px-4 pt-3">
        <Boton variante="secundario" tamano="grande" ancho="completo" onClick={cerrar}>
          Escribirlo a mano
        </Boton>
      </footer>
    </div>
  );
}
