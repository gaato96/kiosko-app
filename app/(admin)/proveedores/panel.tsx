"use client";

/**
 * El ABM de proveedores, con lo que de verdad hace falta para que sirva:
 *
 * · El teléfono es el campo que importa. Sin teléfono el pedido no se manda:
 *   se copia al portapapeles y alguien lo tiene que pegar a mano.
 *
 * · Asignar productos EN LOTE. Nadie entra a los 400 productos de a uno a
 *   elegirle proveedor. Sin esto, cargar proveedores no cambia nada: la lista
 *   de reposición sigue agrupando todo bajo "Sin proveedor".
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Search, Trash2, Truck } from "lucide-react";
import { Boton } from "@/components/ui/boton";
import { Campo, Input, Textarea } from "@/components/ui/campo";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { Hoja } from "@/components/ui/hoja";
import { normalizar } from "@/lib/db/schema";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Proveedor } from "@/lib/tipos";
import { cn } from "@/lib/utils";

export type ProductoDeProveedor = {
  id: string;
  nombre: string;
  proveedor_id: string | null;
  categoria_id: string | null;
};

/** Los días en que pasa el repartidor. Es dato de mostrador, no decoración. */
const DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;

type Borrador = {
  nombre: string;
  telefono: string;
  contacto: string;
  diasVisita: string[];
  notas: string;
};

const VACIO: Borrador = { nombre: "", telefono: "", contacto: "", diasVisita: [], notas: "" };

