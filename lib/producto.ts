/**
 * lib/producto.ts — el precio que vale HOY.
 *
 * La oferta tiene que resolverse en un solo lugar. Si el precio de oferta lo
 * aplica la Vidriera y no el mostrador, el cliente ve $1.200 en el celular y
 * le cobran $1.500 en la mano. Eso no es un bug de UI: es una discusión con el
 * cliente parado en el mostrador.
 *
 * En Postgres la contraparte de esto es `public.precio_vigente(productos)`
 * (migración 001). Las dos tienen que decir lo mismo.
 */

import type { Producto, TipoVenta } from "./tipos";

type ConOferta = {
  tipo_venta: TipoVenta;
  precio_venta_centavos: number | null;
  precio_por_kg_centavos: number | null;
  precio_oferta_centavos?: number | null;
  oferta_hasta?: string | null;
};

/** ¿La oferta está viva ahora mismo? Sin fecha de fin, no vence. */
export function enOferta(p: ConOferta, ahora = new Date()): boolean {
  if (p.precio_oferta_centavos == null) return false;
  // La oferta solo aplica a lo que se vende por unidad: un precio de oferta
  // fijo sobre algo que se cobra por kilo no significa nada.
  if (p.tipo_venta !== "UNIDAD") return false;
  if (!p.oferta_hasta) return true;
  return new Date(p.oferta_hasta) > ahora;
}

/**
 * El precio unitario a cobrar. Por kilo si se pesa, con oferta si la hay.
 * Devuelve 0 si el producto no tiene precio cargado, que es un dato roto y se
 * ve como tal en la pantalla.
 */
export function precioVigente(p: ConOferta, ahora = new Date()): number {
  if (p.tipo_venta === "PESO") return p.precio_por_kg_centavos ?? 0;
  if (enOferta(p, ahora)) return p.precio_oferta_centavos!;
  return p.precio_venta_centavos ?? 0;
}

/** El precio tachado, o `null` si no hay nada que tachar. */
export function precioAnterior(p: ConOferta, ahora = new Date()): number | null {
  return enOferta(p, ahora) ? (p.precio_venta_centavos ?? null) : null;
}

/** Cuánto se ahorra, en porcentaje, para el cartelito. */
export function descuentoPct(p: ConOferta, ahora = new Date()): number {
  const antes = precioAnterior(p, ahora);
  if (!antes || antes <= 0) return 0;
  return Math.round(((antes - precioVigente(p, ahora)) / antes) * 100);
}

export type ProductoConOferta = Producto & {
  precio_oferta_centavos: number | null;
  oferta_hasta: string | null;
};
