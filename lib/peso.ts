/**
 * lib/peso.ts — conversión peso <-> importe.
 *
 * Regla de oro #2: el peso se guarda en GRAMOS enteros. 1,250 kg = 1250.
 * Nada de kilos con decimales dando vueltas por el código.
 *
 * Ver docs/03-modulos/03-balanza-peso.md.
 */

import { redondear } from "./money";

/** Pesos frecuentes por defecto del modo balanza, en gramos. */
export const PESOS_FRECUENTES = [100, 250, 500, 1000] as const;

/** Por encima de esto el modo balanza pide confirmación extra (evita el cero de más). */
export const PESO_SOSPECHOSO_G = 10000;

/**
 * Gramos -> importe en centavos, con el redondeo configurado por el comercio.
 * 250 g de jamón a $18.400/kg  ->  460000  ->  $4.600 exactos.
 */
export function importeDesdeGramos(
  gramos: number,
  precioPorKgCentavos: number,
  redondeoCentavos = 1,
): number {
  if (!Number.isFinite(gramos) || !Number.isFinite(precioPorKgCentavos)) return 0;
  const bruto = Math.round((gramos * precioPorKgCentavos) / 1000);
  return redondear(bruto, redondeoCentavos);
}

/**
 * Importe en centavos -> gramos sugeridos para ir a pesar.
 * NO se redondea: es una sugerencia para la balanza, no un cobro.
 * $2.000 de queso a $13.500/kg  ->  148 g.
 */
export function gramosDesdeImporte(
  importeCentavos: number,
  precioPorKgCentavos: number,
): number {
  if (!Number.isFinite(importeCentavos) || !precioPorKgCentavos) return 0;
  const gramos = Math.round((importeCentavos * 1000) / precioPorKgCentavos);
  // Sugerencia mínima de 1 g: pedir "$5 de queso" no puede dar 0.
  return Math.max(1, gramos);
}

/** `250` -> `"250 g"`, `1250` -> `"1,25 kg"`, `2000` -> `"2 kg"`. */
export function formatearPeso(gramos: number): string {
  const abs = Math.abs(gramos);
  const signo = gramos < 0 ? "-" : "";
  if (abs < 1000) return `${signo}${abs} g`;

  const kg = Math.trunc(abs / 1000);
  const resto = abs % 1000;
  if (resto === 0) return `${signo}${kg.toLocaleString("es-AR")} kg`;

  // Hasta tres decimales, sin ceros de relleno a la derecha.
  const decimales = String(resto).padStart(3, "0").replace(/0+$/, "");
  return `${signo}${kg.toLocaleString("es-AR")},${decimales} kg`;
}

/**
 * Parsea lo que tipea una persona a gramos enteros.
 * Acepta `"250"`, `"250 g"`, `"1,25 kg"`, `"1.25kg"`, `"0,5 kg"`.
 * Sin unidad, se interpreta en GRAMOS (es lo que muestra el visor de la balanza).
 */
export function parsearPeso(texto: string): number | null {
  if (typeof texto !== "string") return null;
  const t = texto.trim().toLowerCase();
  if (t === "") return null;

  const enKilos = /kg|kilo/.test(t);
  const numero = t.replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  if (numero === "" || numero === "-") return null;

  const valor = Number(numero);
  if (!Number.isFinite(valor)) return null;

  return Math.round(enKilos ? valor * 1000 : valor);
}

/**
 * Cantidad de un item de venta formateada según el tipo de venta del producto.
 * En UNIDAD la cantidad son unidades; en PESO son gramos.
 */
export function formatearCantidad(cantidad: number, tipoVenta: "UNIDAD" | "PESO"): string {
  return tipoVenta === "PESO" ? formatearPeso(cantidad) : String(cantidad);
}

/**
 * Convierte una cantidad expresada en unidades de COMPRA (cajas, hormas) al
 * delta de stock en unidades de venta o gramos, usando `factor_compra`.
 * Caja x24 -> factor 24;  horma de 4 kg -> factor 4000.
 */
export function deltaDesdeUnidadCompra(cantidadCompra: number, factorCompra: number): number {
  return Math.round(cantidadCompra * (factorCompra || 1));
}

/** El inverso: stock en unidades de venta -> unidades de compra a pedir (hacia arriba). */
export function unidadesCompraDesdeDelta(delta: number, factorCompra: number): number {
  return Math.ceil(delta / (factorCompra || 1));
}
