"use client";

/**
 * Operadores del mostrador.
 *
 * El cambio de operador tiene que funcionar sin conexión: si el kiosco se queda
 * sin internet a las 3 de la tarde, el turno de la tarde igual tiene que poder
 * empezar. Por eso la lista se cachea en Dexie.
 *
 * La validación del PIN va SIEMPRE al servidor cuando hay red (`validar_pin`).
 * Sin red se valida contra el hash cacheado; es el compromiso documentado en
 * docs/03-modulos/01-auth-rbac.md.
 */

/** Import dinámico: ver la nota de presupuesto de bundle en lib/db/sync.ts. */
async function cliente() {
  const { supabaseBrowser } = await import("@/lib/supabase/browser");
  return supabaseBrowser();
}
import type { Rol } from "@/lib/tipos";
import { escribirMeta, leerMeta } from "./schema";

export type OperadorCacheado = { id: string; nombre: string; rol: Rol };

const CLAVE = "operadores";

export async function refrescarOperadores(comercioId: string): Promise<OperadorCacheado[]> {
  const { data, error } = await (await cliente())
    .from("usuarios_comercio")
    .select("id, nombre, rol")
    .eq("comercio_id", comercioId)
    .eq("activo", true)
    .order("nombre");

  if (error) throw error;
  const lista = (data ?? []) as OperadorCacheado[];
  await escribirMeta(CLAVE, lista);
  return lista;
}

export async function operadoresCacheados(): Promise<OperadorCacheado[]> {
  return (await leerMeta<OperadorCacheado[]>(CLAVE)) ?? [];
}

export type ResultadoPin = { ok: boolean; offline: boolean; motivo?: string };

/** Valida el PIN de un operador. Con red, contra el servidor. */
export async function validarPin(usuarioId: string, pin: string): Promise<ResultadoPin> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, offline: true, motivo: "sin-conexion" };
  }
  const { data, error } = await (await cliente()).rpc("validar_pin", {
    p_usuario_id: usuarioId,
    p_pin: pin,
  });
  if (error) return { ok: false, offline: true, motivo: error.message };
  return { ok: data === true, offline: false };
}

/** PIN del dueño para autorizar una acción sensible. */
export async function validarPinDueno(usuarioId: string, pin: string): Promise<ResultadoPin> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, offline: true, motivo: "sin-conexion" };
  }
  const { data, error } = await (await cliente()).rpc("validar_pin_dueno", {
    p_usuario_id: usuarioId,
    p_pin: pin,
  });
  if (error) return { ok: false, offline: true, motivo: error.message };
  return { ok: data === true, offline: false };
}

/**
 * Pide un vale de autorización al servidor. El dueño pone el PIN una vez, el
 * servidor lo valida, escribe en `auditoria` y devuelve un uuid que caduca a
 * los 15 minutos. Lo que se guarda en el outbox es ese uuid, nunca el PIN.
 */
export async function autorizarAccion(
  usuarioId: string,
  pin: string,
  accion: "anular_venta" | "descuento" | "exceder_credito",
  detalle?: Record<string, unknown>,
): Promise<{ id: string | null; offline: boolean; motivo?: string }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { id: null, offline: true, motivo: "sin-conexion" };
  }
  const { data, error } = await (await cliente()).rpc("autorizar_accion", {
    p_usuario_id: usuarioId,
    p_pin: pin,
    p_accion: accion,
    p_detalle: detalle ?? null,
  });
  if (error) {
    // "PIN incorrecto" es una respuesta del servidor, no una falta de red.
    const pinMal = /pin/i.test(error.message);
    return { id: null, offline: !pinMal, motivo: error.message };
  }
  return { id: data as string, offline: false };
}
