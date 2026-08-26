/**
 * lib/db/outbox.ts — la cola de salida.
 *
 * Todo lo que el POS produce offline se encola acá y se empuja cuando hay red.
 * Reintentos con backoff exponencial (1s, 2s, 4s… tope 5 min, 10 intentos).
 * Los items que agotan los intentos quedan visibles en el diagnóstico:
 * NUNCA se descartan en silencio.
 */

import { ESQUEMAS_OUTBOX, type PayloadVenta } from "./payloads";
import { db, type EstadoOutbox, type OutboxItem, type TipoOutbox } from "./schema";

export type { OutboxItem, TipoOutbox } from "./schema";

export const MAX_INTENTOS = 10;
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_TOPE_MS = 5 * 60_000;

/** Espera antes del intento n (0-based): 1s, 2s, 4s… con tope de 5 min. */
export function esperaBackoff(intentos: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** intentos, BACKOFF_TOPE_MS);
}

export class ErrorValidacionOutbox extends Error {
  constructor(
    public readonly tipo: TipoOutbox,
    public readonly detalle: string,
  ) {
    super(`No se puede encolar "${tipo}": ${detalle}`);
    this.name = "ErrorValidacionOutbox";
  }
}

/**
 * Encola una operación. El `id` del item es el mismo id de la entidad, así el
 * reenvío es idempotente: mandar diez veces la misma venta produce una fila.
 */
export async function encolar(tipo: TipoOutbox, payload: unknown): Promise<OutboxItem> {
  const esquema = ESQUEMAS_OUTBOX[tipo];
  const parseado = esquema.safeParse(payload);
  if (!parseado.success) {
    const detalle = parseado.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join(" · ");
    throw new ErrorValidacionOutbox(tipo, detalle);
  }

  const datos = parseado.data as Record<string, unknown>;
  const id = String(datos.id ?? datos.venta_id ?? crypto.randomUUID());
  const ahora = Date.now();

  const item: OutboxItem = {
    id: tipo === "anulacion" ? `anulacion:${id}` : id,
    tipo,
    payload: parseado.data,
    estado: "pendiente",
    intentos: 0,
    proximoIntento: ahora,
    creadoEn: ahora,
    actualizadoEn: ahora,
  };

  await db().outbox.put(item);
  return item;
}

/** Items listos para intentar ahora (pendientes o en error con la espera cumplida). */
export async function pendientes(ahora = Date.now()): Promise<OutboxItem[]> {
  const todos = await db()
    .outbox.where("estado")
    .anyOf(["pendiente", "error"] satisfies EstadoOutbox[])
    .toArray();
  return todos
    .filter((i) => i.intentos < MAX_INTENTOS && i.proximoIntento <= ahora)
    .sort((a, b) => a.creadoEn - b.creadoEn);
}

/** Cuántas operaciones esperan sincronizar. Alimenta la píldora <EstadoSync>. */
export async function contarPendientes(): Promise<number> {
  return db().outbox.where("estado").anyOf(["pendiente", "enviando", "error"] satisfies EstadoOutbox[]).count();
}

/** Items que agotaron los reintentos: van a la pantalla "Ventas sin sincronizar". */
export async function trabados(): Promise<OutboxItem[]> {
  const enError = await db().outbox.where("estado").equals("error").toArray();
  return enError.filter((i) => i.intentos >= MAX_INTENTOS);
}

export async function marcarEnviando(id: string): Promise<void> {
  await db().outbox.update(id, { estado: "enviando", actualizadoEn: Date.now() });
}

export async function marcarOk(id: string): Promise<void> {
  // Se borra: una vez confirmado por el servidor, el item ya no aporta nada.
  await db().outbox.delete(id);
}

export async function marcarError(id: string, error: unknown): Promise<void> {
  const item = await db().outbox.get(id);
  if (!item) return;
  const intentos = item.intentos + 1;
  await db().outbox.update(id, {
    estado: "error",
    intentos,
    ultimoError: error instanceof Error ? error.message : String(error),
    proximoIntento: Date.now() + esperaBackoff(intentos),
    actualizadoEn: Date.now(),
  });
}

/** Reintento manual desde la pantalla de diagnóstico. */
export async function reintentar(id: string): Promise<void> {
  await db().outbox.update(id, {
    estado: "pendiente",
    intentos: 0,
    proximoIntento: Date.now(),
    actualizadoEn: Date.now(),
  });
}

export async function reintentarTodo(): Promise<number> {
  const rotos = await trabados();
  await Promise.all(rotos.map((i) => reintentar(i.id)));
  return rotos.length;
}

/** Total de plata que todavía no llegó al servidor. Se muestra en el diagnóstico. */
export async function totalSinSincronizar(): Promise<number> {
  const items = await db().outbox.where("tipo").equals("venta").toArray();
  return items.reduce((acc, i) => acc + ((i.payload as PayloadVenta).total_centavos ?? 0), 0);
}

/**
 * Procesa la cola. `enviar` es la función que habla con el servidor; se inyecta
 * para que el outbox no dependa de Supabase y sea testeable sin red.
 */
export async function procesar(
  enviar: (item: OutboxItem) => Promise<void>,
  opciones: { ahora?: number; limite?: number } = {},
): Promise<{ ok: number; error: number }> {
  const { ahora = Date.now(), limite = 50 } = opciones;
  const cola = (await pendientes(ahora)).slice(0, limite);

  let ok = 0;
  let error = 0;

  for (const item of cola) {
    await marcarEnviando(item.id);
    try {
      await enviar(item);
      await marcarOk(item.id);
      ok += 1;
    } catch (e) {
      await marcarError(item.id, e);
      error += 1;
    }
  }

  return { ok, error };
}
