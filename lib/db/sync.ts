"use client";

/**
 * lib/db/sync.ts — sincronización en dos direcciones.
 *
 *   PULL  incremental por `actualizado_en`: productos, categorías, proveedores,
 *         clientes, config y teclas rápidas bajan a Dexie.
 *   PUSH  el outbox se vacía contra las RPC del servidor, que son idempotentes
 *         por el id generado en el cliente.
 *
 * Nada de esto está en el camino crítico del cobro. El POS ya escribió en
 * IndexedDB antes de que esto corra.
 */

import { COLUMNAS_PRODUCTO } from "@/lib/columnas";
import type { Categoria, Cliente, ConfigComercio, Producto, Proveedor, TeclaRapida } from "@/lib/tipos";
import { procesar, type OutboxItem } from "./outbox";
import { db, escribirMeta, leerMeta } from "./schema";

/** Época cero para el primer pull. */
const DESDE_SIEMPRE = "1970-01-01T00:00:00.000Z";

type TablaSincronizable = "categorias" | "proveedores" | "clientes";

// "productos" y "teclas_rapidas" se bajan aparte: productos porque necesita
// columnas explícitas (privilegio por columna), teclas_rapidas porque no tiene
// actualizado_en y se trae entera.
const TABLAS: TablaSincronizable[] = ["categorias", "proveedores", "clientes"];

function claveCursor(tabla: string): string {
  return `cursor:${tabla}`;
}

export interface ResultadoSync {
  bajados: number;
  subidos: number;
  errores: number;
  en: number;
}

/**
 * Trae de Supabase todo lo que cambió desde el último pull de cada tabla.
 * Es incremental: la segunda corrida de un kiosco con 1.000 productos baja 0 filas.
 */
/**
 * Supabase entra por import dinámico a propósito: el POS tiene un presupuesto
 * de bundle estricto (< 200 kB de First Load JS) y el cliente de Supabase pesa
 * más que todo el resto del mostrador junto. Acá no molesta, porque nada de
 * esto corre en el camino crítico del cobro.
 */
async function cliente() {
  const { supabaseBrowser } = await import("@/lib/supabase/browser");
  return supabaseBrowser();
}

export async function pull(comercioId: string): Promise<number> {
  const sb = await cliente();
  let total = 0;

  // teclas_rapidas no tiene actualizado_en: es chica, se trae entera.
  {
    const { data, error } = await sb.from("teclas_rapidas").select("*").eq("comercio_id", comercioId);
    if (error) throw error;
    await db().transaction("rw", db().teclas_rapidas, async () => {
      await db().teclas_rapidas.where("comercio_id").equals(comercioId).delete();
      await db().teclas_rapidas.bulkPut((data ?? []) as TeclaRapida[]);
    });
    total += data?.length ?? 0;
  }

  for (const tabla of TABLAS) {
    const desde = (await leerMeta<string>(claveCursor(tabla))) ?? DESDE_SIEMPRE;

    const { data, error } = await sb
      .from(tabla)
      .select("*")
      .eq("comercio_id", comercioId)
      .gt("actualizado_en", desde)
      .order("actualizado_en", { ascending: true })
      .limit(2000);

    if (error) throw error;
    const filas = data ?? [];
    if (filas.length === 0) continue;

    switch (tabla) {
      case "categorias":
        await db().categorias.bulkPut(filas as Categoria[]);
        break;
      case "proveedores":
        await db().proveedores.bulkPut(filas as Proveedor[]);
        break;
      case "clientes":
        await db().clientes.bulkPut(filas as Cliente[]);
        break;
    }

    const ultima = filas[filas.length - 1] as { actualizado_en?: string } | undefined;
    if (ultima?.actualizado_en) await escribirMeta(claveCursor(tabla), ultima.actualizado_en);
    total += filas.length;
  }

  // `productos` tiene privilegio por columna en la base (los costos no viajan
  // al empleado): un `select("*")` ahí lo rechaza Postgres entero en vez de
  // recortarlo, así que se piden las columnas explícitas.
  {
    const desde = (await leerMeta<string>(claveCursor("productos"))) ?? DESDE_SIEMPRE;
    const { data, error } = await sb
      .from("productos")
      .select(COLUMNAS_PRODUCTO)
      .eq("comercio_id", comercioId)
      .gt("actualizado_en", desde)
      .order("actualizado_en", { ascending: true })
      .limit(2000);

    if (error) throw error;
    const filas = (data ?? []) as unknown as Producto[];
    if (filas.length > 0) {
      await db().productos.bulkPut(filas);
      const ultima = filas[filas.length - 1];
      if (ultima?.actualizado_en) await escribirMeta(claveCursor("productos"), ultima.actualizado_en);
      total += filas.length;
    }
  }

  // Repesca de números de venta.
  //
  // El número lo pone el servidor y vuelve en la respuesta de `sync_venta`.
  // Si esa respuesta se perdió —se cortó la red justo después de escribir, o
  // la venta se sincronizó con una versión vieja del cliente que la
  // descartaba— la venta queda bien en la base y en el mostrador se sigue
  // leyendo "Sin número todavía". Esto lo repara solo.
  {
    const huerfanas = await db()
      .ventas.filter((v) => v.numero == null && !v.pendiente)
      .limit(50)
      .toArray();

    if (huerfanas.length > 0) {
      const { data: numeradas } = await sb
        .from("ventas")
        .select("id, numero")
        .in("id", huerfanas.map((v) => v.id));

      for (const fila of numeradas ?? []) {
        if (fila.numero != null) await db().ventas.update(fila.id, { numero: fila.numero });
      }
    }
  }

  // La config es una sola fila; se trae siempre.
  const { data: config, error: errorConfig } = await sb
    .from("config_comercio")
    .select("*")
    .eq("comercio_id", comercioId)
    .maybeSingle();
  if (errorConfig) throw errorConfig;
  if (config) {
    await db().config.put(config as ConfigComercio);
    total += 1;
  }

  await escribirMeta("ultimo_pull", new Date().toISOString());
  return total;
}

