"use client";

/**
 * lib/pos/caja.ts — apertura, movimientos y cierre.
 *
 * El arqueo es CIEGO: este archivo nunca calcula el efectivo esperado.
 * Lo calcula el servidor dentro de `cerrar_caja` y solo se lo devuelve al dueño.
 * No es que la UI lo esconda: el dato no viaja.
 */

import { uuidv7 } from "uuidv7";
import { encolar } from "@/lib/db/outbox";
import { db } from "@/lib/db/schema";
import type { CajaSesion, TipoCajaMov } from "@/lib/tipos";

export type DatosApertura = {
  comercioId: string;
  dispositivoId: string | null;
  usuarioId: string | null;
  fondoInicialCentavos: number;
};

export async function abrirCaja(datos: DatosApertura): Promise<CajaSesion> {
  const id = uuidv7();
  const abiertaEn = new Date().toISOString();

  const sesion: CajaSesion = {
    id,
    comercio_id: datos.comercioId,
    dispositivo_id: datos.dispositivoId,
    usuario_id: datos.usuarioId,
    fondo_inicial_centavos: datos.fondoInicialCentavos,
    estado: "ABIERTA",
    abierta_en: abiertaEn,
    cerrada_en: null,
  };

  await db().transaction("rw", [db().caja_sesiones, db().outbox], async () => {
    await db().caja_sesiones.put(sesion);
    await encolar("apertura_caja", {
      id,
      comercio_id: datos.comercioId,
      dispositivo_id: datos.dispositivoId,
      usuario_id: datos.usuarioId,
      fondo_inicial_centavos: datos.fondoInicialCentavos,
      abierta_en: abiertaEn,
    });
  });

  return sesion;
}

/** La caja abierta de este dispositivo, si la hay. */
export async function cajaAbierta(dispositivoId: string | null): Promise<CajaSesion | undefined> {
  const abiertas = await db().caja_sesiones.where("estado").equals("ABIERTA").toArray();
  return abiertas.find((c) => !dispositivoId || c.dispositivo_id === dispositivoId);
}

/**
 * Movimientos manuales de caja. Tienen que estar a dos toques del POS: si
 * registrar un pago a proveedor es un trámite, el empleado no lo registra y la
 * caja no cierra nunca.
 */
export const MOTIVOS_EGRESO = [
  "Pago a proveedor",
  "Retiro del dueño",
  "Gasto (flete, limpieza)",
  "Vuelto que faltó",
] as const;

export const MOTIVOS_INGRESO = ["Aporte de efectivo", "Cobro de fiado", "Otro"] as const;

export async function registrarMovimientoCaja(datos: {
  comercioId: string;
  cajaSesionId: string;
  tipo: TipoCajaMov;
  motivo: string;
  montoCentavos: number;
  usuarioId: string | null;
}): Promise<void> {
  const id = uuidv7();
  const creadoEn = new Date().toISOString();

  await db().transaction("rw", [db().caja_movimientos, db().outbox], async () => {
    await db().caja_movimientos.put({
      id,
      comercio_id: datos.comercioId,
      caja_sesion_id: datos.cajaSesionId,
      tipo: datos.tipo,
      motivo: datos.motivo,
      monto_centavos: datos.montoCentavos,
      usuario_id: datos.usuarioId,
      creado_en: creadoEn,
    });

    await encolar("movimiento_caja", {
      id,
      comercio_id: datos.comercioId,
      caja_sesion_id: datos.cajaSesionId,
      tipo: datos.tipo,
      motivo: datos.motivo,
      monto_centavos: datos.montoCentavos,
      usuario_id: datos.usuarioId,
      creado_en: creadoEn,
    });
  });
}

/** Los billetes que se cuentan en el desglose del arqueo. */
export const BILLETES_ARQUEO = [
  2000000, 1000000, 500000, 200000, 100000, 50000, 20000, 10000,
] as const;

/**
 * Cierra la caja con el efectivo declarado.
 *
 * Sin conexión el cierre igual funciona: se guarda y se encola. El empleado no
 * ve el esperado en ningún caso, así que el flujo es idéntico con o sin red.
 */
export async function cerrarCaja(datos: {
  comercioId: string;
  cajaSesionId: string;
  declaradoCentavos: number;
  desglose: Record<string, number>;
  declaradoPor: string | null;
}): Promise<void> {
  const id = uuidv7();
  const declaradoEn = new Date().toISOString();

  await db().transaction("rw", [db().caja_sesiones, db().outbox], async () => {
    await db().caja_sesiones.update(datos.cajaSesionId, {
      estado: "CERRADA",
      cerrada_en: declaradoEn,
    });

    await encolar("arqueo", {
      id,
      comercio_id: datos.comercioId,
      caja_sesion_id: datos.cajaSesionId,
      declarado_centavos: datos.declaradoCentavos,
      desglose: datos.desglose,
      declarado_por: datos.declaradoPor,
      declarado_en: declaradoEn,
    });
  });
}

/** Suma un desglose de billetes: {"20000": 3, "10000": 5} -> centavos. */
export function totalDesglose(desglose: Record<string, number>): number {
  return Object.entries(desglose).reduce(
    (acc, [billete, cantidad]) => acc + Number(billete) * (cantidad || 0),
    0,
  );
}
