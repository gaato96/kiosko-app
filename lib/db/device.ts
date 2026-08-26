/**
 * lib/db/device.ts — identidad del dispositivo.
 *
 * Cada instalación de la PWA es un `dispositivo` con un UUID propio persistido
 * en IndexedDB. De ahí cuelga la sesión de caja: dos puestos de cobro en el
 * mismo mostrador abren y arquean su caja sin pisarse.
 */

import { uuidv7 } from "uuidv7";
import { escribirMeta, leerMeta } from "./schema";

const CLAVE_ID = "dispositivo_id";
const CLAVE_NOMBRE = "dispositivo_nombre";

export async function idDispositivo(): Promise<string> {
  const existente = await leerMeta<string>(CLAVE_ID);
  if (existente) return existente;
  const nuevo = uuidv7();
  await escribirMeta(CLAVE_ID, nuevo);
  return nuevo;
}

export async function nombreDispositivo(): Promise<string> {
  return (await leerMeta<string>(CLAVE_NOMBRE)) ?? nombreSugerido();
}

export async function renombrarDispositivo(nombre: string): Promise<void> {
  await escribirMeta(CLAVE_NOMBRE, nombre.trim() || nombreSugerido());
}

/** Un nombre que el dueño reconozca sin tener que inventarlo: "Tablet", "Celu". */
function nombreSugerido(): string {
  if (typeof navigator === "undefined") return "Dispositivo";
  const ua = navigator.userAgent;
  if (/iPad|Tablet/i.test(ua)) return "Tablet";
  if (/Android|iPhone|Mobile/i.test(ua)) return "Celular";
  return "Mostrador";
}
