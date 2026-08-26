/**
 * lib/wa.ts — armado de mensajes de WhatsApp.
 *
 * WhatsApp es el canal real del kiosco: el pedido al proveedor, el recordatorio
 * de fiado y la confirmación del pedido de la Vidriera pasan por acá.
 *
 * Todo texto plano. Nada de plantillas de la API de negocios: esto abre el
 * WhatsApp del propio dueño con el mensaje escrito.
 */

import { formatearPesos } from "./money";
import { formatearPeso } from "./peso";

/** Normaliza un teléfono argentino al formato que espera wa.me: 5491122334455. */
export function normalizarTelefono(telefono: string | null | undefined): string | null {
  if (!telefono) return null;
  let n = telefono.replace(/\D/g, "");

  if (n.startsWith("00")) n = n.slice(2);
  if (n.startsWith("54")) {
    // Ya viene con país. Se asegura el 9 del móvil.
    const resto = n.slice(2).replace(/^9/, "");
    return `549${resto}`;
  }
  // Sin país: se saca el 0 de larga distancia y el 15 del móvil.
  n = n.replace(/^0/, "");
  n = n.replace(/^(\d{2,4})15/, "$1");
  return `549${n}`;
}

export function enlaceWhatsApp(telefono: string | null | undefined, texto: string): string | null {
  const numero = normalizarTelefono(telefono);
  const cuerpo = encodeURIComponent(texto);
  return numero ? `https://wa.me/${numero}?text=${cuerpo}` : `https://wa.me/?text=${cuerpo}`;
}

// ---------------------------------------------------------------------------
// M6 · Recordatorio de fiado
// ---------------------------------------------------------------------------

export type MovimientoResumen = {
  fecha: string;
  tipo: "CARGO" | "PAGO" | "AJUSTE";
  monto_centavos: number;
};

/**
 * El mensaje que hace que el fiado se cobre. Con detalle o sin él: hay dueños
 * que prefieren mandar solo el saldo y no dar pie a la discusión de cada línea.
 */
export function mensajeDeuda(datos: {
  nombreCliente: string;
  nombreComercio: string;
  saldoCentavos: number;
  movimientos?: MovimientoResumen[];
  incluirDetalle?: boolean;
}): string {
  const { nombreCliente, nombreComercio, saldoCentavos, movimientos = [], incluirDetalle = true } = datos;

  const partes = [`Hola ${nombreCliente}! Te paso el detalle de tu cuenta en ${nombreComercio}:`, ""];

  if (incluirDetalle && movimientos.length > 0) {
    for (const m of movimientos) {
      const fecha = new Date(m.fecha).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
      const etiqueta = m.tipo === "PAGO" ? "Pago" : m.tipo === "CARGO" ? "Compra" : "Ajuste";
      const signo = m.tipo === "PAGO" ? "-" : "";
      partes.push(`${fecha} — ${etiqueta.padEnd(8)} ${signo}${formatearPesos(m.monto_centavos)}`);
    }
    partes.push("");
  }

  partes.push(`Saldo actual: ${formatearPesos(saldoCentavos)}`, "", "Cualquier cosa avisame. Gracias!");
  return partes.join("\n");
}

// ---------------------------------------------------------------------------
// M4 · Pedido al proveedor
// ---------------------------------------------------------------------------

export type LineaPedidoProveedor = {
  nombre: string;
  cantidadCompra: number;
  unidadCompra: string | null;
};

/**
 * El pedido va SIEMPRE en unidades de COMPRA, no de venta. Al proveedor se le
 * piden 3 cajas, no 72 latas.
 */
export function mensajePedidoProveedor(datos: {
  nombreComercio: string;
  nombreProveedor: string;
  lineas: LineaPedidoProveedor[];
}): string {
  const partes = [`Hola ${datos.nombreProveedor}! Te paso el pedido de ${datos.nombreComercio}:`, ""];

  for (const l of datos.lineas) {
    const unidad = l.unidadCompra && l.unidadCompra !== "Unidad" ? ` (${l.unidadCompra})` : "";
    partes.push(`• ${l.nombre} — ${l.cantidadCompra}${unidad}`);
  }

  partes.push("", "Gracias!");
  return partes.join("\n");
}

// ---------------------------------------------------------------------------
// M8 · Pedido de la Vidriera
// ---------------------------------------------------------------------------

export type LineaPedidoVidriera = {
  descripcion: string;
  cantidad: number;
  tipoVenta: "UNIDAD" | "PESO";
  totalCentavos: number;
};

export function mensajePedidoVidriera(datos: {
  numero: number | null;
  nombreCliente: string;
  telefono: string;
  direccion?: string | null;
  esEnvio: boolean;
  lineas: LineaPedidoVidriera[];
  costoEnvioCentavos: number;
  totalCentavos: number;
  notas?: string | null;
}): string {
  const partes = [
    `Hola! Hice un pedido${datos.numero ? ` (#${datos.numero})` : ""}:`,
    "",
  ];

  for (const l of datos.lineas) {
    const cantidad = l.tipoVenta === "PESO" ? formatearPeso(l.cantidad) : `x${l.cantidad}`;
    partes.push(`• ${l.descripcion} ${cantidad} — ${formatearPesos(l.totalCentavos)}`);
  }

  partes.push("");
  if (datos.esEnvio) {
    partes.push(`Envío a: ${datos.direccion ?? "(a confirmar)"}`);
    if (datos.costoEnvioCentavos > 0) {
      partes.push(`Costo de envío: ${formatearPesos(datos.costoEnvioCentavos)}`);
    }
  } else {
    partes.push("Paso a retirarlo.");
  }

  if (datos.notas) partes.push(`Nota: ${datos.notas}`);

  partes.push("", `TOTAL: ${formatearPesos(datos.totalCentavos)}`, "", `${datos.nombreCliente} — ${datos.telefono}`);
  return partes.join("\n");
}
