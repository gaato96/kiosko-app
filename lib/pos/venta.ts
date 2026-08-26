"use client";

/**
 * lib/pos/venta.ts — cerrar una venta.
 *
 * Regla de oro #6: se escribe PRIMERO en IndexedDB y no se espera a la red.
 * Si alguna línea de este archivo hiciera `await fetch()` antes de devolverle
 * el control a la pantalla, el módulo estaría mal implementado.
 *
 * El orden es siempre el mismo:
 *   1. UUID v7 en el cliente (idempotencia)
 *   2. venta + items + pagos en Dexie
 *   3. deltas de stock locales (proyección, el servidor recalcula del libro mayor)
 *   4. una entrada en el outbox
 *   5. recién ahí, si hay red, el sincronizador empuja
 */

import { uuidv7 } from "uuidv7";
import { encolar } from "@/lib/db/outbox";
import type { PayloadVenta } from "@/lib/db/payloads";
import { db } from "@/lib/db/schema";
import type { LineaTicket, PagoTicket } from "@/lib/store/ticket";
import type { MovimientoStock, VentaItem, VentaPago } from "@/lib/tipos";

export type DatosVenta = {
  comercioId: string;
  usuarioId: string | null;
  dispositivoId: string | null;
  cajaSesionId: string | null;
  clienteId: string | null;
  lineas: LineaTicket[];
  pagos: PagoTicket[];
  descuentoCentavos: number;
};

export type VentaGuardada = {
  id: string;
  totalCentavos: number;
  vueltoCentavos: number;
  creadoEn: string;
};

