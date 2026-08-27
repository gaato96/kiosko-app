"use client";

/**
 * lib/pos/clientes.ts — cuentas corrientes en el mostrador.
 *
 * El bloqueo por límite tiene un valor que no es técnico: le saca al empleado la
 * responsabilidad de decir que no. No es "no te fío", es "no me deja el sistema".
 */

import { uuidv7 } from "uuidv7";
import { encolar } from "@/lib/db/outbox";
import { db, normalizar } from "@/lib/db/schema";
import type { Cliente, MedioPago } from "@/lib/tipos";

export type EstadoCuenta = "al-dia" | "con-deuda" | "cerca-del-limite" | "al-limite" | "a-favor";

export function estadoDeCuenta(cliente: Cliente): EstadoCuenta {
  const { saldo_centavos: saldo, limite_credito_centavos: limite } = cliente;
  if (saldo < 0) return "a-favor";
  if (saldo === 0) return "al-dia";
  if (limite <= 0) return "al-limite";
  if (saldo >= limite) return "al-limite";
  if (saldo >= limite * 0.8) return "cerca-del-limite";
  return "con-deuda";
}

export const ETIQUETAS_ESTADO: Record<EstadoCuenta, { texto: string; clase: string }> = {
  "al-dia": { texto: "Al día", clase: "text-success" },
  "a-favor": { texto: "Saldo a favor", clase: "text-success" },
  "con-deuda": { texto: "Con deuda", clase: "text-text-muted" },
  "cerca-del-limite": { texto: "Cerca del límite", clase: "text-warning" },
  "al-limite": { texto: "Al límite", clase: "text-danger" },
};

export function disponibleDe(cliente: Cliente): number {
  return Math.max(0, cliente.limite_credito_centavos - cliente.saldo_centavos);
}

/**
 * Los datos de un cliente pueden estar viejos si el dispositivo estuvo sin red.
 * Con datos de más de 15 minutos el bloqueo duro pasa a ser una ADVERTENCIA:
 * impedir una venta legítima por un saldo desactualizado es peor que el riesgo
 * que se quiere evitar. Ver docs/03-modulos/06-cuentas-corrientes.md §6.
 */
export const FRESCURA_PARA_BLOQUEO_MS = 15 * 60_000;

export type Veredicto = {
  /** 'permite' | 'advierte' | 'bloquea' */
  resultado: "permite" | "advierte" | "bloquea";
  disponible: number;
  antiguedadMs: number;
  mensaje?: string;
};

export function evaluarFiado(cliente: Cliente, montoCentavos: number, ahora = Date.now()): Veredicto {
  const disponible = disponibleDe(cliente);
  const antiguedadMs = ahora - new Date(cliente.actualizado_en).getTime();
  const entra = montoCentavos <= disponible;

  if (cliente.limite_credito_centavos <= 0) {
    return {
      resultado: "bloquea",
      disponible: 0,
      antiguedadMs,
      mensaje: `${cliente.nombre} no tiene crédito habilitado.`,
    };
  }

  if (entra) return { resultado: "permite", disponible, antiguedadMs };

  const datosViejos = antiguedadMs > FRESCURA_PARA_BLOQUEO_MS;
  return {
    resultado: datosViejos ? "advierte" : "bloquea",
    disponible,
    antiguedadMs,
    mensaje: datosViejos
      ? `El saldo de ${cliente.nombre} es de hace un rato y puede estar desactualizado.`
      : `${cliente.nombre} llegó al límite.`,
  };
}

