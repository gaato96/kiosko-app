"use client";

import { useEffect, useState } from "react";

/** navigator.onLine con suscripción. Es la mitad del <EstadoSync>. */
/** Los hooks llevan el prefijo `use` que exige React; el resto del dominio va en español. */
export function useConexion(): boolean {
  const [enLinea, setEnLinea] = useState(true);

  useEffect(() => {
    setEnLinea(navigator.onLine);
    const arriba = () => setEnLinea(true);
    const abajo = () => setEnLinea(false);
    window.addEventListener("online", arriba);
    window.addEventListener("offline", abajo);
    return () => {
      window.removeEventListener("online", arriba);
      window.removeEventListener("offline", abajo);
    };
  }, []);

  return enLinea;
}
