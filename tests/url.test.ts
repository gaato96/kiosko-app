import { describe, expect, it } from "vitest";
import { origenPublico, urlVidriera } from "@/lib/url";

describe("origenPublico", () => {
  it("agrega el esquema cuando falta", () => {
    // El caso real: alguien pega el dominio de Vercel sin https:// en el panel.
    expect(origenPublico("kiosko-app-sooty.vercel.app")).toBe("https://kiosko-app-sooty.vercel.app");
  });

  it("respeta el esquema cuando ya está", () => {
    expect(origenPublico("https://kiosko.com.ar")).toBe("https://kiosko.com.ar");
    expect(origenPublico("http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("limpia barra final y path pegado de más", () => {
    expect(origenPublico("https://kiosko.com.ar/")).toBe("https://kiosko.com.ar");
    expect(origenPublico("https://kiosko.com.ar/reportes")).toBe("https://kiosko.com.ar");
  });

  it("devuelve vacío cuando no hay nada usable", () => {
    expect(origenPublico("")).toBe("");
    expect(origenPublico(null)).toBe("");
    expect(origenPublico("   ")).toBe("");
  });
});

describe("urlVidriera", () => {
  it("no duplica el dominio cuando falta el esquema", () => {
    // Sin normalizar, el href quedaba relativo y el navegador lo pegaba al
    // origen actual: https://mi-app.vercel.app/mi-app.vercel.app/t/kiosco
    expect(urlVidriera("kiosco-la-esquina", "kiosko-app-sooty.vercel.app")).toBe(
      "https://kiosko-app-sooty.vercel.app/t/kiosco-la-esquina",
    );
  });

  it("cae a la ruta relativa sin origen configurado", () => {
    expect(urlVidriera("kiosco-la-esquina", "")).toBe("/t/kiosco-la-esquina");
  });
});
