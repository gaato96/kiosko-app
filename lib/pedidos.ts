/**
 * lib/pedidos.ts — el circuito del pedido de la Vidriera, en un solo lugar.
 *
 * Está separado de los componentes porque el mismo pedido se atiende desde dos
 * pantallas —el panel y la bandeja— y las dos tienen que ofrecer exactamente
 * los mismos pasos. Cuando esto vivía adentro de cada pantalla, una dejaba de
 * mostrar los botones apenas el pedido se convertía en venta y la otra lo
 * seguía contando como pendiente para siempre.
 *
 * La Vidriera NO cobra. El cliente paga cuando retira o cuando le llega, así
 * que el medio de pago que eligió es una instrucción para el mostrador
 * ("prepará $5.000 de vuelto"), no un cobro hecho.
 */

import { formatearPesos } from "./money";
import { formatearCantidad } from "./peso";
import type { EstadoPedido, MedioPago, PedidoConItems, PedidoVidriera } from "./tipos";

/** Los estados en los que el pedido todavía le debe algo a alguien. */
export const ESTADOS_ABIERTOS: EstadoPedido[] = ["NUEVO", "ACEPTADO", "PREPARANDO"];

export function estaAbierto(pedido: Pick<PedidoVidriera, "estado">): boolean {
  return ESTADOS_ABIERTOS.includes(pedido.estado);
}

export const ETIQUETA_ESTADO: Record<
  EstadoPedido,
  { texto: string; tono: "plata" | "info" | "atencion" | "exito" | "peligro" }
> = {
  NUEVO: { texto: "Sin confirmar", tono: "plata" },
  ACEPTADO: { texto: "Confirmado", tono: "info" },
  PREPARANDO: { texto: "Preparando", tono: "atencion" },
  ENTREGADO: { texto: "Entregado", tono: "exito" },
  RECHAZADO: { texto: "Rechazado", tono: "peligro" },
};

const ETIQUETA_MEDIO: Record<MedioPago, string> = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  DEBITO: "Débito",
  CREDITO: "Crédito",
  QR: "QR",
  FIADO: "Fiado",
};

/**
 * Qué se puede hacer con este pedido AHORA.
 *
 * `convertir` descuenta stock y registra la venta, y por eso pasa una sola vez.
 * Marcar entregado es independiente: que el stock ya haya bajado no significa
 * que la mercadería salió del local. Ese era exactamente el bug —el pedido se
 * confirmaba, desaparecían todos los botones y quedaba "en curso" para
 * siempre— y por eso los dos caminos están separados acá.
 */
export type PasoPedido = {
  estado: EstadoPedido | "CONVERTIR";
  texto: string;
  ayuda?: string;
  tono: "plata" | "primario" | "secundario" | "peligro";
};

export function pasosDe(pedido: Pick<PedidoVidriera, "estado" | "venta_id">): PasoPedido[] {
  if (pedido.estado === "ENTREGADO" || pedido.estado === "RECHAZADO") return [];

  const pasos: PasoPedido[] = [];

  if (!pedido.venta_id) {
    pasos.push({
      estado: "CONVERTIR",
      texto: "Confirmar y descontar stock",
      ayuda: "Le avisa al cliente que va, y baja la mercadería del stock.",
      tono: "plata",
    });
  }

  if (pedido.estado !== "PREPARANDO") {
    pasos.push({ estado: "PREPARANDO", texto: "Preparando", tono: "secundario" });
  }

  pasos.push({ estado: "ENTREGADO", texto: "Entregado", tono: "primario" });

  if (pedido.estado === "NUEVO") {
    pasos.push({ estado: "RECHAZADO", texto: "Rechazar", tono: "peligro" });
  }

  return pasos;
}

/**
 * Qué hay que cobrar y cómo. Devuelve `null` si no hay nada que decir.
 *
 * El vuelto se calcula acá y no en el mostrador porque el punto de pedir "¿con
 * cuánto abonás?" en el checkout es justamente que el cambio salga contado de
 * antemano.
 */
export function cobroDe(pedido: Pick<PedidoVidriera, "medio_pago" | "paga_con_centavos" | "total_centavos" | "estado">): {
  medio: string;
  titulo: string;
  vuelto: number | null;
  falta: number | null;
} {
  const medio = pedido.medio_pago ? ETIQUETA_MEDIO[pedido.medio_pago] : "A convenir";
  const cobrado = pedido.estado === "ENTREGADO";

  if (pedido.medio_pago !== "EFECTIVO" || pedido.paga_con_centavos == null) {
    return {
      medio,
      titulo: cobrado ? `Cobrado en ${medio.toLowerCase()}` : `Cobrar al entregar · ${medio}`,
      vuelto: null,
      falta: null,
    };
  }

  const diferencia = pedido.paga_con_centavos - pedido.total_centavos;
  return {
    medio,
    titulo: cobrado ? "Cobrado en efectivo" : "Cobrar al entregar · Efectivo",
    vuelto: diferencia >= 0 ? diferencia : null,
    falta: diferencia < 0 ? -diferencia : null,
  };
}

/** Una línea del pedido, lista para leer en voz alta mientras se arma. */
export function lineaDeItem(item: PedidoConItems["items"][number]): string {
  return `${formatearCantidad(item.cantidad, item.tipo_venta)} · ${item.descripcion}`;
}

/** El mensaje que se le manda al cliente cuando el pedido queda confirmado. */
export function mensajeConfirmacion(pedido: PedidoConItems, nombreComercio: string): string {
  const lineas = [
    `Hola ${pedido.nombre_cliente}! Te confirmamos el pedido #${pedido.numero ?? ""} de ${nombreComercio}.`,
    "",
    ...pedido.items.map((i) => `• ${lineaDeItem(i)} — ${formatearPesos(i.total_centavos)}`),
  ];

  if (pedido.costo_envio_centavos > 0) {
    lineas.push(`• Envío — ${formatearPesos(pedido.costo_envio_centavos)}`);
  }

  lineas.push("", `Total: ${formatearPesos(pedido.total_centavos)}`);

  const cobro = cobroDe(pedido);
  if (pedido.medio_pago === "EFECTIVO" && cobro.vuelto !== null) {
    lineas.push(`Abonás con ${formatearPesos(pedido.paga_con_centavos ?? 0)}, te llevamos ${formatearPesos(cobro.vuelto)} de vuelto.`);
  } else if (pedido.medio_pago) {
    lineas.push(`Abonás con ${cobro.medio.toLowerCase()}.`);
  }

  lineas.push(
    "",
    pedido.tipo_entrega === "ENVIO"
      ? `Te lo llevamos a ${pedido.direccion ?? "la dirección que dejaste"}.`
      : "Lo dejamos listo para que lo retires.",
  );

  return lineas.join("\n");
}
