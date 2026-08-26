import { describe, expect, it } from "vitest";
import { ilustracionDe } from "@/lib/ilustraciones";

describe("ilustracionDe", () => {
  it("reconoce los productos más vendidos de un kiosco", () => {
    expect(ilustracionDe("Coca-Cola 500 ml", "Bebidas")).toBe("p-gaseosa");
    expect(ilustracionDe("Alfajor Jorgito", "Golosinas")).toBe("p-alfajor");
    expect(ilustracionDe("Marlboro Box 20", "Cigarrillos")).toBe("p-cigarrillos");
    expect(ilustracionDe("Cerveza Quilmes 1 L", "Cervezas")).toBe("p-cerveza");
    expect(ilustracionDe("Yerba Playadito 1 kg", "Almacén")).toBe("p-yerba");
    expect(ilustracionDe("Jamón cocido", "Fiambrería")).toBe("p-jamon");
  });

  it("no confunde el litraje de una gaseosa con un bidón de agua", () => {
    // Sin lookbehind, el "5 l" de "1,5 L" matchea la regla del bidón.
    expect(ilustracionDe("Coca-Cola 1,5 L", "Bebidas")).toBe("p-gaseosa");
    expect(ilustracionDe("Sprite 2,25 L", "Bebidas")).toBe("p-gaseosa");
    expect(ilustracionDe("Bidón de agua 6 L", "Bebidas")).toBe("p-bidon");
  });

  it("prioriza los servicios sobre cualquier otra lectura del nombre", () => {
    expect(ilustracionDe("Carga de SUBE", "Servicios")).toBe("p-transporte");
    expect(ilustracionDe("Carga virtual Personal", "Servicios")).toBe("p-recarga");
  });

  it("ignora tildes y mayúsculas", () => {
    expect(ilustracionDe("JAMÓN COCIDO")).toBe("p-jamon");
    expect(ilustracionDe("jamon cocido")).toBe("p-jamon");
  });

  it("cae a la categoría cuando el nombre no dice nada", () => {
    expect(ilustracionDe("Producto sin nombre claro", "Limpieza")).toBe("p-detergente");
    expect(ilustracionDe("Marca propia", "Librería")).toBe("p-cuaderno");
  });

  it("dibuja la balanza cuando se vende por peso y no hay otra pista", () => {
    expect(ilustracionDe("Corte especial", null, "PESO")).toBe("p-balanza");
  });

  it("nunca devuelve vacío", () => {
    expect(ilustracionDe("")).toBe("p-generico");
    expect(ilustracionDe("xyz123", null, null)).toBe("p-generico");
  });
});
