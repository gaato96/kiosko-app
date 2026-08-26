"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { uuidv7 } from "uuidv7";
import { Check, Copy, MessageCircle, Truck } from "lucide-react";
import { Boton } from "@/components/ui/boton";
import { Input } from "@/components/ui/campo";
import { formatearPesos, parsearPesos } from "@/lib/money";
import { formatearPeso, unidadesCompraDesdeDelta } from "@/lib/peso";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { enlaceWhatsApp, mensajePedidoProveedor } from "@/lib/wa";

export type FilaReposicion = {
  id: string;
  comercio_id: string;
  nombre: string;
  tipo_venta: "UNIDAD" | "PESO";
  stock_actual: number;
  stock_minimo: number;
  faltante: number;
  factor_compra: number;
  unidad_compra: string | null;
  proveedor_id: string | null;
  proveedor_nombre: string | null;
  proveedor_telefono: string | null;
};

type Seleccion = Record<string, number>; // producto_id -> cantidad en unidades de COMPRA

export function PanelReposicion({
  filas,
  nombreComercio,
}: {
  filas: FilaReposicion[];
  nombreComercio: string;
}) {
  const router = useRouter();
  const [seleccion, setSeleccion] = useState<Seleccion>({});
  const [costos, setCostos] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const grupos = useMemo(() => {
    const mapa = new Map<string, { nombre: string; telefono: string | null; filas: FilaReposicion[] }>();
    for (const f of filas) {
      const clave = f.proveedor_id ?? "sin-proveedor";
      if (!mapa.has(clave)) {
        mapa.set(clave, {
          nombre: f.proveedor_nombre ?? "Sin proveedor",
          telefono: f.proveedor_telefono,
          filas: [],
        });
      }
      mapa.get(clave)!.filas.push(f);
    }
    return Array.from(mapa.entries());
  }, [filas]);

  /** Sugerencia base: lo que falta para volver al mínimo, en unidades de COMPRA. */
  function sugerido(f: FilaReposicion): number {
    return Math.max(1, unidadesCompraDesdeDelta(Math.max(1, f.faltante), f.factor_compra));
  }

  function enviarPorWhatsApp(clave: string, grupo: { nombre: string; telefono: string | null; filas: FilaReposicion[] }) {
    const lineas = grupo.filas
      .filter((f) => seleccion[f.id])
      .map((f) => ({
        nombre: f.nombre,
        cantidadCompra: seleccion[f.id]!,
        unidadCompra: f.unidad_compra,
      }));

    if (lineas.length === 0) {
      setAviso("Tildá al menos un producto para armar el pedido.");
      return;
    }

    const texto = mensajePedidoProveedor({
      nombreComercio,
      nombreProveedor: grupo.nombre,
      lineas,
    });

    if (!grupo.telefono) {
      // Sin teléfono cargado, se copia: mejor eso que abrir un chat vacío.
      void navigator.clipboard.writeText(texto);
      setAviso(`${grupo.nombre} no tiene teléfono cargado. El pedido quedó copiado.`);
      return;
    }

    const url = enlaceWhatsApp(grupo.telefono, texto);
    if (url) window.open(url, "_blank", "noopener");
    void clave;
  }

  /**
   * Recibir mercadería: la MISMA lista con checkbox y cantidad. El dueño no
   * vuelve a cargar productos, solo tilda lo que trajo.
   */
  async function recibir(clave: string, grupo: { nombre: string; filas: FilaReposicion[] }) {
    const items = grupo.filas
      .filter((f) => seleccion[f.id])
      .map((f) => {
        const cantidadCompra = seleccion[f.id]!;
        const costoUnitario = parsearPesos(costos[f.id] ?? "") ?? 0;
        return {
          id: uuidv7(),
          producto_id: f.id,
          cantidad_compra: cantidadCompra,
          // Se convierte por factor_compra: una caja x24 sube 24, una horma de
          // 4 kg sube 4000 gramos.
          delta_stock: Math.round(cantidadCompra * f.factor_compra),
          costo_unitario_centavos: costoUnitario,
        };
      });

    if (items.length === 0) {
      setAviso("Tildá lo que trajiste y poné la cantidad.");
      return;
    }

    setGuardando(clave);
    const { error } = await supabaseBrowser().rpc("aplicar_compra", {
      payload: {
        id: uuidv7(),
        comercio_id: grupo.filas[0]!.comercio_id,
        proveedor_id: grupo.filas[0]!.proveedor_id,
        total_centavos: items.reduce(
          (a, i) => a + i.costo_unitario_centavos * Math.ceil(i.cantidad_compra),
          0,
        ),
        creado_en: new Date().toISOString(),
        usuario_id: null,
        items,
      },
    });
    setGuardando(null);

    if (error) {
      setAviso(`No se pudo registrar el ingreso: ${error.message}`);
      return;
    }

    setAviso(`Ingresaron ${items.length} productos de ${grupo.nombre}.`);
    setSeleccion({});
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {aviso ? (
        <p className="tarjeta p-4 text-sm">{aviso}</p>
      ) : null}

      {grupos.map(([clave, grupo]) => {
        const tildados = grupo.filas.filter((f) => seleccion[f.id]).length;

        return (
          <section key={clave} className="tarjeta">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
              <h2 className="flex items-center gap-2 font-semibold">
                <Truck size={18} /> {grupo.nombre}
                <span className="text-text-muted">({grupo.filas.length})</span>
              </h2>
              <div className="flex gap-2">
                <Boton
                  tamano="chico"
                  onClick={() => {
                    // Tildar todo con la sugerencia calculada.
                    const nuevo = { ...seleccion };
                    for (const f of grupo.filas) nuevo[f.id] = sugerido(f);
                    setSeleccion(nuevo);
                  }}
                >
                  Tildar todo
                </Boton>
                <Boton tamano="chico" onClick={() => enviarPorWhatsApp(clave, grupo)}>
                  {grupo.telefono ? <MessageCircle size={16} /> : <Copy size={16} />}
                  {grupo.telefono ? "Enviar pedido" : "Copiar pedido"}
                </Boton>
                <Boton
                  tamano="chico"
                  variante="primario"
                  disabled={tildados === 0 || guardando === clave}
                  onClick={() => recibir(clave, grupo)}
                >
                  <Check size={16} /> Recibir
                </Boton>
              </div>
            </header>

            <ul className="divide-y divide-border">
              {grupo.filas.map((f) => {
                const cantidad = seleccion[f.id];
                const enUnidadesDeVenta = cantidad ? Math.round(cantidad * f.factor_compra) : 0;

                return (
                  <li key={f.id} className="flex flex-wrap items-center gap-3 p-3">
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        className="h-6 w-6 shrink-0 accent-[var(--primary)]"
                        checked={Boolean(cantidad)}
                        onChange={(e) =>
                          setSeleccion((prev) => {
                            const copia = { ...prev };
                            if (e.target.checked) copia[f.id] = sugerido(f);
                            else delete copia[f.id];
                            return copia;
                          })
                        }
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{f.nombre}</span>
                        <span className="num block text-xs text-text-muted">
                          tenés{" "}
                          {f.tipo_venta === "PESO" ? formatearPeso(f.stock_actual) : f.stock_actual} ·
                          mín{" "}
                          {f.tipo_venta === "PESO" ? formatearPeso(f.stock_minimo) : f.stock_minimo}
                        </span>
                      </span>
                    </label>

                    {cantidad ? (
                      <div className="flex items-center gap-2">
                        <Input
                          inputMode="decimal"
                          className="min-h-12 w-20 text-center"
                          value={String(cantidad)}
                          onChange={(e) =>
                            setSeleccion((prev) => ({
                              ...prev,
                              [f.id]: Number(e.target.value.replace(/[^\d.]/g, "")) || 0,
                            }))
                          }
                          aria-label={`Cantidad de ${f.nombre} en unidades de compra`}
                        />
                        <span className="w-28 text-xs text-text-muted">
                          {f.unidad_compra ?? "Unidad"}
                          <br />
                          <span className="num">
                            ={" "}
                            {f.tipo_venta === "PESO"
                              ? formatearPeso(enUnidadesDeVenta)
                              : `${enUnidadesDeVenta} u`}
                          </span>
                        </span>
                        <Input
                          inputMode="numeric"
                          className="min-h-12 w-28"
                          value={costos[f.id] ?? ""}
                          onChange={(e) => setCostos({ ...costos, [f.id]: e.target.value })}
                          placeholder="costo"
                          aria-label={`Costo por ${f.unidad_compra ?? "unidad"} de ${f.nombre}`}
                        />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>

            <footer className="border-t border-border p-3 text-sm text-text-muted">
              El pedido se manda en unidades de compra ({grupo.filas[0]?.unidad_compra ?? "unidad"} y
              similares), no en unidades sueltas. El costo es opcional: si lo cargás, actualiza el
              costo del producto y con eso el margen deja de ser un invento.{" "}
              {tildados > 0 ? (
                <span className="num text-text">
                  {tildados} tildados ·{" "}
                  {formatearPesos(
                    grupo.filas
                      .filter((f) => seleccion[f.id])
                      .reduce(
                        (a, f) =>
                          a + (parsearPesos(costos[f.id] ?? "") ?? 0) * Math.ceil(seleccion[f.id]!),
                        0,
                      ),
                  )}
                </span>
              ) : null}
            </footer>
          </section>
        );
      })}
    </div>
  );
}
