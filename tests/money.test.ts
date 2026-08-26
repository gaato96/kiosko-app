import { describe, expect, it } from "vitest";
import {
  aplicarPorcentaje,
  desglosarVuelto,
  formatearPesos,
  margenPct,
  parsearPesos,
  precioPorMargen,
  redondear,
  redondearArriba,
} from "@/lib/money";

describe("redondear", () => {
  it("sin redondeo devuelve el mismo entero", () => {
    expect(redondear(43608, 1)).toBe(43608);
  });

  it("redondea al peso ($1 = 100 centavos)", () => {
    expect(redondear(43608, 100)).toBe(43600);
    expect(redondear(43650, 100)).toBe(43700);
    expect(redondear(43649, 100)).toBe(43600);
  });

  it("redondea a $10", () => {
    expect(redondear(43608, 1000)).toBe(44000);
    expect(redondear(43400, 1000)).toBe(43000);
    expect(redondear(43500, 1000)).toBe(44000);
  });

  it("redondea a $50", () => {
    expect(redondear(43608, 5000)).toBe(45000);
    expect(redondear(41000, 5000)).toBe(40000);
    expect(redondear(42500, 5000)).toBe(45000);
  });

  it("redondea a $100 — el caso del ejemplo de la spec", () => {
    // 237 g de jamón a $18.400/kg = 436080 centavos
    expect(redondear(436080, 10000)).toBe(440000);
    expect(redondear(434000, 10000)).toBe(430000);
    expect(redondear(435000, 10000)).toBe(440000);
  });

  it("trata los negativos simétricamente", () => {
    expect(redondear(-43608, 1000)).toBe(-44000);
    expect(redondear(-43400, 1000)).toBe(-43000);
  });

  it("rechaza entradas que no son enteras", () => {
    expect(() => redondear(100.5, 100)).toThrow();
    expect(() => redondear(100, 0)).toThrow();
  });

  it("redondearArriba nunca baja", () => {
    expect(redondearArriba(43001, 1000)).toBe(44000);
    expect(redondearArriba(43000, 1000)).toBe(43000);
  });
});

describe("formatearPesos", () => {
  it("formatea pesos enteros con separador de miles", () => {
    expect(formatearPesos(1240000)).toBe("$ 12.400");
    expect(formatearPesos(0)).toBe("$ 0");
    expect(formatearPesos(100)).toBe("$ 1");
    expect(formatearPesos(123456700)).toBe("$ 1.234.567");
  });

  it("muestra centavos solo si existen", () => {
    expect(formatearPesos(1240050)).toBe("$ 12.400,50");
    expect(formatearPesos(1240005)).toBe("$ 12.400,05");
  });

  it("maneja negativos y el signo opcional", () => {
    expect(formatearPesos(-50000)).toBe("-$ 500");
    expect(formatearPesos(50000, { signo: true })).toBe("+$ 500");
    expect(formatearPesos(50000, { simbolo: false })).toBe("500");
  });
});

describe("parsearPesos", () => {
  it("lee lo que tipea una persona", () => {
    expect(parsearPesos("12400")).toBe(1240000);
    expect(parsearPesos("$ 12.400")).toBe(1240000);
    expect(parsearPesos("12.400")).toBe(1240000);
    expect(parsearPesos("1.234.567")).toBe(123456700);
  });

  it("interpreta la coma como decimal (convención argentina)", () => {
    expect(parsearPesos("12.400,50")).toBe(1240050);
    expect(parsearPesos("12,50")).toBe(1250);
  });

  it("acepta el punto decimal cuando no puede ser miles", () => {
    expect(parsearPesos("12.5")).toBe(1250);
    expect(parsearPesos("12.50")).toBe(1250);
  });

  it("devuelve null si no hay número", () => {
    expect(parsearPesos("")).toBeNull();
    expect(parsearPesos("$")).toBeNull();
    expect(parsearPesos("abc")).toBeNull();
  });

  it("es simétrico con formatearPesos", () => {
    for (const c of [0, 1, 99, 100, 12345, 1240000, 123456789]) {
      expect(parsearPesos(formatearPesos(c))).toBe(c);
    }
  });
});

describe("márgenes y precios", () => {
  it("aplica porcentajes de aumento", () => {
    expect(aplicarPorcentaje(100000, 12)).toBe(112000);
    expect(aplicarPorcentaje(100000, -10)).toBe(90000);
  });

  it("calcula el precio por margen objetivo sobre venta", () => {
    // costo $650 con 35% de margen -> $1.000
    expect(precioPorMargen(65000, 35)).toBe(100000);
    expect(precioPorMargen(65000, 35, 10000)).toBe(100000);
  });

  it("calcula el margen porcentual", () => {
    expect(margenPct(100000, 65000)).toBeCloseTo(35, 6);
    expect(margenPct(0, 65000)).toBe(0);
    expect(margenPct(50000, 65000)).toBeLessThan(0);
  });
});

describe("desglosarVuelto", () => {
  it("usa los billetes argentinos de mayor a menor", () => {
    // $12.400 -> 1x$10.000 + 1x$2.000 + 2x$200
    expect(desglosarVuelto(1240000)).toEqual([
      { billete: 1000000, cantidad: 1 },
      { billete: 200000, cantidad: 1 },
      { billete: 20000, cantidad: 2 },
    ]);
  });

  it("no devuelve nada para vuelto 0 o negativo", () => {
    expect(desglosarVuelto(0)).toEqual([]);
    expect(desglosarVuelto(-100)).toEqual([]);
  });
});