/** Cada tipo del outbox conoce su RPC. Todas son idempotentes por id. */
const RPC_POR_TIPO = {
  venta: "sync_venta",
  anulacion: "anular_venta",
  cobro_cc: "registrar_cobro_cc",
  compra: "aplicar_compra",
  ajuste_stock: "registrar_ajuste_stock",
  apertura_caja: "abrir_caja",
  movimiento_caja: "registrar_movimiento_caja",
  arqueo: "cerrar_caja",
} as const satisfies Record<OutboxItem["tipo"], string>;

type RpcOutbox = (typeof RPC_POR_TIPO)[OutboxItem["tipo"]];

/**
 * supabase-js no distribuye una unión de nombres de RPC sobre sus Args, así que
 * la unión colapsa a `never`. Todas estas RPC tienen la misma firma
 * (`payload jsonb`), por eso se estrecha a una de ellas para la llamada.
 */
function llamarRpc(sb: Awaited<ReturnType<typeof cliente>>, nombre: RpcOutbox, payload: unknown) {
  return sb.rpc(nombre as "sync_venta", { payload });
}

export async function push(): Promise<{ ok: number; error: number }> {
  const sb = await cliente();

  return procesar(async (item) => {
    const rpc = RPC_POR_TIPO[item.tipo];
    if (!rpc) throw new Error(`Tipo de outbox sin RPC: ${item.tipo}`);
    const { data, error } = await llamarRpc(sb, rpc, item.payload);
    if (error) throw new Error(`${rpc}: ${error.message}`);

    if (item.tipo === "venta") {
      // El NÚMERO lo asigna el servidor: la venta se crea offline sin él y
      // `sync_venta` lo devuelve al confirmarla. Antes esa respuesta se
      // descartaba, así que el ticket quedaba en "Sin número todavía" para
      // siempre, incluso con la venta ya sincronizada y numerada en la base.
      const respuesta = data as { numero?: number | null } | null;
      await db().ventas.update(item.id, {
        pendiente: false,
        ...(respuesta?.numero != null ? { numero: respuesta.numero } : {}),
      });
    }
  });
}

let corriendo = false;

/** Un ciclo completo. Se ignora si ya hay uno en curso o si no hay red. */
export async function sincronizar(comercioId: string): Promise<ResultadoSync | null> {
  if (corriendo) return null;
  if (typeof navigator !== "undefined" && !navigator.onLine) return null;

  corriendo = true;
  try {
    const { ok, error } = await push();
    const bajados = await pull(comercioId);
    // El POS escucha esto para rearmar el índice del buscador.
    if (bajados > 0 && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("kiosko:sincronizado", { detail: { bajados } }));
    }
    return { bajados, subidos: ok, errores: error, en: Date.now() };
  } finally {
    corriendo = false;
  }
}

/**
 * Arranca el sincronizador de fondo: al recuperar la red, al volver a la
 * pestaña, y cada `intervaloMs`. Devuelve la función para desmontarlo.
 */
export function iniciarSyncAutomatico(comercioId: string, intervaloMs = 30_000): () => void {
  const disparar = () => {
    void sincronizar(comercioId).catch(() => {
      // Los errores ya quedan registrados por item en el outbox.
    });
  };

  disparar();
  const timer = setInterval(disparar, intervaloMs);
  const alVolver = () => {
    if (document.visibilityState === "visible") disparar();
  };

  window.addEventListener("online", disparar);
  document.addEventListener("visibilitychange", alVolver);

  return () => {
    clearInterval(timer);
    window.removeEventListener("online", disparar);
    document.removeEventListener("visibilitychange", alVolver);
  };
}
