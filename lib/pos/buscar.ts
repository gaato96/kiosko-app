"use client";

/**
 * lib/pos/buscar.ts — el buscador del mostrador.
 *
 * Corre LOCAL sobre Dexie y nunca sale a la red mientras se cobra.
 * Objetivo: menos de 50 ms con 1.000 productos.
 *
 * Para garantizarlo, el catálogo se mantiene en memoria y se refresca cuando
 * cambia: un kiosco tiene entre 300 y 1.500 productos, son unos cientos de kB.
 * Leer IndexedDB en cada tecla sería lo único capaz de romper el presupuesto.
 *
 * Busca sobre `nombre_norm` (sin acentos, en minúsculas) y sobre los alias.
 * El empleado escribe "coca", no "Coca-Cola Sabor Original 500 ml".
 */

import { db, normalizar } from "@/lib/db/schema";
import type { Producto } from "@/lib/tipos";

export type ResultadoBusqueda = Producto & { puntaje: number };

const LIMITE = 40;

type Indice = { productos: Producto[]; alias: string[][]; en: number };
let indice: Indice | null = null;

/** Rearma el índice en memoria. Se llama al abrir el POS y después de cada sync. */
export async function refrescarIndice(): Promise<number> {
  const productos = (await db().productos.toArray()).filter((p) => p.activo);
  indice = {
    productos,
    alias: productos.map((p) => (p.alias ?? []).map(normalizar)),
    en: Date.now(),
  };
  return productos.length;
}

async function asegurarIndice(): Promise<Indice> {
  if (!indice) await refrescarIndice();
  return indice!;
}

export function invalidarIndice(): void {
  indice = null;
}

/**
 * Puntaje simple y predecible:
 *   4 = código de barras exacto
 *   3 = el nombre empieza con lo buscado
 *   2 = un alias empieza con lo buscado
 *   1 = lo contiene en cualquier parte
 * Dentro del mismo puntaje gana el nombre más corto, que casi siempre es el
 * que la persona tenía en la cabeza.
 */
function puntuar(p: Producto, alias: string[], q: string): number {
  if (p.codigo_barras === q) return 4;
  const nombre = p.nombre_norm || normalizar(p.nombre);
  if (nombre.startsWith(q)) return 3;
  if (alias.some((a) => a.startsWith(q))) return 2;
  if (nombre.includes(q)) return 1;
  return 0;
}

export async function buscarProductos(
  consulta: string,
  opciones: { categoriaId?: string | null; limite?: number } = {},
): Promise<ResultadoBusqueda[]> {
  const { categoriaId, limite = LIMITE } = opciones;
  const q = normalizar(consulta);
  const { productos, alias } = await asegurarIndice();

  if (q === "") {
    return productos
      .filter((p) => !categoriaId || p.categoria_id === categoriaId)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
      .slice(0, limite)
      .map((p) => ({ ...p, puntaje: 0 }));
  }

  const encontrados: ResultadoBusqueda[] = [];
  for (let i = 0; i < productos.length; i++) {
    const p = productos[i]!;
    if (categoriaId && p.categoria_id !== categoriaId) continue;
    const puntaje = puntuar(p, alias[i] ?? [], q);
    if (puntaje > 0) encontrados.push({ ...p, puntaje });
  }

  encontrados.sort((a, b) => b.puntaje - a.puntaje || a.nombre.length - b.nombre.length);
  return encontrados.slice(0, limite);
}

/** Lectura directa por código de barras, para el lector que se comporta como teclado. */
export async function porCodigoBarras(codigo: string): Promise<Producto | undefined> {
  return db().productos.where("codigo_barras").equals(codigo).first();
}

export async function productosDeTeclasRapidas(): Promise<Producto[]> {
  const teclas = await db().teclas_rapidas.orderBy("orden").toArray();
  if (teclas.length === 0) return [];
  const productos = await db().productos.bulkGet(teclas.map((t) => t.producto_id));
  return productos.filter((p): p is Producto => Boolean(p?.activo));
}