export function PanelProveedores({
  proveedores,
  productos,
}: {
  proveedores: Proveedor[];
  productos: ProductoDeProveedor[];
}) {
  const router = useRouter();
  const [editando, setEditando] = useState<Proveedor | null>(null);
  const [editorAbierto, setEditorAbierto] = useState(false);
  const [asignando, setAsignando] = useState<Proveedor | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cuantosProductos = useMemo(() => {
    const cuenta = new Map<string, number>();
    for (const p of productos) {
      if (!p.proveedor_id) continue;
      cuenta.set(p.proveedor_id, (cuenta.get(p.proveedor_id) ?? 0) + 1);
    }
    return cuenta;
  }, [productos]);

  const sinProveedor = productos.filter((p) => !p.proveedor_id).length;

  async function archivar(p: Proveedor) {
    const { data, error } = await supabaseBrowser().rpc("archivar_proveedor", { p_id: p.id });
    if (error) return setAviso(error.message);
    const sueltos = (data as { productos_sueltos?: number } | null)?.productos_sueltos ?? 0;
    setAviso(
      sueltos > 0
        ? `“${p.nombre}” quedó archivado. Sus ${sueltos} productos siguen a la venta, sin proveedor.`
        : `“${p.nombre}” quedó archivado.`,
    );
    router.refresh();
  }

  function abrir(p: Proveedor | null) {
    setEditando(p);
    setEditorAbierto(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-muted">
          {sinProveedor > 0
            ? `${sinProveedor} ${sinProveedor === 1 ? "producto no tiene" : "productos no tienen"} proveedor asignado.`
            : "Todos los productos tienen proveedor."}
        </p>
        <Boton variante="primario" onClick={() => abrir(null)}>
          <Plus size={18} /> Nuevo proveedor
        </Boton>
      </div>

      {aviso ? <p className="tarjeta p-4 text-sm">{aviso}</p> : null}

      {proveedores.length === 0 ? (
        <EstadoVacio
          icono={Truck}
          titulo="Todavía no cargaste ningún proveedor"
          detalle="Cargá la distribuidora, la panadería y el de golosinas. Con el teléfono de cada uno, “Para reponer” arma el pedido y lo manda por WhatsApp."
          accion={
            <Boton variante="primario" tamano="grande" onClick={() => abrir(null)}>
              <Plus size={20} /> Cargar el primero
            </Boton>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {proveedores.map((p) => (
            <li key={p.id} className="tarjeta flex flex-wrap items-center gap-3 p-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-alt text-text-muted">
                <Truck size={19} aria-hidden />
              </span>

              <button
                type="button"
                onClick={() => abrir(p)}
                className="min-w-40 flex-1 text-left"
              >
                <span className="block font-semibold leading-tight">{p.nombre}</span>
                <span className="block text-sm text-text-muted">
                  {p.telefono ? (
                    <span className="num">{p.telefono}</span>
                  ) : (
                    <span className="text-warning">sin teléfono</span>
                  )}
                  {p.contacto ? ` · ${p.contacto}` : ""}
                  {p.dias_visita?.length ? ` · pasa ${p.dias_visita.join(", ")}` : ""}
                </span>
              </button>

              <span className="text-sm text-text-muted">
                {cuantosProductos.get(p.id) ?? 0} productos
              </span>

              <Boton tamano="chico" onClick={() => setAsignando(p)}>
                Asignar productos
              </Boton>

              <Boton
                tamano="chico"
                variante="fantasma"
                onClick={() => archivar(p)}
                aria-label={`Dar de baja a ${p.nombre}`}
              >
                <Trash2 size={16} />
              </Boton>
            </li>
          ))}
        </ul>
      )}

      <EditorProveedor
        abierto={editorAbierto}
        proveedor={editando}
        onCerrar={() => setEditorAbierto(false)}
      />

      <AsignarProductos
        proveedor={asignando}
        productos={productos}
        onCerrar={() => setAsignando(null)}
        onListo={(cuantos, nombre) => {
          setAsignando(null);
          setAviso(`${cuantos} productos quedaron a nombre de ${nombre}.`);
          router.refresh();
        }}
      />
    </div>
  );
}

function EditorProveedor({
  abierto,
  proveedor,
  onCerrar,
}: {
  abierto: boolean;
  proveedor: Proveedor | null;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [b, setB] = useState<Borrador>(VACIO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // `abierto` cambia antes que el contenido: el borrador se rearma cuando la
  // hoja se abre, no en un efecto que se pisa con lo que el usuario escribió.
  const [ultimo, setUltimo] = useState<string | null>(null);

  const clave = `${abierto}:${proveedor?.id ?? "nuevo"}`;
  if (abierto && ultimo !== clave) {
    setUltimo(clave);
    setB(
      proveedor
        ? {
            nombre: proveedor.nombre,
            telefono: proveedor.telefono ?? "",
            contacto: proveedor.contacto ?? "",
            diasVisita: proveedor.dias_visita ?? [],
            notas: proveedor.notas ?? "",
          }
        : VACIO,
    );
    setError(null);
  }

  const set = <K extends keyof Borrador>(k: K, v: Borrador[K]) =>
    setB((prev) => ({ ...prev, [k]: v }));

  async function guardar() {
    setGuardando(true);
    setError(null);
    const { error: e } = await supabaseBrowser().rpc("guardar_proveedor", {
      payload: {
        id: proveedor?.id ?? null,
        nombre: b.nombre.trim(),
        telefono: b.telefono.trim() || null,
        contacto: b.contacto.trim() || null,
        dias_visita: b.diasVisita,
        notas: b.notas.trim() || null,
      },
    });
    setGuardando(false);
    if (e) return setError(e.message);
    onCerrar();
    router.refresh();
  }

  return (
    <Hoja
      abierta={abierto}
      onCerrar={onCerrar}
      titulo={proveedor ? proveedor.nombre : "Nuevo proveedor"}
      descripcion="Con el teléfono cargado, el pedido de reposición se manda por WhatsApp de un toque."
    >
      <div className="flex flex-col gap-5 p-5">
        <Campo etiqueta="Nombre" requerido>
          <Input
            value={b.nombre}
            onChange={(e) => set("nombre", e.target.value)}
            placeholder="Distribuidora del Centro"
            autoFocus
          />
        </Campo>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="WhatsApp" ayuda="Sin el teléfono, el pedido se copia en vez de mandarse.">
            <Input
              inputMode="tel"
              value={b.telefono}
              onChange={(e) => set("telefono", e.target.value)}
              placeholder="11 2233 4455"
              className="num"
            />
          </Campo>

          <Campo etiqueta="Con quién hablás" ayuda="El nombre del preventista o del repartidor.">
            <Input
              value={b.contacto}
              onChange={(e) => set("contacto", e.target.value)}
              placeholder="Rubén"
            />
          </Campo>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="rotulo mb-1">Qué días pasa</legend>
          <div className="flex flex-wrap gap-2">
            {DIAS.map((d) => {
              const puesto = b.diasVisita.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={puesto}
                  onClick={() =>
                    set(
                      "diasVisita",
                      puesto ? b.diasVisita.filter((x) => x !== d) : [...b.diasVisita, d],
                    )
                  }
                  className={cn(
                    "presion min-h-11 rounded-full border px-4 text-sm font-semibold capitalize",
                    puesto
                      ? "border-tinta bg-tinta text-brand-fg"
                      : "border-border bg-surface text-text-muted hover:border-border-fuerte",
                  )}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </fieldset>

        <Campo etiqueta="Notas" ayuda="Mínimo de compra, días de entrega, lo que sea.">
          <Textarea value={b.notas} onChange={(e) => set("notas", e.target.value)} rows={2} />
        </Campo>

        {error ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
      </div>

      <footer className="borde-seguro sticky bottom-0 flex gap-2 border-t border-border bg-surface/95 px-4 pt-4 backdrop-blur">
        <Boton
          variante="primario"
          ancho="completo"
          cargando={guardando}
          disabled={b.nombre.trim() === ""}
          onClick={guardar}
        >
          {proveedor ? "Guardar cambios" : "Crear proveedor"}
        </Boton>
      </footer>
    </Hoja>
  );
}

/**
 * Asignación en lote. Se tildan productos y se les pone el proveedor de una.
 * Vienen pre-tildados los que ya son de él, así que la pantalla también sirve
 * para SACARLE productos.
 */
function AsignarProductos({
  proveedor,
  productos,
  onCerrar,
  onListo,
}: {
  proveedor: Proveedor | null;
  productos: ProductoDeProveedor[];
  onCerrar: () => void;
  onListo: (cuantos: number, nombre: string) => void;
}) {
  const [consulta, setConsulta] = useState("");
  const [tildados, setTildados] = useState<Set<string>>(new Set());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ultimo, setUltimo] = useState<string | null>(null);

  if (proveedor && ultimo !== proveedor.id) {
    setUltimo(proveedor.id);
    setTildados(new Set(productos.filter((p) => p.proveedor_id === proveedor.id).map((p) => p.id)));
    setConsulta("");
    setError(null);
  }

  const visibles = useMemo(() => {
    const q = normalizar(consulta);
    const lista = q === "" ? productos : productos.filter((p) => normalizar(p.nombre).includes(q));
    return lista.slice(0, 300);
  }, [productos, consulta]);

  async function guardar() {
    if (!proveedor) return;
    setGuardando(true);
    setError(null);

    const yaEran = new Set(
      productos.filter((p) => p.proveedor_id === proveedor.id).map((p) => p.id),
    );
    const sumar = [...tildados].filter((id) => !yaEran.has(id));
    const quitar = [...yaEran].filter((id) => !tildados.has(id));

    const sb = supabaseBrowser();
    const llamadas = [];
    if (sumar.length > 0) {
      llamadas.push(sb.rpc("asignar_proveedor", { p_proveedor_id: proveedor.id, p_productos: sumar }));
    }
    if (quitar.length > 0) {
      llamadas.push(sb.rpc("asignar_proveedor", { p_proveedor_id: null, p_productos: quitar }));
    }

    const resultados = await Promise.all(llamadas);
    setGuardando(false);

    const fallo = resultados.find((r) => r.error);
    if (fallo?.error) return setError(fallo.error.message);

    onListo(tildados.size, proveedor.nombre);
  }

  return (
    <Hoja
      abierta={proveedor !== null}
      onCerrar={onCerrar}
      tamano="ancha"
      titulo={proveedor ? `Productos de ${proveedor.nombre}` : ""}
      descripcion="Tildá todo lo que le comprás a este proveedor. Eso es lo que después agrupa el pedido de reposición."
    >
      <div className="flex flex-col gap-3 p-4">
        <div className="relative">
          <Search
            size={18}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted"
            aria-hidden
          />
          <Input
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            placeholder="Buscar producto…"
            className="pl-11"
            aria-label="Buscar producto"
          />
        </div>

        <p className="text-sm text-text-muted">
          {tildados.size} tildados
          {visibles.length < productos.length ? ` · mostrando ${visibles.length}` : ""}
        </p>

        <ul className="flex max-h-[55dvh] flex-col divide-y divide-border overflow-y-auto rounded-[var(--radio)] border border-border">
          {visibles.map((p) => {
            const puesto = tildados.has(p.id);
            const deOtro = p.proveedor_id !== null && p.proveedor_id !== proveedor?.id;
            return (
              <li key={p.id}>
                <label className="flex min-h-14 cursor-pointer items-center gap-3 px-3 py-2">
                  <input
                    type="checkbox"
                    className="h-6 w-6 shrink-0 accent-[var(--primary)]"
                    checked={puesto}
                    onChange={(e) =>
                      setTildados((antes) => {
                        const copia = new Set(antes);
                        if (e.target.checked) copia.add(p.id);
                        else copia.delete(p.id);
                        return copia;
                      })
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{p.nombre}</span>
                    {deOtro ? (
                      <span className="block text-xs text-text-muted">
                        hoy es de otro proveedor
                      </span>
                    ) : null}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>

        {error ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
      </div>

      <footer className="borde-seguro sticky bottom-0 flex gap-2 border-t border-border bg-surface/95 px-4 pt-4 backdrop-blur">
        <Boton variante="fantasma" onClick={onCerrar}>
          Cancelar
        </Boton>
        <Boton variante="primario" ancho="completo" cargando={guardando} onClick={guardar}>
          <Check size={18} /> Guardar
        </Boton>
      </footer>
    </Hoja>
  );
}
