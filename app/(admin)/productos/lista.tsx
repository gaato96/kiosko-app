"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Search } from "lucide-react";
import { Input, Select } from "@/components/ui/campo";
import { formatearPesos, margenPct } from "@/lib/money";
import { formatearPeso } from "@/lib/peso";
import { normalizar } from "@/lib/db/schema";
import type { Categoria, Producto } from "@/lib/tipos";
import { cn } from "@/lib/utils";

export function ListaProductos({
  productos,
  categorias,
  costos,
}: {
  productos: Producto[];
  categorias: Categoria[];
  costos: Record<string, number>;
}) {
  const [consulta, setConsulta] = useState("");
  const [categoriaId, setCategoriaId] = useState("");

  const filtrados = useMemo(() => {
    const q = normalizar(consulta);
    return productos.filter((p) => {
      if (categoriaId && p.categoria_id !== categoriaId) return false;
      if (q === "") return true;
      return normalizar(p.nombre).includes(q) || p.alias?.some((a) => normalizar(a).includes(q));
    });
  }, [productos, consulta, categoriaId]);

  const nombreCategoria = useMemo(
    () => Object.fromEntries(categorias.map((c) => [c.id, c.nombre])),
    [categorias],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <Input
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            placeholder="Buscar…"
            className="pl-10"
            aria-label="Buscar producto"
          />
        </div>
        <Select
          value={categoriaId}
          onChange={(e) => setCategoriaId(e.target.value)}
          className="w-56"
          aria-label="Filtrar por categoría"
        >
          <option value="">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </Select>
      </div>

      <div className="overflow-x-auto rounded-[var(--radio)] border border-border">
        <table className="w-full min-w-3xl border-collapse bg-surface text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-muted">
              <th className="p-3">Producto</th>
              <th className="p-3">Categoría</th>
              <th className="p-3 text-right">Precio</th>
              <th className="p-3 text-right">Costo</th>
              <th className="p-3 text-right">Margen</th>
              <th className="p-3 text-right">Stock</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((p) => {
              const esPeso = p.tipo_venta === "PESO";
              const precio = (esPeso ? p.precio_por_kg_centavos : p.precio_venta_centavos) ?? 0;
              const costo = costos[p.id] ?? 0;
              const margen = margenPct(precio, costo);
              const bajoMinimo = p.controla_stock && p.stock_actual <= p.stock_minimo;

              return (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="p-3">
                    <span className="font-medium">{p.nombre}</span>
                    {esPeso ? <span className="ml-2 text-xs text-text-muted">por peso</span> : null}
                    {p.tipo_producto === "SERVICIO" ? (
                      <span className="ml-2 rounded bg-surface-alt px-1.5 py-0.5 text-xs">servicio</span>
                    ) : null}
                  </td>
                  <td className="p-3 text-text-muted">
                    {p.categoria_id ? nombreCategoria[p.categoria_id] : "—"}
                  </td>
                  <td className="num p-3 text-right font-semibold">
                    {formatearPesos(precio)}
                    {esPeso ? <span className="text-xs text-text-muted"> /kg</span> : null}
                  </td>
                  <td className="num p-3 text-right text-text-muted">
                    {costo > 0 ? formatearPesos(costo) : "—"}
                  </td>
                  <td
                    className={cn(
                      "num p-3 text-right",
                      margen < 0 ? "font-semibold text-danger" : margen < 15 ? "text-warning" : "",
                    )}
                  >
                    {costo > 0 ? `${margen.toFixed(0)}%` : "—"}
                    {margen < 0 && costo > 0 ? (
                      <AlertTriangle size={14} className="ml-1 inline" aria-label="Margen negativo" />
                    ) : null}
                  </td>
                  <td className={cn("num p-3 text-right", bajoMinimo && "text-warning")}>
                    {!p.controla_stock
                      ? "—"
                      : esPeso
                        ? formatearPeso(p.stock_actual)
                        : p.stock_actual}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filtrados.length === 0 ? (
        <p className="p-4 text-center text-text-muted">No hay productos que coincidan.</p>
      ) : null}
    </div>
  );
}
