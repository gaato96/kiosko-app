"use client";

/**
 * Administrar categorías.
 *
 * Vive dentro de Productos y no como sección propia del menú: una categoría no
 * es un destino al que alguien entra, es algo que se toca cuando se está
 * cargando mercadería y falta el rubro.
 *
 * Las categorías no se borran, se archivan. Borrar una dejaría a todos sus
 * productos sin clasificar de un saque, y el POS agrupa las teclas rápidas por
 * categoría: se rompería la pantalla de cobro por un click en el admin.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GripVertical, Plus, Tag, Trash2 } from "lucide-react";
import { Boton } from "@/components/ui/boton";
import { Campo, Input } from "@/components/ui/campo";
import { Hoja } from "@/components/ui/hoja";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Categoria } from "@/lib/tipos";

/** Emojis que ya se usan en un kiosco argentino. Evitan abrir el teclado. */
const EMOJIS = ["🥤", "🍫", "🍬", "🚬", "🧉", "🍺", "🧃", "🍪", "🧊", "🧻", "🔋", "📱", "🍞", "🧀"];

export function AdminCategorias({
  abierto,
  categorias,
  onCerrar,
}: {
  abierto: boolean;
  categorias: Categoria[];
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState<Categoria | null>(null);
  const [nombre, setNombre] = useState("");
  const [emoji, setEmoji] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  function limpiar() {
    setEditando(null);
    setNombre("");
    setEmoji("");
    setError(null);
  }

  function elegir(c: Categoria) {
    setEditando(c);
    setNombre(c.nombre);
    setEmoji(c.emoji ?? "");
    setError(null);
  }

  async function guardar() {
    if (nombre.trim() === "") return;
    setOcupado(true);
    const { error: e } = await supabaseBrowser().rpc("guardar_categoria", {
      payload: { id: editando?.id ?? null, nombre: nombre.trim(), emoji: emoji || null },
    });
    setOcupado(false);
    if (e) return setError(e.message);
    limpiar();
    router.refresh();
  }

  async function archivar(c: Categoria) {
    setOcupado(true);
    const { data, error: e } = await supabaseBrowser().rpc("archivar_categoria", { p_id: c.id });
    setOcupado(false);
    if (e) return setError(e.message);

    const sueltos = (data as { productos_sueltos?: number } | null)?.productos_sueltos ?? 0;
    setError(
      sueltos > 0
        ? `“${c.nombre}” quedó archivada. Los ${sueltos} productos que tenía siguen a la venta, sin categoría.`
        : null,
    );
    if (editando?.id === c.id) limpiar();
    router.refresh();
  }

  return (
    <Hoja
      abierta={abierto}
      onCerrar={() => {
        limpiar();
        onCerrar();
      }}
      titulo="Categorías"
      descripcion="Son los rubros con los que se agrupan las teclas del POS y la Vidriera."
    >
      <div className="flex flex-col gap-5 p-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void guardar();
          }}
          className="tarjeta-alt/50 flex flex-col gap-4 rounded-[var(--radio-lg)] p-4"
        >
          <Campo etiqueta={editando ? `Editar “${editando.nombre}”` : "Nueva categoría"} requerido>
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Bebidas sin alcohol"
            />
          </Campo>

          <div>
            <p className="rotulo mb-2">Emoji</p>
            {/* Grilla fluida: entran los que entren según el ancho, sin
                romper en un celular angosto ni dejar huecos en escritorio. */}
            <div className="flex flex-wrap gap-1.5">
              <BotonEmoji valor="" actual={emoji} onElegir={setEmoji} etiqueta="Sin emoji">
                <Tag size={16} aria-hidden />
              </BotonEmoji>
              {EMOJIS.map((e) => (
                <BotonEmoji key={e} valor={e} actual={emoji} onElegir={setEmoji} etiqueta={e}>
                  {e}
                </BotonEmoji>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Boton
              type="submit"
              variante="primario"
              tamano="chico"
              cargando={ocupado}
              disabled={nombre.trim() === ""}
            >
              <Plus size={16} /> {editando ? "Guardar" : "Agregar"}
            </Boton>
            {editando ? (
              <Boton type="button" variante="fantasma" tamano="chico" onClick={limpiar}>
                Cancelar
              </Boton>
            ) : null}
          </div>
        </form>

        {error ? (
          <p role="alert" className="text-sm font-medium text-warning">
            {error}
          </p>
        ) : null}

        {categorias.length === 0 ? (
          <p className="text-sm text-text-muted">Todavía no hay categorías.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {categorias.map((c) => (
              <li key={c.id} className="flex items-center gap-2 py-1">
                <GripVertical size={16} className="shrink-0 text-text-sutil" aria-hidden />
                <button
                  type="button"
                  onClick={() => elegir(c)}
                  className="presion flex min-h-12 flex-1 items-center gap-2.5 rounded-[var(--radio)] px-2 text-left hover:bg-surface-alt"
                >
                  <span className="text-lg leading-none" aria-hidden>
                    {c.emoji ?? "•"}
                  </span>
                  <span className="min-w-0 truncate font-medium">{c.nombre}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void archivar(c)}
                  disabled={ocupado}
                  aria-label={`Archivar ${c.nombre}`}
                  className="presion flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radio)] text-text-muted hover:bg-danger-tenue hover:text-danger"
                >
                  <Trash2 size={16} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Hoja>
  );
}

function BotonEmoji({
  valor,
  actual,
  onElegir,
  etiqueta,
  children,
}: {
  valor: string;
  actual: string;
  onElegir: (v: string) => void;
  etiqueta: string;
  children: React.ReactNode;
}) {
  const elegido = actual === valor;
  return (
    <button
      type="button"
      onClick={() => onElegir(valor)}
      aria-label={etiqueta}
      aria-pressed={elegido}
      className={
        elegido
          ? "presion flex h-11 w-11 items-center justify-center rounded-[var(--radio)] border-2 border-tinta bg-surface text-lg"
          : "presion flex h-11 w-11 items-center justify-center rounded-[var(--radio)] border border-border bg-surface text-lg text-text-muted hover:border-border-fuerte"
      }
    >
      {children}
    </button>
  );
}
