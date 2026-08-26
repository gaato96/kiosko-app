"use client";

/**
 * El listado de mercadería.
 *
 * Cada fila abre el editor: el listado no es un informe para mirar, es por
 * donde se corrige el precio que quedó viejo.
 *
 * En celular NO es una tabla. Seis columnas en 375 px obligan a scrollear de
 * costado para ver el margen, que es justamente la columna que importa. Abajo
 * de `md` cada producto es una tarjeta con lo mismo, apilado.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, Plus, Search, Tag } from "lucide-react";
import { Boton } from "@/components/ui/boton";
import { Input, Select } from "@/components/ui/campo";
import { formatearPesos, margenPct } from "@/lib/money";
import { formatearPeso } from "@/lib/peso";
import { normalizar } from "@/lib/db/schema";
import type { Categoria, Producto } from "@/lib/tipos";
import { cn } from "@/lib/utils";
import { AdminCategorias } from "./categorias";
import { EditorProducto } from "./editor";

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
  const [editando, setEditando] = useState<Producto | null>(null);
  const [editorAbierto, setEditorAbierto] = useState(false);
  const [categoriasAbiertas, setCategoriasAbiertas] = useState(false);

  const filtrados = useMemo(() => {
    const q = normalizar(consulta);
    return productos.filter((p) => {
      if (categoriaId && p.categoria_id !== categoriaId) return false;
      if (q === "") return true;
      return (
        normalizar(p.nombre).includes(q) ||
        p.codigo_barras?.includes(q) ||
        p.alias?.some((a) => normalizar(a).includes(q))
      );
    });
  }, [productos, consulta, categoriaId]);

  const nombreCategoria = useMemo(
    () => Object.fromEntries(categorias.map((c) => [c.id, c.nombre])),
    [categorias],
  );

  function abrir(p: Producto | null) {
    setEditando(p);
    setEditorAbierto(true);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Barra de trabajo. El alta va primero y visible: era justamente lo que
          no se podía hacer. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-0 flex-1 sm:min-w-56">
          <Search
            size={18}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted"
            aria-hidden
          />
          <Input
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            placeholder="Buscar por nombre o código…"
            className="pl-11"
            aria-label="Buscar producto"
          />
        </div>

        <Select
          value={categoriaId}
          onChange={(e) => setCategoriaId(e.target.value)}
          className="sm:w-52"
          aria-label="Filtrar por categoría"
        >
          <option value="">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </Select>

        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Boton onClick={() => setCategoriasAbiertas(true)}>
            <Tag size={17} /> Categorías
          </Boton>
          <Boton variante="primario" onClick={() => abrir(null)}>
            <Plus size={18} /> Nuevo producto
          </Boton>
        </div>
      </div>

      {filtrados.length === 0 ? (
        <p className="tarjeta p-6 text-center text-text-muted">
          No hay productos que coincidan.{" "}
          <button
            type="button"
            onClick={() => abrir(null)}
            className="font-semibold text-brand hover:underline hover:underline-offset-4"
          >
            Cargalo como nuevo
          </button>
          .
        </p>
      ) : (
        <>
          {/* Celular y tablet chica: tarjetas. */}
          <ul className="flex flex-col gap-2 md:hidden">
            {filtrados.map((p) => (
              <li key={p.id}>
                <FichaProducto
                  producto={p}
                  costo={costos[p.id] ?? 0}
                  categoria={(p.categoria_id ? nombreCategoria[p.categoria_id] : null) ?? null}
                  onAbrir={() => abrir(p)}
                />
              </li>
            ))}
          </ul>

          {/* Escritorio: tabla, que es donde se compara de un vistazo. */}
          <div className="hidden overflow-x-auto rounded-[var(--radio-lg)] border border-border md:block">
            <table className="w-full border-collapse bg-surface text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="rotulo p-3">Producto</th>
                  <th className="rotulo p-3">Categoría</th>
                  <th className="rotulo p-3 text-right">Precio</th>
                  <th className="rotulo p-3 text-right">Costo</th>
                  <th className="rotulo p-3 text-right">Margen</th>
                  <th className="rotulo p-3 text-right">Stock</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((p) => {
                  const d = datosDe(p, costos[p.id] ?? 0);
                  return (
                    <tr
                      key={p.id}
                      onClick={() => abrir(p)}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") abrir(p);
                      }}
                      className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-alt focus:bg-surface-alt focus:outline-none"
                    >
                      <td className="p-3">
                        <span className="font-medium">{p.nombre}</span>
                        {d.esPeso ? (
                          <span className="ml-2 text-xs text-text-muted">por peso</span>
                        ) : null}
                        {p.tipo_producto === "SERVICIO" ? (
                          <span className="ml-2 rounded bg-surface-alt px-1.5 py-0.5 text-xs">
                            servicio
                          </span>
                        ) : null}
                      </td>
                      <td className="p-3 text-text-muted">
                        {p.categoria_id ? nombreCategoria[p.categoria_id] : "—"}
                      </td>
                      <td className="num p-3 text-right font-semibold">
                        {formatearPesos(d.precio)}
                        {d.esPeso ? <span className="text-xs text-text-muted"> /kg</span> : null}
                      </td>
                      <td className="num p-3 text-right text-text-muted">
                        {d.costo > 0 ? formatearPesos(d.costo) : "—"}
                      </td>
                      <td className={cn("num p-3 text-right", d.claseMargen)}>
                        {d.costo > 0 ? `${d.margen.toFixed(0)}%` : "—"}
                        {d.negativo ? (
                          <AlertTriangle
                            size={14}
                            className="ml-1 inline"
                            aria-label="Margen negativo"
                          />
                        ) : null}
                      </td>
                      <td className={cn("num p-3 text-right", d.bajoMinimo && "text-warning")}>
                        {d.textoStock}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <EditorProducto
        abierto={editorAbierto}
        producto={editando}
        costo={editando ? (costos[editando.id] ?? 0) : 0}
        categorias={categorias}
        onCerrar={() => setEditorAbierto(false)}
      />

      <AdminCategorias
        abierto={categoriasAbiertas}
        categorias={categorias}
        onCerrar={() => setCategoriasAbiertas(false)}
      />
    </div>
  );
}

