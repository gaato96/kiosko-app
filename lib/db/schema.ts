/**
 * lib/db/schema.ts — la base local (IndexedDB vía Dexie).
 *
 * Regla de oro #6: el POS escribe SIEMPRE primero acá y nunca espera a la red.
 * Todo lo que sale de este dispositivo hacia el servidor pasa por el `outbox`.
 */

import Dexie, { type EntityTable } from "dexie";
import type {
  CajaMovimiento,
  CajaSesion,
  Categoria,
  Cliente,
  ConfigComercio,
  MovimientoStock,
  Producto,
  Proveedor,
  TeclaRapida,
  Venta,
  VentaItem,
  VentaPago,
} from "@/lib/tipos";

export type TipoOutbox =
  | "venta"
  | "anulacion"
  | "cobro_cc"
  | "compra"
  | "ajuste_stock"
  | "apertura_caja"
  | "movimiento_caja"
  | "arqueo";

export type EstadoOutbox = "pendiente" | "enviando" | "ok" | "error";

export interface OutboxItem {
  /** UUID v7: el mismo id que la entidad, lo que hace idempotente el reenvío. */
  id: string;
  tipo: TipoOutbox;
  payload: unknown;
  estado: EstadoOutbox;
  intentos: number;
  ultimoError?: string;
  /** epoch ms. Antes de esto no se reintenta (backoff exponencial). */
  proximoIntento: number;
  creadoEn: number;
  actualizadoEn: number;
}

/** Clave-valor para lo suelto: id de dispositivo, cursores de sync, preferencias. */
export interface MetaItem {
  clave: string;
  valor: unknown;
}

/** Proyección local del stock. El servidor es la verdad; esto es lo que se ve mientras no hay red. */
export interface Venta_Local extends Venta {
  /** true mientras la venta todavía no fue confirmada por el servidor. */
  pendiente: boolean;
}

export class KioskoDB extends Dexie {
  productos!: EntityTable<Producto, "id">;
  categorias!: EntityTable<Categoria, "id">;
  proveedores!: EntityTable<Proveedor, "id">;
  clientes!: EntityTable<Cliente, "id">;
  teclas_rapidas!: EntityTable<TeclaRapida, "id">;
  config!: EntityTable<ConfigComercio, "comercio_id">;

  ventas!: EntityTable<Venta_Local, "id">;
  ventas_items!: EntityTable<VentaItem, "id">;
  ventas_pagos!: EntityTable<VentaPago, "id">;
  movimientos_stock!: EntityTable<MovimientoStock, "id">;

  caja_sesiones!: EntityTable<CajaSesion, "id">;
  caja_movimientos!: EntityTable<CajaMovimiento, "id">;

  outbox!: EntityTable<OutboxItem, "id">;
  meta!: EntityTable<MetaItem, "clave">;

  constructor() {
    super("kiosko");

    this.version(1).stores({
      // El índice por nombre_norm es el que sostiene el buscador del POS (<50 ms).
      productos:
        "id, comercio_id, categoria_id, proveedor_id, nombre_norm, codigo_barras, actualizado_en, activo, *alias",
      categorias: "id, comercio_id, orden, actualizado_en",
      proveedores: "id, comercio_id, actualizado_en",
      clientes: "id, comercio_id, nombre, actualizado_en",
      teclas_rapidas: "id, comercio_id, orden",
      config: "comercio_id",

      ventas: "id, comercio_id, creado_en, caja_sesion_id, cliente_id, estado, pendiente",
      ventas_items: "id, venta_id, producto_id",
      ventas_pagos: "id, venta_id, medio",
      movimientos_stock: "id, comercio_id, producto_id, referencia_id, creado_en",

      caja_sesiones: "id, comercio_id, estado, dispositivo_id",
      caja_movimientos: "id, comercio_id, caja_sesion_id, creado_en",

      outbox: "id, estado, tipo, proximoIntento, creadoEn",
      meta: "clave",
    });
  }
}

let _db: KioskoDB | null = null;

/**
 * Acceso perezoso a la base local. No se instancia en el servidor:
 * IndexedDB no existe durante el render de Next.
 */
export function db(): KioskoDB {
  if (typeof indexedDB === "undefined") {
    throw new Error("La base local solo existe en el navegador");
  }
  if (!_db) _db = new KioskoDB();
  return _db;
}

/** Solo para tests: permite inyectar una instancia limpia. */
export function _resetDb(): void {
  _db = null;
}

/** Normaliza un texto para buscar: sin acentos, en minúsculas. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// ---------------------------------------------------------------------------
// meta
// ---------------------------------------------------------------------------

export async function leerMeta<T>(clave: string): Promise<T | undefined> {
  const fila = await db().meta.get(clave);
  return fila?.valor as T | undefined;
}

export async function escribirMeta(clave: string, valor: unknown): Promise<void> {
  await db().meta.put({ clave, valor });
}
