"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Eye, RotateCcw, TrendingUp } from "lucide-react";
import { Boton } from "@/components/ui/boton";
import { Campo, Input, Select } from "@/components/ui/campo";
import { ETIQUETAS_REDONDEO, UNIDADES_REDONDEO, formatearPesos } from "@/lib/money";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

type FilaPrevia = {
  id: string;
  nombre: string;
  precio_actual: number;
  precio_nuevo: number;
  margen_negativo: boolean;
};

type Previa = { lote_id: string | null; cantidad: number; previa: FilaPrevia[] };

const PORCENTAJES_RAPIDOS = [5, 10, 12, 15, 20, 25] as const;

export function ActualizadorPrecios({
  categorias,
  proveedores,
  redondeoCentavos,
  lotesRecientes,
}: {
  categorias: Array<{ id: string; nombre: string }>;
  proveedores: Array<{ id: string; nombre: string }>;
  redondeoCentavos: number;
  lotesRecientes: Array<{ loteId: string; creadoEn: string }>;
}) {
  const router = useRouter();

  const [pct, setPct] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [proveedorId, setProveedorId] = useState("");
  const [redondeo, setRedondeo] = useState(String(redondeoCentavos));
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const porcentaje = Number(pct.replace(",", "."));
  const valido = Number.isFinite(porcentaje) && porcentaje !== 0;

  function filtros(aplicar: boolean) {
    return {
      pct: porcentaje,
      redondeo_centavos: Number(redondeo),
      categoria_id: categoriaId || null,
      proveedor_id: proveedorId || null,
      aplicar,
    };
  }

  async function verPrevia() {
    setTrabajando(true);
    setAviso(null);
    const { data, error } = await supabaseBrowser().rpc("actualizar_precios_masivo", {
      payload: filtros(false),
    });
    setTrabajando(false);
    if (error) return setAviso(error.message);
    setPrevia(data as Previa);
  }

  async function aplicar() {
    setTrabajando(true);
    const { data, error } = await supabaseBrowser().rpc("actualizar_precios_masivo", {
      payload: filtros(true),
    });
    setTrabajando(false);
    if (error) return setAviso(error.message);

    const r = data as Previa;
    setPrevia(null);
    setPct("");
    setAviso(`Listo: ${r.cantidad} precios actualizados. Podés deshacerlo hasta mañana.`);
    router.refresh();
  }

  async function deshacer(loteId: string) {
    setTrabajando(true);
    const { data, error } = await supabaseBrowser().rpc("deshacer_lote_precios", {
      p_lote_id: loteId,
    });
    setTrabajando(false);
    if (error) return setAviso(error.message);
    setAviso(`Se revirtieron ${data} precios.`);
    router.refresh();
  }

  const conMargenNegativo = previa?.previa.filter((f) => f.margen_negativo) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 tarjeta p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Campo etiqueta="Porcentaje" ayuda="Negativo para bajar precios.">
            <Input
              inputMode="decimal"
              value={pct}
              onChange={(e) => {
                setPct(e.target.value);
                setPrevia(null);
              }}
              placeholder="12"
            />
          </Campo>

          <Campo etiqueta="Categoría">
            <Select
              value={categoriaId}
              onChange={(e) => {
                setCategoriaId(e.target.value);
                setPrevia(null);
              }}
            >
              <option value="">Todas</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Select>
          </Campo>

          <Campo etiqueta="Proveedor">
            <Select
              value={proveedorId}
              onChange={(e) => {
                setProveedorId(e.target.value);
                setPrevia(null);
              }}
            >
              <option value="">Todos</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </Select>
          </Campo>

          <Campo etiqueta="Redondeo">
            <Select
              value={redondeo}
              onChange={(e) => {
                setRedondeo(e.target.value);
                setPrevia(null);
              }}
            >
              {UNIDADES_REDONDEO.map((u) => (
                <option key={u} value={u}>
                  {ETIQUETAS_REDONDEO[u]}
                </option>
              ))}
            </Select>
          </Campo>
        </div>

        <div className="flex flex-wrap gap-2">
          {PORCENTAJES_RAPIDOS.map((p) => (
            <Boton
              key={p}
              tamano="chico"
              onClick={() => {
                setPct(String(p));
                setPrevia(null);
              }}
            >
              +{p}%
            </Boton>
          ))}
        </div>

        <Boton variante="primario" tamano="grande" disabled={!valido || trabajando} onClick={verPrevia}>
          <Eye size={20} /> Ver qué queda
        </Boton>
      </section>

      {aviso ? (
        <p className="tarjeta p-4">{aviso}</p>
      ) : null}

      {previa ? (
        <section className="flex flex-col gap-3 tarjeta p-5">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-semibold">
              <TrendingUp size={18} /> Vista previa · {previa.cantidad} productos
            </h2>
            <Boton
              variante="primario"
              tamano="grande"
              disabled={trabajando || previa.cantidad === 0}
              onClick={aplicar}
            >
              Aplicar a {previa.cantidad} productos
            </Boton>
          </header>

          {conMargenNegativo.length > 0 ? (
            <p className="flex items-start gap-2 rounded-[var(--radio)] border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              {conMargenNegativo.length} productos quedan por debajo de su costo. Revisalos antes de
              aplicar: se venderían perdiendo plata.
            </p>
          ) : null}

          <div className="max-h-96 overflow-y-auto rounded-[var(--radio)] border border-border">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-surface-alt">
                <tr className="text-left text-xs uppercase tracking-wide text-text-muted">
                  <th className="p-2">Producto</th>
                  <th className="p-2 text-right">Ahora</th>
                  <th className="p-2 text-right">Queda en</th>
                  <th className="p-2 text-right">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {previa.previa.map((f) => (
                  <tr
                    key={f.id}
                    className={cn("border-t border-border", f.margen_negativo && "bg-danger/10")}
                  >
                    <td className="p-2">{f.nombre}</td>
                    <td className="num p-2 text-right text-text-muted">
                      {formatearPesos(f.precio_actual)}
                    </td>
                    <td className="num p-2 text-right font-semibold">
                      {formatearPesos(f.precio_nuevo)}
                    </td>
                    <td className="num p-2 text-right">
                      {formatearPesos(f.precio_nuevo - f.precio_actual, { signo: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {lotesRecientes.length > 0 ? (
        <section className="flex flex-col gap-2 tarjeta p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <RotateCcw size={18} /> Deshacer
          </h2>
          <p className="text-sm text-text-muted">
            Las actualizaciones masivas se pueden revertir durante 24 horas. Después no, porque el
            historial posterior ya no sería confiable.
          </p>
          <ul className="flex flex-col gap-2">
            {lotesRecientes.map((l) => (
              <li key={l.loteId} className="flex items-center justify-between gap-2">
                <span className="text-sm">
                  {new Date(l.creadoEn).toLocaleString("es-AR")}
                </span>
                <Boton tamano="chico" disabled={trabajando} onClick={() => deshacer(l.loteId)}>
                  Deshacer
                </Boton>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
