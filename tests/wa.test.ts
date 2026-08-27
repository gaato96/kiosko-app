import { describe, expect, it } from "vitest";
import { enlaceWhatsApp, normalizarTelefono } from "@/lib/wa";

describe("normalizarTelefono", () => {
  it("un número de 10 dígitos ya limpio queda intacto", () => {
    // El caso real reportado: "381" (área) + "5104338" (local) tiene un "1"
    // seguido de un "5" justo en el borde, que no es ningún prefijo de móvil.
    expect(normalizarTelefono("3815104338")).toBe("5493815104338");
  });

  it("no se come dígitos cuando el '15' cae exactamente en el borde área/local", () => {
    expect(normalizarTelefono("1122334455")).toBe("5491122334455");
  });

  it("saca el 0 de larga distancia de un número de 10 dígitos", () => {
    expect(normalizarTelefono("03815104338")).toBe("5493815104338");
  });

  it("saca el 15 de móvil cuando está escrito como se disca", () => {
    expect(normalizarTelefono("0381155104338")).toBe("5493815104338");
    expect(normalizarTelefono("011151234 5678")).toBe("5491112345678");
  });

  it("acepta el número ya con código de país", () => {
    expect(normalizarTelefono("5493815104338")).toBe("5493815104338");
    expect(normalizarTelefono("+543815104338")).toBe("5493815104338");
    expect(normalizarTelefono("0054 9 381 510 4338")).toBe("5493815104338");
  });

  it("nulo o vacío devuelve null", () => {
    expect(normalizarTelefono(null)).toBeNull();
    expect(normalizarTelefono(undefined)).toBeNull();
    expect(normalizarTelefono("")).toBeNull();
    expect(normalizarTelefono("   ")).toBeNull();
  });
});

describe("enlaceWhatsApp", () => {
  it("arma el link con el número normalizado", () => {
    expect(enlaceWhatsApp("3815104338", "hola")).toBe(
      "https://wa.me/5493815104338?text=hola",
    );
  });

  it("sin teléfono arma un link genérico", () => {
    expect(enlaceWhatsApp(null, "hola")).toBe("https://wa.me/?text=hola");
  });
});
