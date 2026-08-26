import { describe, expect, it } from "vitest";
import {
  FRESCURA_PARA_BLOQUEO_MS,
  antiguedadTexto,
  disponibleDe,
  estadoDeCuenta,
  evaluarFiado,
} from "@/lib/pos/clientes";
import { totalDesglose } from "@/lib/pos/caja";
import type { Cliente } from "@/lib/tipos";

const AHORA = new Date("2026-08-24T15:00:00.000Z").getTime();

function cliente(over: Partial<Cliente> = {}): Cliente {
  return {
    id: "018f0000-0000-7000-8000-000000000001",
    comercio_id: "018f0000-0000-7000-8000-0000000000c1",
    nombre: "Gastón Pérez",
    telefono: "1144556677",
    direccion: null,
    limite_credito_centavos: 10_000_00,
    saldo_centavos: 0,
    notas: null,
    activo: true,
    actualizado_en: new Date(AHORA).toISOString(),
    ...over,
  };
}

describe("estado de cuenta", () => {
  it("al día con saldo 0", () => {
    expect(estadoDeCuenta(cliente())).toBe("al-dia");
  });

  it("con deuda por debajo del 80% del límite", () => {
    expect(estadoDeCuenta(cliente({ saldo_centavos: 500_00 }))).toBe("con-deuda");
  });

  it("cerca del límite a partir del 80%", () => {
    expect(estadoDeCuenta(cliente({ saldo_centavos: 8_000_00 }))).toBe("cerca-del-limite");
  });

  it("al límite cuando lo alcanza o lo pasa", () => {
    expect(estadoDeCuenta(cliente({ saldo_centavos: 10_000_00 }))).toBe("al-limite");
    expect(estadoDeCuenta(cliente({ saldo_centavos: 12_000_00 }))).toBe("al-limite");
  });

  it("límite en 0 significa que no se le fía", () => {
    expect(estadoDeCuenta(cliente({ limite_credito_centavos: 0, saldo_centavos: 0 }))).toBe("al-dia");
    expect(estadoDeCuenta(cliente({ limite_credito_centavos: 0, saldo_centavos: 100 }))).toBe(
      "al-limite",
    );
  });

  it("un pago mayor a la deuda deja saldo a favor", () => {
    expect(estadoDeCuenta(cliente({ saldo_centavos: -2_000_00 }))).toBe("a-favor");
  });

  it("el disponible nunca es negativo", () => {
    expect(disponibleDe(cliente({ saldo_centavos: 8_500_00 }))).toBe(1_500_00);
    expect(disponibleDe(cliente({ saldo_centavos: 12_000_00 }))).toBe(0);
  });
});

describe("evaluarFiado — el criterio de aceptación de M6", () => {
  it("límite $100.000 y deuda $95.000: una venta de $10.000 se bloquea", () => {
    const c = cliente({ limite_credito_centavos: 100_000_00, saldo_centavos: 95_000_00 });
    const v = evaluarFiado(c, 10_000_00, AHORA);
    expect(v.resultado).toBe("bloquea");
    expect(v.disponible).toBe(5_000_00);
  });

  it("la misma venta entra si el monto cabe en el disponible", () => {
    const c = cliente({ limite_credito_centavos: 100_000_00, saldo_centavos: 95_000_00 });
    expect(evaluarFiado(c, 5_000_00, AHORA).resultado).toBe("permite");
  });

  it("un cliente sin crédito habilitado se bloquea siempre", () => {
    const c = cliente({ limite_credito_centavos: 0 });
    const v = evaluarFiado(c, 100, AHORA);
    expect(v.resultado).toBe("bloquea");
    expect(v.mensaje).toContain("no tiene crédito");
  });

  it("con el saldo viejo, el bloqueo duro pasa a ser advertencia", () => {
    // El riesgo aceptado del modo offline: impedir una venta legítima por un
    // dato desactualizado es peor que el exceso de crédito que se evita.
    const viejo = new Date(AHORA - FRESCURA_PARA_BLOQUEO_MS - 60_000).toISOString();
    const c = cliente({
      limite_credito_centavos: 100_000_00,
      saldo_centavos: 95_000_00,
      actualizado_en: viejo,
    });

    const v = evaluarFiado(c, 10_000_00, AHORA);
    expect(v.resultado).toBe("advierte");
    expect(v.mensaje).toContain("desactualizado");
  });

  it("con datos frescos el bloqueo es duro", () => {
    const fresco = new Date(AHORA - 60_000).toISOString();
    const c = cliente({
      limite_credito_centavos: 100_000_00,
      saldo_centavos: 95_000_00,
      actualizado_en: fresco,
    });
    expect(evaluarFiado(c, 10_000_00, AHORA).resultado).toBe("bloquea");
  });
});

describe("antiguedadTexto", () => {
  it("se lee en criollo", () => {
    expect(antiguedadTexto(30_000)).toBe("recién");
    expect(antiguedadTexto(5 * 60_000)).toBe("hace 5 min");
    expect(antiguedadTexto(3 * 3_600_000)).toBe("hace 3 h");
    expect(antiguedadTexto(50 * 3_600_000)).toBe("hace 2 d");
  });
});

describe("totalDesglose del arqueo", () => {
  it("suma los billetes contados", () => {
    // 3 × $20.000 + 5 × $10.000 + 4 × $5.000 + 2 × $2.000 + 7 × $1.000
    expect(
      totalDesglose({
        "2000000": 3,
        "1000000": 5,
        "500000": 4,
        "200000": 2,
        "100000": 7,
      }),
    ).toBe(141_000_00);
  });

  it("ignora los ceros y los vacíos", () => {
    expect(totalDesglose({})).toBe(0);
    expect(totalDesglose({ "1000000": 0 })).toBe(0);
  });
});
