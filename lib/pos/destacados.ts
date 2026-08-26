"use client";

/**
 * lib/pos/destacados.ts — lo que el mostrador tiene a mano sin buscar.
 *
 * Dos listas:
 *
 * · Los que MÁS SE VENDEN. No es una lista curada a mano ni el orden de las
 *   teclas rápidas que alguien configuró una vez en marzo: sale de las ventas
 *   reales. Un kiosco cambia lo que vende cada estación y la lista se acomoda
 *   sola.
 *
 * · Las OFERTAS vigentes, para que el que cobra sepa que ese producto está en
 *   promoción y no le discuta el precio al cliente que lo vio en la Vidriera.
 *
 * Regla de oro #6: el POS no espera a la red. Las dos listas se resuelven
 * SIEMPRE contra Dexie y devuelven al instante. El ranking del servidor —que
 * es el único que ve las ventas de los otros mostradores— se baja aparte, en
 * segundo plano, y queda cacheado para la próxima. Si no hay red o el kiosco
 * es de un solo mostrador, el cálculo local alcanza y sobra.
 */

import { db } from "@/lib/db/schema";
import { enOferta } from "@/lib/producto";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Producto } from "@/lib/tipos";

const DIAS = 30;
const CLAVE_RANKING = "ranking_vendidos";

type RankingCacheado = { ids: string[]; en: string };

/**
 * Ranking por unidades vendidas.
 *
 * Se cuentan unidades y no importe: lo que sirve tener a un toque es lo que
 * más VECES se cobra, no lo más caro. En un kiosco eso es el cigarrillo y la
 * gaseosa, no el cartón de doce.
 *
 * Los productos que se venden por peso quedan afuera: pasan por la balanza y
 * tocarlos desde una tecla rápida no ahorra ningún paso.
 */
export async function masVendidos(limite = 12): Promise<Producto[]> {
  const delServidor = await db().meta.get(CLAVE_RANKING);
  const ids = (delServidor?.valor as RankingCacheado | undefined)?.ids;

  const ranking = ids?.length ? ids : await rankingLocal(limite * 2);
  if (ranking.length === 0) return [];

  const productos = await db().productos.bulkGet(ranking);
  return productos
    .filter((p): p is Producto => Boolean(p?.activo && p.tipo_venta === "UNIDAD"))
    .slice(0, limite);
}

/** El ranking según lo que se cobró EN ESTE mostrador. Siempre disponible. */
async function rankingLocal(limite: number): Promise<string[]> {
  const desde = new Date(Date.now() - DIAS * 86_400_000).toISOString();

  const ventas = await db().ventas.where("creado_en").aboveOrEqual(desde).toArray();
  const vivas = new Set(ventas.filter((v) => v.estado === "COMPLETADA").map((v) => v.id));
  if (vivas.size === 0) return [];

  const unidades = new Map<string, number>();
  const items = await db().ventas_items.toArray();
  for (const i of items) {
    if (!i.producto_id || !vivas.has(i.venta_id)) continue;
    if (i.tipo_venta === "PESO") continue;
    unidades.set(i.producto_id, (unidades.get(i.producto_id) ?? 0) + i.cantidad);
  }

  return [...unidades.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limite)
    .map(([id]) => id);
}

/**
 * Baja el ranking del servidor y lo deja cacheado. NO se espera: se dispara y
 * la próxima vez que se abra el POS la lista ya está completa.
 *
 * El servidor es el único que ve las ventas de los otros mostradores. Sin
 * esto, en un kiosco con dos cajas cada una mostraría solo lo suyo.
 */
export async function refrescarRankingVendidos(comercioId: string): Promise<void> {
  try {
    const { data, error } = await supabaseBrowser().rpc("mas_vendidos", {
      p_comercio: comercioId,
      p_dias: DIAS,
      p_limite: 24,
    });
    if (error || !data) return;

    const ids = (data as Array<{ producto_id: string }>).map((f) => f.producto_id);
    if (ids.length === 0) return;

    await db().meta.put({ clave: CLAVE_RANKING, valor: { ids, en: new Date().toISOString() } });
  } catch {
    // Sin red no pasa nada: el cálculo local ya cubrió la pantalla.
  }
}

/** Las ofertas que están vigentes en este momento. */
export async function ofertasVigentes(limite = 12): Promise<Producto[]> {
  const productos = await db().productos.toArray();
  return productos
    .filter((p) => p.activo && enOferta(p))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
    .slice(0, limite);
}