/** Lo que se muestra de un producto, calculado una sola vez para los dos layouts. */
function datosDe(p: Producto, costo: number) {
  const esPeso = p.tipo_venta === "PESO";
  const precio = (esPeso ? p.precio_por_kg_centavos : p.precio_venta_centavos) ?? 0;
  const margen = margenPct(precio, costo);
  const negativo = margen < 0 && costo > 0;

  return {
    esPeso,
    precio,
    costo,
    margen,
    negativo,
    bajoMinimo: p.controla_stock && p.stock_actual <= p.stock_minimo,
    claseMargen: negativo
      ? "font-semibold text-danger"
      : margen < 15 && costo > 0
        ? "text-warning"
        : "",
    textoStock: !p.controla_stock
      ? "—"
      : esPeso
        ? formatearPeso(p.stock_actual)
        : String(p.stock_actual),
  };
}

function FichaProducto({
  producto: p,
  costo,
  categoria,
  onAbrir,
}: {
  producto: Producto;
  costo: number;
  categoria: string | null;
  onAbrir: () => void;
}) {
  const d = datosDe(p, costo);

  return (
    <button
      type="button"
      onClick={onAbrir}
      className="presion w-full rounded-[var(--radio-lg)] border border-border bg-surface p-3.5 text-left hover:border-border-fuerte"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold leading-tight">{p.nombre}</p>
          <p className="text-sm text-text-muted">
            {categoria ?? "Sin categoría"}
            {d.esPeso ? " · por peso" : ""}
          </p>
        </div>
        <p className="num shrink-0 text-lg font-bold">
          {formatearPesos(d.precio)}
          {d.esPeso ? <span className="text-xs font-normal text-text-muted"> /kg</span> : null}
        </p>
      </div>

      <dl className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <div className="flex gap-1.5">
          <dt className="text-text-muted">Costo</dt>
          <dd className="num">{d.costo > 0 ? formatearPesos(d.costo) : "—"}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-text-muted">Margen</dt>
          <dd className={cn("num", d.claseMargen)}>
            {d.costo > 0 ? `${d.margen.toFixed(0)}%` : "—"}
            {d.negativo ? (
              <AlertTriangle size={13} className="ml-1 inline" aria-label="Margen negativo" />
            ) : null}
          </dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-text-muted">Stock</dt>
          <dd className={cn("num", d.bajoMinimo && "font-semibold text-warning")}>
            {d.textoStock}
          </dd>
        </div>
      </dl>
    </button>
  );
}