/** "hace 3 h" para el badge de la tarjeta del cliente. */
export function antiguedadTexto(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

export async function buscarClientes(consulta: string, limite = 30): Promise<Cliente[]> {
  const q = normalizar(consulta);
  const todos = await db().clientes.toArray();
  const activos = todos.filter((c) => c.activo);
  if (q === "") {
    return activos
      .sort((a, b) => b.saldo_centavos - a.saldo_centavos || a.nombre.localeCompare(b.nombre, "es"))
      .slice(0, limite);
  }
  return activos.filter((c) => normalizar(c.nombre).includes(q)).slice(0, limite);
}

/**
 * Trae los clientes del servidor a la base local.
 *
 * Lo normal es que ya estén: el sincronizador los baja cada 30 segundos. Pero
 * un dispositivo recién vinculado —o uno donde el primer pull se cortó— abría
 * "Fiar a" con la lista VACÍA y sin ninguna explicación, y desde el mostrador
 * eso se ve exactamente igual que un sistema roto. Esto es la red de
 * contención: si localmente no hay nadie, se pregunta una vez.
 *
 * Devuelve cuántos quedaron guardados. Si no hay red, devuelve null: no es un
 * error, es un kiosco sin internet, que es el caso para el que está hecho todo
 * lo demás.
 */
export async function refrescarClientes(comercioId: string): Promise<number | null> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return null;

  const { supabaseBrowser } = await import("@/lib/supabase/browser");
  const { data, error } = await supabaseBrowser()
    .from("clientes")
    .select("*")
    .eq("comercio_id", comercioId)
    .eq("activo", true)
    .order("nombre")
    .limit(2000);

  if (error) throw error;

  const filas = (data ?? []) as Cliente[];
  if (filas.length > 0) await db().clientes.bulkPut(filas);
  return filas.length;
}

/**
 * Registrar un cobro.
 *
 * Si es en efectivo y hay caja abierta, el servidor inserta también un INGRESO
 * de caja. SIN ESE PASO EL ARQUEO CIERRA MAL, y es el error más común de los
 * sistemas que tienen fiados.
 */
export async function registrarCobro(datos: {
  comercioId: string;
  clienteId: string;
  montoCentavos: number;
  medio: MedioPago;
  cajaSesionId: string | null;
  nota?: string | null;
  usuarioId: string | null;
}): Promise<void> {
  const id = uuidv7();
  const creadoEn = new Date().toISOString();

  await db().transaction("rw", [db().clientes, db().outbox], async () => {
    // Proyección local del saldo: el trigger del servidor es la verdad.
    const cliente = await db().clientes.get(datos.clienteId);
    if (cliente) {
      await db().clientes.update(datos.clienteId, {
        saldo_centavos: cliente.saldo_centavos - datos.montoCentavos,
        actualizado_en: creadoEn,
      });
    }

    await encolar("cobro_cc", {
      id,
      comercio_id: datos.comercioId,
      cliente_id: datos.clienteId,
      monto_centavos: datos.montoCentavos,
      medio: datos.medio,
      caja_sesion_id: datos.cajaSesionId,
      nota: datos.nota ?? null,
      usuario_id: datos.usuarioId,
      creado_en: creadoEn,
    });
  });
}

/** Alta express de cliente sin salir del cobro: nombre, teléfono y límite. */
export async function crearClienteExpress(datos: {
  comercioId: string;
  nombre: string;
  telefono: string | null;
  limiteCreditoCentavos: number;
}): Promise<Cliente> {
  const cliente: Cliente = {
    id: uuidv7(),
    comercio_id: datos.comercioId,
    nombre: datos.nombre.trim(),
    telefono: datos.telefono,
    direccion: null,
    limite_credito_centavos: datos.limiteCreditoCentavos,
    saldo_centavos: 0,
    notas: null,
    activo: true,
    actualizado_en: new Date().toISOString(),
  };

  await db().clientes.put(cliente);

  if (typeof navigator !== "undefined" && navigator.onLine) {
    const { supabaseBrowser } = await import("@/lib/supabase/browser");
    await supabaseBrowser().from("clientes").insert({
      id: cliente.id,
      comercio_id: cliente.comercio_id,
      nombre: cliente.nombre,
      telefono: cliente.telefono,
      limite_credito_centavos: cliente.limite_credito_centavos,
    });
  }

  return cliente;
}
