import { describe, expect, it } from "vitest";
import { cobroDe, estaAbierto, pasosDe } from "@/lib/pedidos";
import type { PedidoVidriera } from "@/lib/tipos";

function pedido(cambios: Partial<PedidoVidriera> = {}): PedidoVidriera {
  return {
    id: "p1",
    comercio_id: "c1",
    numero: 7,
    nombre_cliente: "Marcela",
    telefono: "3815551234",
    direccion: null,
    tipo_entrega: "RETIRO",
    zona_id: null,
    costo_envio_centavos: 0,
    total_centavos: 1_450_00,
    notas: null,
    estado: "NUEVO",
    venta_id: null,
    acepta_promos: false,
    medio_pago: null,
    paga_con_centavos: null,
    creado_en: "2026-08-26T14:00:00Z",
    actualizado_en: "2026-08-26T14:00:00Z",
    ...cambios,
  };
}

const textos = (p: Parameters<typeof pasosDe>[0]) => pasosDe(p).map((x) => x.estado);

describe("pasosDe", () => {
  it("un pedido nuevo se puede confirmar, preparar, entregar o rechazar", () => {
    expect(textos(pedido())).toEqual(["CONVERTIR", "PREPARANDO", "ENTREGADO", "RECHAZADO"]);
  });

  /**
   * La regresión que motivó todo esto: apenas el pedido se convertía en venta,
   * la pantalla dejaba de ofrecer cualquier acción y quedaba "en curso" para
   * siempre en el panel.
   */
  it("un pedido ya convertido en venta SIGUE pudiendo marcarse entregado", () => {
    const confirmado = pedido({ estado: "ACEPTADO", venta_id: "v1" });
    expect(textos(confirmado)).toContain("ENTREGADO");
    // Y no se ofrece descontar el stock dos veces.
    expect(textos(confirmado)).not.toContain("CONVERTIR");
  });

  it("preparando ya no se ofrece a sí mismo", () => {
    const enCurso = pedido({ estado: "PREPARANDO", venta_id: "v1" });
    expect(textos(enCurso)).toEqual(["ENTREGADO"]);
  });

  it("entregado y rechazado son finales", () => {
    expect(pasosDe(pedido({ estado: "ENTREGADO" }))).toHaveLength(0);
    expect(pasosDe(pedido({ estado: "RECHAZADO" }))).toHaveLength(0);
  });

  it("rechazar solo se ofrece antes de confirmar", () => {
    expect(textos(pedido({ estado: "ACEPTADO", venta_id: "v1" }))).not.toContain("RECHAZADO");
  });
});

describe("estaAbierto", () => {
  it("un pedido entregado deja de contar como pendiente", () => {
    expect(estaAbierto(pedido({ estado: "ENTREGADO" }))).toBe(false);
    expect(estaAbierto(pedido({ estado: "RECHAZADO" }))).toBe(false);
    expect(estaAbierto(pedido({ estado: "ACEPTADO" }))).toBe(true);
  });
});

describe("cobroDe", () => {
  it("calcula el vuelto cuando dijo con cuánto abona", () => {
    const c = cobroDe(pedido({ medio_pago: "EFECTIVO", paga_con_centavos: 2_000_00 }));
    expect(c.vuelto).toBe(550_00);
    expect(c.falta).toBeNull();
    expect(c.titulo).toContain("Cobrar al entregar");
  });

  it("avisa cuando lo que dijo que trae no alcanza", () => {
    const c = cobroDe(pedido({ medio_pago: "EFECTIVO", paga_con_centavos: 1_000_00 }));
    expect(c.falta).toBe(450_00);
    expect(c.vuelto).toBeNull();
  });

  it("sin efectivo no hay vuelto que calcular", () => {
    const c = cobroDe(pedido({ medio_pago: "TRANSFERENCIA" }));
    expect(c.medio).toBe("Transferencia");
    expect(c.vuelto).toBeNull();
  });

  it("un pedido viejo sin medio de pago no inventa uno", () => {
    expect(cobroDe(pedido()).medio).toBe("A convenir");
  });

  it("una vez entregado el texto pasa a cobrado", () => {
    const c = cobroDe(pedido({ estado: "ENTREGADO", medio_pago: "EFECTIVO" }));
    expect(c.titulo).toBe("Cobrado en efectivo");
  });
});
