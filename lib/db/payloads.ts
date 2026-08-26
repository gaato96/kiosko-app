/**
 * lib/db/payloads.ts — contratos Zod de todo lo que viaja del dispositivo al
 * servidor. Se validan ANTES de encolar en el outbox: una venta malformada
 * tiene que fallar en el mostrador, no tres horas después contra la RPC.
 *
 * Estos mismos esquemas se usan del lado del servidor para validar la entrada.
 */

import { z } from "zod";

const uuid = z.string().uuid();
const centavosPositivos = z.number().int().nonnegative();
const fechaIso = z.string().datetime({ offset: true });

export const zTipoVenta = z.enum(["UNIDAD", "PESO"]);
export const zMedioPago = z.enum([
  "EFECTIVO",
  "TRANSFERENCIA",
  "DEBITO",
  "CREDITO",
  "QR",
  "FIADO",
]);
export const zMotivoStock = z.enum([
  "VENTA",
  "COMPRA",
  "AJUSTE",
  "MERMA",
  "ROTURA",
  "VENCIMIENTO",
  "CONSUMO_INTERNO",
  "DEVOLUCION",
  "CARGA_INICIAL",
  "ANULACION",
]);

export const zVentaItem = z.object({
  id: uuid,
  producto_id: uuid.nullable(),
  descripcion: z.string().min(1),
  tipo_venta: zTipoVenta,
  /** Unidades o GRAMOS. Entero, siempre. */
  cantidad: z.number().int().positive(),
  /** Por unidad o por KILO. Congelado al momento de la venta. */
  precio_unitario_centavos: centavosPositivos,
  costo_unitario_centavos: centavosPositivos,
  total_centavos: centavosPositivos,
});

export const zVentaPago = z.object({
  id: uuid,
  medio: zMedioPago,
  monto_centavos: centavosPositivos,
  recibido_centavos: centavosPositivos.nullable().optional(),
  vuelto_centavos: centavosPositivos.nullable().optional(),
  referencia: z.string().max(64).nullable().optional(),
});

export const zVenta = z
  .object({
    id: uuid,
    comercio_id: uuid,
    usuario_id: uuid.nullable(),
    dispositivo_id: uuid.nullable(),
    caja_sesion_id: uuid.nullable(),
    cliente_id: uuid.nullable(),

    subtotal_centavos: centavosPositivos,
    descuento_centavos: centavosPositivos,
    total_centavos: centavosPositivos,
    costo_total_centavos: centavosPositivos,

    origen: z.enum(["POS", "VIDRIERA"]).default("POS"),
    creado_en: fechaIso,

    items: z.array(zVentaItem).min(1, "Una venta sin items no es una venta"),
    pagos: z.array(zVentaPago).min(1, "Falta registrar cómo se pagó"),
  })
  .refine((v) => v.pagos.reduce((a, p) => a + p.monto_centavos, 0) === v.total_centavos, {
    message: "Los pagos no suman el total de la venta",
    path: ["pagos"],
  })
  .refine((v) => v.subtotal_centavos - v.descuento_centavos === v.total_centavos, {
    message: "subtotal - descuento no da el total",
    path: ["total_centavos"],
  })
  .refine((v) => !v.pagos.some((p) => p.medio === "FIADO") || v.cliente_id !== null, {
    message: "Un fiado necesita un cliente",
    path: ["cliente_id"],
  });

export const zAnulacion = z.object({
  venta_id: uuid,
  motivo: z.string().min(3, "El motivo es obligatorio"),
  usuario_id: uuid.nullable(),
  anulada_en: fechaIso,
  /**
   * Vale emitido por `autorizar_accion` cuando el dueño puso su PIN.
   * Nunca viaja el PIN: lo que se persiste en el outbox es este uuid, que caduca.
   */
  autorizacion_id: uuid.nullable(),
  /** Autorizada sin conexión: el servidor la acepta pero la deja marcada. */
  autorizada_offline: z.boolean().default(false),
  autorizado_por: uuid.nullable(),
});

export const zCobroCC = z.object({
  id: uuid,
  comercio_id: uuid,
  cliente_id: uuid,
  monto_centavos: z.number().int().positive(),
  medio: zMedioPago,
  caja_sesion_id: uuid.nullable(),
  nota: z.string().max(280).nullable().optional(),
  usuario_id: uuid.nullable(),
  creado_en: fechaIso,
});

export const zAjusteStock = z.object({
  id: uuid,
  comercio_id: uuid,
  producto_id: uuid,
  /** DELTA, nunca un stock absoluto. Regla de oro #3. */
  delta: z.number().int(),
  motivo: zMotivoStock,
  nota: z.string().max(280).nullable().optional(),
  usuario_id: uuid.nullable(),
  creado_en: fechaIso,
});

export const zCompraItem = z.object({
  id: uuid,
  producto_id: uuid,
  /** En unidades de COMPRA (cajas, hormas). Admite fracción de bulto. */
  cantidad_compra: z.number().positive(),
  /** Ya convertido por factor_compra. */
  delta_stock: z.number().int().positive(),
  costo_unitario_centavos: centavosPositivos,
});

export const zCompra = z.object({
  id: uuid,
  comercio_id: uuid,
  proveedor_id: uuid.nullable(),
  total_centavos: centavosPositivos,
  nota: z.string().max(280).nullable().optional(),
  usuario_id: uuid.nullable(),
  creado_en: fechaIso,
  items: z.array(zCompraItem).min(1),
});

export const zAperturaCaja = z.object({
  id: uuid,
  comercio_id: uuid,
  dispositivo_id: uuid.nullable(),
  usuario_id: uuid.nullable(),
  fondo_inicial_centavos: centavosPositivos,
  abierta_en: fechaIso,
});

export const zMovimientoCaja = z.object({
  id: uuid,
  comercio_id: uuid,
  caja_sesion_id: uuid,
  tipo: z.enum(["INGRESO", "EGRESO"]),
  motivo: z.string().min(1),
  monto_centavos: z.number().int().positive(),
  usuario_id: uuid.nullable(),
  creado_en: fechaIso,
});

/**
 * Arqueo ciego: el dispositivo manda SOLO lo declarado. El esperado lo calcula
 * el servidor y nunca viaja de vuelta a un empleado.
 */
export const zArqueo = z.object({
  id: uuid,
  comercio_id: uuid,
  caja_sesion_id: uuid,
  declarado_centavos: centavosPositivos,
  desglose: z.record(z.string(), z.number().int().nonnegative()).nullable().optional(),
  declarado_por: uuid.nullable(),
  declarado_en: fechaIso,
});

export const ESQUEMAS_OUTBOX = {
  venta: zVenta,
  anulacion: zAnulacion,
  cobro_cc: zCobroCC,
  compra: zCompra,
  ajuste_stock: zAjusteStock,
  apertura_caja: zAperturaCaja,
  movimiento_caja: zMovimientoCaja,
  arqueo: zArqueo,
} as const;

export type PayloadVenta = z.infer<typeof zVenta>;
export type PayloadAnulacion = z.infer<typeof zAnulacion>;
export type PayloadCobroCC = z.infer<typeof zCobroCC>;
export type PayloadAjusteStock = z.infer<typeof zAjusteStock>;
export type PayloadCompra = z.infer<typeof zCompra>;
export type PayloadAperturaCaja = z.infer<typeof zAperturaCaja>;
export type PayloadMovimientoCaja = z.infer<typeof zMovimientoCaja>;
export type PayloadArqueo = z.infer<typeof zArqueo>;
