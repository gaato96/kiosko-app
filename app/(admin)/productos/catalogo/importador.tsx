"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Search } from "lucide-react";
import { Boton } from "@/components/ui/boton";
import { Input } from "@/components/ui/campo";
import { normalizar } from "@/lib/db/schema";
import { parsearPesos } from "@/lib/money";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { CatalogoBase } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

type Elegido = { precio: string };

export function ImportadorCatalogo({
  catalogo,
  yaCargados,
}: {
  catalogo: CatalogoBase[];
  yaCargados: string[];
}) {
  const router = useRouter();
  const cargados = useMemo(() => new Set(yaCargados), [yaCargados]);

  const [consulta, setConsulta] = useState("");
  const [categoria, setCategoria] = useState<string | null>(null);
  const [elegidos, setElegidos] = useState<Record<string, Elegido>>({});
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);

  const categorias = useMemo(
    () => Array.from(new Set(catalogo.map((c) => c.categoria_sugerida))).sort(),
    [catalogo],
  );

  const visibles = useMemo(() => {
    const q = normalizar(consulta);
    return catalogo.filter((c) => {
      if (categoria && c.categoria_sugerida !== categoria) return false;
      if (q === "") return true;
      return (
        normalizar(c.nombre).includes(q) ||
        (c.marca ? normalizar(c.marca).includes(q) : false) ||
        c.alias.some((a) => normalizar(a).includes(q))
      );
    });
  }, [catalogo, consulta, categoria]);

  const listos = Object.entries(elegidos).filter(([, v]) => (parsearPesos(v.precio) ?? 0) > 0);

  async function importar() {
    setGuardando(true);
    setResultado(null);

    const items = listos.map(([id, v]) => {
      const base = catalogo.find((c) => c.id === id)!;
      return {
        nombre: base.nombre,
        categoria: base.categoria_sugerida,
        tipo_venta: base.tipo_venta,
        alias: base.alias,
        codigo_barras: base.codigo_barras,
        precio_centavos: parsearPesos(v.precio) ?? 0,
        // El costo no se pide acá: pedirlo en el alta es fricción y el dueño
        // rara vez lo sabe de memoria. Se completa solo al cargar la primera
        // compra del proveedor.
        costo_centavos: 0,
        stock_inicial: 0,
        stock_minimo: 0,
      };
    });

    const { data, error } = await supabaseBrowser().rpc("importar_catalogo_base", {
      payload: { items },
    });

    setGuardando(false);
    if (error) {
      setResultado(`No se pudo importar: ${error.message}`);
      return;
    }

    setResultado(`Se cargaron ${data} productos. Ya podés cobrarlos.`);
    setElegidos({});
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <Input
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            placeholder="Buscar en el catálogo…"
            className="pl-10"
            aria-label="Buscar en el catálogo"
          />
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto sin-scrollbar">
        <Chip activo={categoria === null} onClick={() => setCategoria(null)}>
          Todo ({catalogo.length})
        </Chip>
        {categorias.map((c) => (
          <Chip key={c} activo={categoria === c} onClick={() => setCategoria(c)}>
            {c}
          </Chip>
        ))}
      </div>

      <ul className="flex flex-col divide-y divide-border tarjeta">
        {visibles.map((c) => {
          const yaEsta = cargados.has(c.nombre.toLowerCase());
          const elegido = elegidos[c.id];

          return (
            <li key={c.id} className="flex flex-wrap items-center gap-3 p-3">
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  className="h-6 w-6 shrink-0 accent-[var(--primary)]"
                  disabled={yaEsta}
                  checked={Boolean(elegido)}
                  onChange={(e) =>
                    setElegidos((prev) => {
                      const copia = { ...prev };
                      if (e.target.checked) copia[c.id] = { precio: "" };
                      else delete copia[c.id];
                      return copia;
                    })
                  }
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{c.nombre}</span>
                  <span className="block text-xs text-text-muted">
                    {c.categoria_sugerida}
                    {c.tipo_venta === "PESO" ? " · por peso" : ""}
                    {yaEsta ? " · ya lo tenés cargado" : ""}
                  </span>
                </span>
              </label>

              {elegido ? (
                <Input
                  inputMode="numeric"
                  autoFocus
                  className="min-h-12 w-36"
                  value={elegido.precio}
                  onChange={(e) =>
                    setElegidos((prev) => ({ ...prev, [c.id]: { precio: e.target.value } }))
                  }
                  placeholder={c.tipo_venta === "PESO" ? "$ por kilo" : "$ precio"}
                  aria-label={`Precio de ${c.nombre}`}
                />
              ) : null}
            </li>
          );
        })}
      </ul>

      {resultado ? (
        <p className="tarjeta p-4">{resultado}</p>
      ) : null}

      {/* Barra fija: el dueño va tildando y ve siempre cuántos lleva. */}
      <div className="sticky bottom-0 flex items-center gap-3 border-t border-border bg-bg py-3">
        <p className="flex-1 text-sm text-text-muted">
          {listos.length === 0
            ? "Tildá productos y ponele precio a cada uno."
            : `${listos.length} listos para cargar`}
        </p>
        <Boton
          variante="primario"
          tamano="grande"
          disabled={listos.length === 0 || guardando}
          onClick={importar}
        >
          <Check size={20} />
          {guardando ? "Cargando…" : `Cargar ${listos.length}`}
        </Boton>
      </div>
    </div>
  );
}

function Chip({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium",
        activo ? "border-primary bg-primary text-primary-fg" : "border-border bg-surface",
      )}
    >
      {children}
    </button>
  );
}