export async function cerrarVenta(datos: DatosVenta): Promise<VentaGuardada> {
  const ventaId = uuidv7();
  const creadoEn = new Date().toISOString();

  const subtotal = datos.lineas.reduce((a, l) => a + l.totalCentavos, 0);
  const total = Math.max(0, subtotal - datos.descuentoCentavos);

  if (datos.lineas.length === 0) throw new Error("El ticket está vacío");

  const sumaPagos = datos.pagos.reduce((a, p) => a + p.montoCentavos, 0);
  if (sumaPagos !== total) {
    throw new Error("Los pagos no cubren el total");
  }

  const items: VentaItem[] = datos.lineas.map((l) => ({
    id: uuidv7(),
    venta_id: ventaId,
    producto_id: l.productoId,
    descripcion: l.descripcion,
    tipo_venta: l.tipoVenta,
    cantidad: l.cantidad,
    precio_unitario_centavos: l.precioUnitarioCentavos,
    // El costo lo completa el servidor: el empleado no puede leer los costos,
    // así que tampoco puede mandarlos. Ver sync_venta en supabase/schema.sql.
    costo_unitario_centavos: 0,
    total_centavos: l.totalCentavos,
  }));

  const pagos: VentaPago[] = datos.pagos.map((p) => ({
    id: p.id || uuidv7(),
    venta_id: ventaId,
    medio: p.medio,
    monto_centavos: p.montoCentavos,
    recibido_centavos: p.recibidoCentavos ?? null,
    vuelto_centavos: p.vueltoCentavos ?? null,
    referencia: p.referencia ?? null,
  }));

  const movimientos: MovimientoStock[] = datos.lineas
    .filter((l) => l.productoId && !l.esServicio)
    .map((l) => ({
      id: uuidv7(),
      comercio_id: datos.comercioId,
      producto_id: l.productoId!,
      // Regla de oro #3: el cliente manda un DELTA, nunca un stock absoluto.
      delta: -l.cantidad,
      motivo: "VENTA",
      referencia_id: ventaId,
      nota: null,
      usuario_id: datos.usuarioId,
      creado_en: creadoEn,
    }));

  const payload: PayloadVenta = {
    id: ventaId,
    comercio_id: datos.comercioId,
    usuario_id: datos.usuarioId,
    dispositivo_id: datos.dispositivoId,
    caja_sesion_id: datos.cajaSesionId,
    cliente_id: datos.clienteId,
    subtotal_centavos: subtotal,
    descuento_centavos: datos.descuentoCentavos,
    total_centavos: total,
    costo_total_centavos: 0,
    origen: "POS",
    creado_en: creadoEn,
    items: items.map((i) => ({
      id: i.id,
      producto_id: i.producto_id,
      descripcion: i.descripcion,
      tipo_venta: i.tipo_venta,
      cantidad: i.cantidad,
      precio_unitario_centavos: i.precio_unitario_centavos,
      costo_unitario_centavos: 0,
      total_centavos: i.total_centavos,
    })),
    pagos: pagos.map((p) => ({
      id: p.id,
      medio: p.medio,
      monto_centavos: p.monto_centavos,
      recibido_centavos: p.recibido_centavos,
      vuelto_centavos: p.vuelto_centavos,
      referencia: p.referencia,
    })),
  };

  // Todo en una sola transacción local: o queda la venta entera o no queda nada.
  await db().transaction(
    "rw",
    [db().ventas, db().ventas_items, db().ventas_pagos, db().movimientos_stock, db().productos, db().outbox],
    async () => {
      await db().ventas.put({
        id: ventaId,
        comercio_id: datos.comercioId,
        numero: null, // lo asigna el servidor al sincronizar
        usuario_id: datos.usuarioId,
        dispositivo_id: datos.dispositivoId,
        caja_sesion_id: datos.cajaSesionId,
        cliente_id: datos.clienteId,
        subtotal_centavos: subtotal,
        descuento_centavos: datos.descuentoCentavos,
        total_centavos: total,
        costo_total_centavos: 0,
        estado: "COMPLETADA",
        origen: "POS",
        anulada_por: null,
        anulada_en: null,
        motivo_anulacion: null,
        creado_en: creadoEn,
        pendiente: true,
      });

      await db().ventas_items.bulkPut(items);
      await db().ventas_pagos.bulkPut(pagos);
      await db().movimientos_stock.bulkPut(movimientos);

      // Proyección local del stock. La verdad la reconstruye el servidor sumando
      // el libro mayor; esto es lo que se ve mientras no hay red.
      for (const m of movimientos) {
        const p = await db().productos.get(m.producto_id);
        if (p?.controla_stock) {
          await db().productos.update(m.producto_id, { stock_actual: p.stock_actual + m.delta });
        }
      }

      await encolar("venta", payload);
    },
  );

  const vuelto = datos.pagos.reduce((a, p) => a + (p.vueltoCentavos ?? 0), 0);
  return { id: ventaId, totalCentavos: total, vueltoCentavos: vuelto, creadoEn };
}

/**
 * Anular. Nunca borra: encola una anulación que el servidor procesa revirtiendo
 * stock y cuenta corriente, y dejando la fila en `auditoria`.
 */
export async function anularVenta(datos: {
  ventaId: string;
  motivo: string;
  usuarioId: string | null;
  /** Vale de `autorizar_accion`. El PIN nunca se guarda en el dispositivo. */
  autorizacionId: string | null;
  autorizadoPor: string | null;
  autorizadaOffline: boolean;
}): Promise<void> {
  const anuladaEn = new Date().toISOString();

  await db().transaction("rw", [db().ventas, db().outbox], async () => {
    await db().ventas.update(datos.ventaId, {
      estado: "ANULADA",
      anulada_en: anuladaEn,
      anulada_por: datos.autorizadoPor,
      motivo_anulacion: datos.motivo,
      pendiente: true,
    });

    await encolar("anulacion", {
      venta_id: datos.ventaId,
      motivo: datos.motivo,
      usuario_id: datos.usuarioId,
      anulada_en: anuladaEn,
      autorizacion_id: datos.autorizacionId,
      autorizado_por: datos.autorizadoPor,
      autorizada_offline: datos.autorizadaOffline,
    });
  });
}
