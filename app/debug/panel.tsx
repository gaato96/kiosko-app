"use client";

/**
 * /debug — la pantalla que acompaña toda la construcción.
 * Estado de conexión, contenido del outbox, id del dispositivo y sync a mano.
 * También es la pantalla "Ventas sin sincronizar" del usuario final.
 */

import { useLiveQuery } from "dexie-react-hooks";
import { RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { EstadoSync } from "@/components/estado-sync";
import { Boton } from "@/components/ui/boton";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { idDispositivo, nombreDispositivo } from "@/lib/db/device";
import { MAX_INTENTOS, reintentar, reintentarTodo, totalSinSincronizar } from "@/lib/db/outbox";
import { db, leerMeta } from "@/lib/db/schema";
import { sincronizar } from "@/lib/db/sync";
import { formatearPesos } from "@/lib/money";
import { useConexion } from "@/lib/hooks/use-conexion";

export function PanelDebug() {
  const enLinea = useConexion();
  const [dispositivo, setDispositivo] = useState<{ id: string; nombre: string } | null>(null);
  const [ultimoPull, setUltimoPull] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);

  const cola = useLiveQuery(() => db().outbox.orderBy("creadoEn").toArray(), [], []);
  const conteos = useLiveQuery(
    async () => ({
      productos: await db().productos.count(),
      categorias: await db().categorias.count(),
      clientes: await db().clientes.count(),
      ventas: await db().ventas.count(),
      movimientos: await db().movimientos_stock.count(),
      sinSincronizar: await totalSinSincronizar(),
    }),
    [],
  );

  useEffect(() => {
    void (async () => {
      setDispositivo({ id: await idDispositivo(), nombre: await nombreDispositivo() });
      setUltimoPull((await leerMeta<string>("ultimo_pull")) ?? null);
    })();
  }, []);

  const config = useLiveQuery(() => db().config.toArray(), [], []);
  const comercioId = config?.[0]?.comercio_id;

  async function forzarSync() {
    if (!comercioId) {
      setMensaje("Todavía no hay un comercio cargado en la base local.");
      return;
    }
    setSincronizando(true);
    try {
      const r = await sincronizar(comercioId);
      setMensaje(
        r
          ? `Bajaron ${r.bajados} filas · subieron ${r.subidos} · ${r.errores} con error`
          : "Sin conexión o ya había un sync en curso.",
      );
      setUltimoPull((await leerMeta<string>("ultimo_pull")) ?? null);
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : String(e));
    } finally {
      setSincronizando(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Diagnóstico</h1>
        <EstadoSync />
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        <Dato titulo="Conexión" valor={enLinea ? "En línea" : "Sin conexión"} />
        <Dato titulo="Dispositivo" valor={dispositivo?.nombre ?? "…"} detalle={dispositivo?.id} />
        <Dato
          titulo="Último pull"
          valor={ultimoPull ? new Date(ultimoPull).toLocaleString("es-AR") : "Nunca"}
        />
        <Dato
          titulo="Sin sincronizar"
          valor={formatearPesos(conteos?.sinSincronizar ?? 0)}
          detalle={`${cola.length} operaciones en la cola`}
        />
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Contador titulo="Productos" n={conteos?.productos} />
        <Contador titulo="Categorías" n={conteos?.categorias} />
        <Contador titulo="Clientes" n={conteos?.clientes} />
        <Contador titulo="Ventas" n={conteos?.ventas} />
        <Contador titulo="Movim." n={conteos?.movimientos} />
      </section>

      <div className="flex flex-wrap gap-3">
        <Boton variante="primario" onClick={forzarSync} disabled={sincronizando}>
          <RefreshCw size={20} className={sincronizando ? "animate-spin" : ""} />
          Forzar sincronización
        </Boton>
        <Boton
          onClick={async () => {
            const n = await reintentarTodo();
            setMensaje(`${n} operaciones vuelven a la cola.`);
          }}
        >
          Reintentar las trabadas
        </Boton>
        <Boton
          variante="peligro"
          onClick={async () => {
            if (!confirm("Esto borra la copia local. Las ventas sin sincronizar se pierden.")) return;
            await db().delete();
            location.reload();
          }}
        >
          <Trash2 size={20} />
          Vaciar base local
        </Boton>
      </div>

      {mensaje ? (
        <p className="tarjeta p-4 text-sm">{mensaje}</p>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Cola de salida</h2>
        {cola.length === 0 ? (
          <EstadoVacio
            titulo="No hay nada esperando"
            detalle="Todo lo que se cobró en este dispositivo ya llegó al servidor."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {cola.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center gap-3 tarjeta p-4 text-sm"
              >
                <span className="rounded bg-surface-alt px-2 py-0.5 font-mono text-xs">{item.tipo}</span>
                <span
                  className={
                    item.intentos >= MAX_INTENTOS
                      ? "font-semibold text-danger"
                      : item.estado === "error"
                        ? "text-warning"
                        : "text-text-muted"
                  }
                >
                  {item.estado}
                  {item.intentos > 0 ? ` · ${item.intentos} intentos` : ""}
                </span>
                <span className="num text-text-muted">
                  {new Date(item.creadoEn).toLocaleTimeString("es-AR")}
                </span>
                {item.ultimoError ? (
                  <span className="w-full text-xs text-danger">{item.ultimoError}</span>
                ) : null}
                <Boton tamano="chico" className="ml-auto" onClick={() => reintentar(item.id)}>
                  Reintentar
                </Boton>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function Dato({ titulo, valor, detalle }: { titulo: string; valor: string; detalle?: string }) {
  return (
    <div className="tarjeta p-4">
      <p className="text-xs uppercase tracking-wide text-text-muted">{titulo}</p>
      <p className="num font-semibold">{valor}</p>
      {detalle ? <p className="truncate font-mono text-xs text-text-muted">{detalle}</p> : null}
    </div>
  );
}

function Contador({ titulo, n }: { titulo: string; n?: number }) {
  return (
    <div className="tarjeta p-4 text-center">
      <p className="num text-2xl font-bold">{n ?? "—"}</p>
      <p className="text-xs text-text-muted">{titulo}</p>
    </div>
  );
}
