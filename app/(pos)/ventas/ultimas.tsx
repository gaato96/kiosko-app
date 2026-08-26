"use client";

/**
 * Las ventas del día, con la anulación.
 *
 * Regla de oro #8: las ventas NO se editan y NO se borran. Se anulan, con
 * motivo obligatorio y autorización del dueño, y el servidor revierte el stock
 * y la cuenta corriente dejando una fila en `auditoria`.
 *
 * Solo se anulan ventas del día en curso: una venta de la semana pasada ya
 * entró en un arqueo cerrado.
 */

import { useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, CloudOff, Receipt } from "lucide-react";
import { AutorizacionDueno } from "@/components/pos/autorizacion-dueno";
import { Boton } from "@/components/ui/boton";
import { Campo, Input } from "@/components/ui/campo";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { Hoja } from "@/components/ui/hoja";
import { db } from "@/lib/db/schema";
import { formatearPesos } from "@/lib/money";
import { anularVenta } from "@/lib/pos/venta";
import { usarSesion } from "@/lib/store/sesion";
import { fechaLocal, horaCorta } from "@/lib/utils";
import type { Venta } from "@/lib/tipos";

export function UltimasVentas() {
  const sesion = usarSesion();
  const [anulando, setAnulando] = useState<Venta | null>(null);
  const [motivo, setMotivo] = useState("");
  const [pidiendoPin, setPidiendoPin] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const hoy = fechaLocal();

  const ventas = useLiveQuery(
    async () => {
      const todas = await db().ventas.orderBy("creado_en").reverse().limit(80).toArray();
      return todas.filter((v) => fechaLocal(new Date(v.creado_en)) === hoy);
    },
    [hoy],
    [],
  );

  const total = ventas
    .filter((v) => v.estado === "COMPLETADA")
    .reduce((a, v) => a + v.total_centavos, 0);

  const esDueno = sesion.operador?.rol === "dueno" || sesion.rolCuenta === "dueno";

  async function confirmarAnulacion(autorizacionId: string | null, autorizadoPor: string, offline: boolean) {
    if (!anulando) return;

    await anularVenta({
      ventaId: anulando.id,
      motivo: motivo.trim(),
      usuarioId: sesion.operador?.id ?? sesion.usuarioId,
      autorizacionId,
      autorizadoPor,
      autorizadaOffline: offline,
    });

    setAnulando(null);
    setPidiendoPin(false);
    setMotivo("");
    setAviso(
      offline
        ? "Venta anulada. Se autorizó sin conexión, así que queda marcada para que la revise el dueño."
        : "Venta anulada. El stock y la cuenta corriente vuelven solos.",
    );
  }

  return (
    <main className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
      <header className="flex items-center gap-3">
        <Link
          href="/pos"
          className="flex h-12 w-12 items-center justify-center rounded-full hover:bg-surface-alt"
        >
          <ArrowLeft size={22} />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Ventas de hoy</h1>
          <p className="num text-sm text-text-muted">
            {ventas.length} {ventas.length === 1 ? "ticket" : "tickets"} · {formatearPesos(total)}
          </p>
        </div>
      </header>

      {aviso ? (
        <p className="tarjeta p-4 text-sm">{aviso}</p>
      ) : null}

      {ventas.length === 0 ? (
        <EstadoVacio
          icono={Receipt}
          titulo="Todavía no se cobró nada hoy"
          detalle="Las ventas del turno aparecen acá apenas cobrás la primera."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {ventas.map((v) => (
            <li
              key={v.id}
              className="flex flex-wrap items-center gap-3 tarjeta p-4"
            >
              <span className="min-w-24 flex-1">
                <span className="num block font-medium">
                  {v.numero ? `#${v.numero}` : "Sin número todavía"}
                </span>
                <span className="num block text-sm text-text-muted">{horaCorta(v.creado_en)}</span>
              </span>

              {v.pendiente ? (
                <span
                  className="flex items-center gap-1 text-xs text-warning"
                  title="Todavía no llegó al servidor"
                >
                  <CloudOff size={14} /> sin sincronizar
                </span>
              ) : null}

              <span
                className={`num text-lg font-semibold ${v.estado === "ANULADA" ? "text-text-muted line-through" : ""}`}
              >
                {formatearPesos(v.total_centavos)}
              </span>

              {v.estado === "ANULADA" ? (
                <span className="text-sm text-danger">Anulada</span>
              ) : (
                <Boton
                  tamano="chico"
                  variante="fantasma"
                  onClick={() => {
                    setAnulando(v);
                    setMotivo("");
                  }}
                >
                  Anular
                </Boton>
              )}
            </li>
          ))}
        </ul>
      )}

      <Hoja
        abierta={anulando !== null}
        onCerrar={() => {
          setAnulando(null);
          setPidiendoPin(false);
        }}
        titulo="Anular la venta"
      >
        {anulando && !pidiendoPin ? (
          <div className="flex flex-col gap-4 p-4">
            <p>
              Vas a anular{" "}
              <span className="num font-semibold">{formatearPesos(anulando.total_centavos)}</span>. La
              venta no se borra: queda registrada como anulada y vuelven el stock y el fiado.
            </p>

            <Campo etiqueta="¿Por qué se anula?" ayuda="Es obligatorio y queda en la auditoría.">
              <Input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Se equivocó de producto"
                autoFocus
              />
            </Campo>

            <Boton
              variante="peligro"
              tamano="grande"
              ancho="completo"
              disabled={motivo.trim().length < 3}
              onClick={() => {
                // El dueño anula directo; el empleado necesita autorización.
                if (esDueno) {
                  void confirmarAnulacion(null, sesion.usuarioId ?? "", false);
                } else {
                  setPidiendoPin(true);
                }
              }}
            >
              {esDueno ? "Anular" : "Anular (pide PIN del dueño)"}
            </Boton>
          </div>
        ) : null}

        {anulando && pidiendoPin ? (
          <AutorizacionDueno
            accion="anular_venta"
            descripcion={`Anular la venta ${anulando.numero ? `#${anulando.numero}` : ""} por ${formatearPesos(anulando.total_centavos)}.`}
            detalle={{ venta_id: anulando.id, total_centavos: anulando.total_centavos, motivo }}
            onCancelar={() => setPidiendoPin(false)}
            onAutorizado={(a) =>
              void confirmarAnulacion(a.autorizacionId, a.autorizadoPor, a.offline)
            }
          />
        ) : null}
      </Hoja>
    </main>
  );
}
