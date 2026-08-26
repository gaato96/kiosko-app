import { describe, expect, it } from "vitest";
import {
  deltaDesdeUnidadCompra,
  formatearPeso,
  gramosDesdeImporte,
  importeDesdeGramos,
  parsearPeso,
  unidadesCompraDesdeDelta,
} from "@/lib/peso";

const JAMON_POR_KG = 1840000; // $18.400/kg
const QUESO_POR_KG = 1350000; // $13.500/kg

describe("importeDesdeGramos — ejemplos verificables de la spec", () => {
  it("250 g de jamón a $18.400/kg da exactamente $4.600", () => {
    expect(importeDesdeGramos(250, JAMON_POR_KG)).toBe(460000);
    // El redondeo a $100 no lo altera: ya es múltiplo.
    expect(importeDesdeGramos(250, JAMON_POR_KG, 10000)).toBe(460000);
  });

  it("237 g de jamón con redondeo a $100 da $4.400", () => {
    expect(importeDesdeGramos(237, JAMON_POR_KG)).toBe(436080);
    expect(importeDesdeGramos(237, JAMON_POR_KG, 10000)).toBe(440000);
  });

  it("respeta cada unidad de redondeo configurable", () => {
    expect(importeDesdeGramos(237, JAMON_POR_KG, 1)).toBe(436080);
    expect(importeDesdeGramos(237, JAMON_POR_KG, 100)).toBe(436100);
    expect(importeDesdeGramos(237, JAMON_POR_KG, 1000)).toBe(436000);
    expect(importeDesdeGramos(237, JAMON_POR_KG, 5000)).toBe(435000);
  });

  it("un kilo exacto vale el precio por kilo", () => {
    expect(importeDesdeGramos(1000, JAMON_POR_KG)).toBe(JAMON_POR_KG);
  });

  it("devuelve enteros siempre", () => {
    for (let g = 1; g <= 500; g += 7) {
      expect(Number.isInteger(importeDesdeGramos(g, QUESO_POR_KG, 10000))).toBe(true);
    }
  });
});

describe("gramosDesdeImporte", () => {
  it("$2.000 de queso a $13.500/kg sugiere 148 g", () => {
    expect(gramosDesdeImporte(200000, QUESO_POR_KG)).toBe(148);
  });

  it("$2.000 de jamón a $18.400/kg sugiere 109 g", () => {
    expect(gramosDesdeImporte(200000, JAMON_POR_KG)).toBe(109);
  });

  it("nunca sugiere menos de 1 g", () => {
    expect(gramosDesdeImporte(100, JAMON_POR_KG)).toBe(1);
  });

  it("el paso 2 recalcula el precio real del peso corregido", () => {
    const sugerido = gramosDesdeImporte(200000, QUESO_POR_KG); // 148 g
    expect(sugerido).toBe(148);
    const real = 152;
    // 152 * 1350000 / 1000 = 205200 -> redondeo a $100 -> 210000 = $2.100
    expect(importeDesdeGramos(real, QUESO_POR_KG, 10000)).toBe(210000);
  });
});

describe("formatearPeso", () => {
  it("muestra gramos por debajo del kilo", () => {
    expect(formatearPeso(250)).toBe("250 g");
    expect(formatearPeso(999)).toBe("999 g");
    expect(formatearPeso(0)).toBe("0 g");
  });

  it("muestra kilos con coma decimal", () => {
    expect(formatearPeso(1250)).toBe("1,25 kg");
    expect(formatearPeso(1000)).toBe("1 kg");
    expect(formatearPeso(2500)).toBe("2,5 kg");
    expect(formatearPeso(1005)).toBe("1,005 kg");
    expect(formatearPeso(10500)).toBe("10,5 kg");
  });

  it("maneja negativos (ajustes de stock)", () => {
    expect(formatearPeso(-250)).toBe("-250 g");
    expect(formatearPeso(-1500)).toBe("-1,5 kg");
  });
});

describe("parsearPeso", () => {
  it("sin unidad interpreta gramos", () => {
    expect(parsearPeso("250")).toBe(250);
    expect(parsearPeso("250 g")).toBe(250);
  });

  it("con kg convierte a gramos", () => {
    expect(parsearPeso("1,25 kg")).toBe(1250);
    expect(parsearPeso("1.25kg")).toBe(1250);
    expect(parsearPeso("0,5 kg")).toBe(500);
  });

  it("devuelve null si no hay número", () => {
    expect(parsearPeso("")).toBeNull();
    expect(parsearPeso("kg")).toBeNull();
  });
});

describe("factor_compra — fraccionamiento sin producto padre/hijo", () => {
  it("una caja x24 sube 24 unidades", () => {
    expect(deltaDesdeUnidadCompra(1, 24)).toBe(24);
    expect(deltaDesdeUnidadCompra(3, 24)).toBe(72);
  });

  it("una horma de 4 kg sube 4000 gramos", () => {
    expect(deltaDesdeUnidadCompra(1, 4000)).toBe(4000);
    expect(deltaDesdeUnidadCompra(0.5, 4000)).toBe(2000);
  });

  it("el pedido al proveedor va en unidades de compra, redondeando hacia arriba", () => {
    expect(unidadesCompraDesdeDelta(25, 24)).toBe(2);
    expect(unidadesCompraDesdeDelta(24, 24)).toBe(1);
    expect(unidadesCompraDesdeDelta(1, 24)).toBe(1);
  });
});
