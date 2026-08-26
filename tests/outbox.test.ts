import { beforeEach, describe, expect, it, vi } from "vitest";
import { uuidv7 } from "uuidv7";
import {
  ErrorValidacionOutbox,
  MAX_INTENTOS,
  contarPendientes,
  encolar,
  esperaBackoff,
  pendientes,
  procesar,
  reintentarTodo,
  totalSinSincronizar,
  trabados,
} from "@/lib/db/outbox";
import { db } from "@/lib/db/schema";
import type { PayloadVenta } from "@/lib/db/payloads";

const COMERCIO = "018f0000-0000-7000-8000-000000000001";

function venta(total = 460000): PayloadVenta {
  const id = uuidv7();
  return {
    id,
    comercio_id: COMERCIO,
    usuario_id: null,
    dispositivo_id: null,
    caja_sesion_id: null,
    cliente_id: null,
    subtotal_centavos: total,
    descuento_centavos: 0,
    total_centavos: total,
    costo_total_centavos: 0,
    origen: "POS",
    creado_en: new Date().toISOString(),
    items: [
      {
        id: uuidv7(),
        producto_id: null,
        descripcion: "Jamón cocido",
        tipo_venta: "PESO",
        cantidad: 250,
        precio_unitario_centavos: 1840000,
        costo_unitario_centavos: 0,
        total_centavos: total,
      },
    ],
    pagos: [
      {
        id: uuidv7(),
        medio: "EFECTIVO",
        monto_centavos: total,
        recibido_centavos: 500000,
        vuelto_centavos: 40000,
      },
    ],
  };
}

beforeEach(async () => {
  await db().outbox.clear();
  await db().ventas.clear();
});

describe("encolar", () => {
  it("acepta una venta bien formada y la deja pendiente", async () => {
    const item = await encolar("venta", venta());
    expect(item.estado).toBe("pendiente");
    expect(item.intentos).toBe(0);
    expect(await contarPendientes()).toBe(1);
  });

  it("usa el id de la entidad como id del item (idempotencia)", async () => {
    const v = venta();
    await encolar("venta", v);
    await encolar("venta", v);
    // Encolar dos veces la misma venta deja UNA sola operación.
    expect(await contarPendientes()).toBe(1);
    expect((await db().outbox.get(v.id))?.id).toBe(v.id);
  });

  it("rechaza una venta cuyos pagos no suman el total", async () => {
    const v = venta();
    v.pagos[0]!.monto_centavos = 1;
    await expect(encolar("venta", v)).rejects.toBeInstanceOf(ErrorValidacionOutbox);
    expect(await contarPendientes()).toBe(0);
  });

  it("rechaza un fiado sin cliente", async () => {
    const v = venta();
    v.pagos[0] = { id: uuidv7(), medio: "FIADO", monto_centavos: v.total_centavos };
    await expect(encolar("venta", v)).rejects.toThrow(/cliente/i);
  });

  it("rechaza una venta sin items", async () => {
    const v = { ...venta(), items: [] };
    await expect(encolar("venta", v)).rejects.toThrow(/items/i);
  });

  it("rechaza un ajuste de stock con delta no entero", async () => {
    await expect(
      encolar("ajuste_stock", {
        id: uuidv7(),
        comercio_id: COMERCIO,
        producto_id: uuidv7(),
        delta: -2.5,
        motivo: "MERMA",
        usuario_id: null,
        creado_en: new Date().toISOString(),
      }),
    ).rejects.toBeInstanceOf(ErrorValidacionOutbox);
  });
});

describe("backoff", () => {
  it("crece exponencialmente desde 1s y topea en 5 min", () => {
    expect(esperaBackoff(0)).toBe(1_000);
    expect(esperaBackoff(1)).toBe(2_000);
    expect(esperaBackoff(2)).toBe(4_000);
    expect(esperaBackoff(20)).toBe(300_000);
  });
});

describe("procesar", () => {
  it("saca de la cola lo que el servidor confirma", async () => {
    await encolar("venta", venta());
    await encolar("venta", venta());

    const enviar = vi.fn().mockResolvedValue(undefined);
    const r = await procesar(enviar);

    expect(r).toEqual({ ok: 2, error: 0 });
    expect(await contarPendientes()).toBe(0);
  });

  it("no descarta nada cuando falla: reintenta con espera creciente", async () => {
    const v = venta();
    await encolar("venta", v);

    const enviar = vi.fn().mockRejectedValue(new Error("sin red"));
    const r = await procesar(enviar);

    expect(r).toEqual({ ok: 0, error: 1 });
    const item = await db().outbox.get(v.id);
    expect(item?.estado).toBe("error");
    expect(item?.intentos).toBe(1);
    expect(item?.ultimoError).toContain("sin red");
    // Todavía no toca reintentar.
    expect(await pendientes()).toHaveLength(0);
    // Pasado el backoff, vuelve a estar disponible.
    expect(await pendientes(Date.now() + 2_000)).toHaveLength(1);
  });

  it("después de 10 intentos queda trabado y visible, nunca borrado", async () => {
    const v = venta();
    await encolar("venta", v);
    const enviar = vi.fn().mockRejectedValue(new Error("500"));

    for (let i = 0; i < MAX_INTENTOS + 3; i++) {
      await procesar(enviar, { ahora: Date.now() + 10 * 60_000 * (i + 1) });
    }

    const item = await db().outbox.get(v.id);
    expect(item).toBeDefined();
    expect(item!.intentos).toBe(MAX_INTENTOS);
    expect(await trabados()).toHaveLength(1);
    expect(enviar).toHaveBeenCalledTimes(MAX_INTENTOS);

    // El reintento manual lo devuelve a la cola.
    expect(await reintentarTodo()).toBe(1);
    expect(await pendientes()).toHaveLength(1);
  });

  it("respeta el orden de creación", async () => {
    const a = venta(100);
    const b = venta(200);
    await encolar("venta", a);
    await encolar("venta", b);

    const vistos: string[] = [];
    await procesar(async (item) => {
      vistos.push(item.id);
    });
    expect(vistos).toEqual([a.id, b.id]);
  });
});

describe("totalSinSincronizar", () => {
  it("suma la plata que todavía no llegó al servidor", async () => {
    await encolar("venta", venta(460000));
    await encolar("venta", venta(120000));
    expect(await totalSinSincronizar()).toBe(580000);
  });
});
