"use client";

/**
 * Pantalla de caja del mostrador: apertura, movimientos manuales y cierre.
 *
 * Lo que NO está acá: el efectivo esperado y la diferencia. Eso lo ve el dueño
 * en el admin, porque el servidor solo se lo devuelve a él.
 */

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, Wallet } from "lucide-react";
import Link from "next/link";
import { ArqueoCiego } from "@/components/pos/arqueo";
import { AperturaCaja } from "@/components/pos/apertura-caja";
import { Numpad } from "@/components/pos/numpad";
import { Boton } from "@/components/ui/boton";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { Hoja } from "@/components/ui/hoja";
import { Select } from "@/components/ui/campo";
import { db } from "@/lib/db/schema";
import { formatearPesos } from "@/lib/money";
import {
  MOTIVOS_EGRESO,
  MOTIVOS_INGRESO,
  abrirCaja,
  cajaAbierta,
  cerrarCaja,
  registrarMovimientoCaja,
} from "@/lib/pos/caja";
import { usarSesion } from "@/lib/store/sesion";
import type { CajaSesion, TipoCajaMov } from "@/lib/tipos";
import { horaCorta } from "@/lib/utils";

export function PantallaCaja() {
  const sesion = usarSesion();
  const [caja, setCaja] = useState<CajaSesion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [movimientoAbierto, setMovimientoAbierto] = useState<TipoCajaMov | null>(null);
  const [arqueoAbierto, setArqueoAbierto] = useState(false);

  useEffect(() => {
    void cajaAbierta(sesion.dispositivoId).then((c) => {
      setCaja(c ?? null);
      usarSesion.getState().definirCaja(c?.id ?? null);
    });
  }, [sesion.dispositivoId]);

  const movimientos = useLiveQuery(
    async () =>
      caja ? db().caja_movimientos.where("caja_sesion_id").equals(caja.id).reverse().toArray() : [],
    [caja?.id],
    [],
  );

  const ventasDelTurno = useLiveQuery(
    async () => {
      if (!caja) return { cantidad: 0, total: 0 };
      const v = await db().ventas.where("caja_sesion_id").equals(caja.id).toArray();
      const vivas = v.filter((x) => x.estado === "COMPLETADA");
      return { cantidad: vivas.length, total: vivas.reduce((a, x) => a + x.total_centavos, 0) };
    },
    [caja?.id],
    { cantidad: 0, total: 0 },
  );

  if (!sesion.comercioId) return null;

  if (!caja) {
    return (
      <main className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-md tarjeta">
          <AperturaCaja
            cargando={cargando}
            onAbrir={async (fondo) => {
              setCargando(true);
              const nueva = await abrirCaja({
                comercioId: sesion.comercioId!,
                dispositivoId: sesion.dispositivoId,
                usuarioId: sesion.operador?.id ?? sesion.usuarioId,
                fondoInicialCentavos: fondo,
              });
              setCaja(nueva);
              usarSesion.getState().definirCaja(nueva.id);
              setCargando(false);
            }}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
      <header className="flex items-center gap-3">
        <Link href="/pos" className="flex h-12 w-12 items-center justify-center rounded-full hover:bg-surface-alt">
          <ArrowLeft size={22} />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Caja abierta</h1>
          <p className="text-sm text-text-muted">
            Desde las {horaCorta(caja.abierta_en)} · fondo{" "}
            <span className="num">{formatearPesos(caja.fondo_inicial_centavos)}</span>
          </p>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3">
        <Tarjeta titulo="Ventas del turno" valor={String(ventasDelTurno.cantidad)} />
        <Tarjeta titulo="Facturado" valor={formatearPesos(ventasDelTurno.total)} />
      </section>

      <div className="grid grid-cols-2 gap-3">
        <Boton tamano="grande" onClick={() => setMovimientoAbierto("INGRESO")}>
          <ArrowDownLeft size={20} /> Ingreso
        </Boton>
        <Boton tamano="grande" onClick={() => setMovimientoAbierto("EGRESO")}>
          <ArrowUpRight size={20} /> Egreso
        </Boton>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Movimientos del turno</h2>
        {movimientos.length === 0 ? (
          <EstadoVacio
            icono={Wallet}
            titulo="Todavía no hubo movimientos"
            detalle="Los pagos a proveedor, los retiros y los aportes de efectivo van acá. Si no se registran, el arqueo no cierra."
          />
        ) : (
          <ul className="divide-y divide-border tarjeta">
            {movimientos.map((m) => (
              <li key={m.id} className="flex items-center gap-3 p-3">
                <span
                  className={
                    m.tipo === "INGRESO" ? "text-success" : "text-danger"
                  }
                  aria-hidden
                >
                  {m.tipo === "INGRESO" ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-medium">{m.motivo}</span>
                  <span className="num block text-xs text-text-muted">{horaCorta(m.creado_en)}</span>
                </span>
                <span
                  className={`num font-semibold ${m.tipo === "INGRESO" ? "text-success" : "text-danger"}`}
                >
                  {m.tipo === "INGRESO" ? "+" : "−"}
                  {formatearPesos(m.monto_centavos)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Boton variante="peligro" tamano="grande" ancho="completo" onClick={() => setArqueoAbierto(true)}>
        Cerrar caja
      </Boton>

      <Hoja
        abierta={movimientoAbierto !== null}
        onCerrar={() => setMovimientoAbierto(null)}
        titulo={movimientoAbierto === "INGRESO" ? "Registrar ingreso" : "Registrar egreso"}
      >
        {movimientoAbierto ? (
          <FormularioMovimiento
            tipo={movimientoAbierto}
            onGuardar={async (motivo, monto) => {
              await registrarMovimientoCaja({
                comercioId: sesion.comercioId!,
                cajaSesionId: caja.id,
                tipo: movimientoAbierto,
                motivo,
                montoCentavos: monto,
                usuarioId: sesion.operador?.id ?? sesion.usuarioId,
              });
              setMovimientoAbierto(null);
            }}
          />
        ) : null}
      </Hoja>

      <Hoja abierta={arqueoAbierto} onCerrar={() => setArqueoAbierto(false)} tamano="completa">
        <ArqueoCiego
          nombreOperador={sesion.operador?.nombre ?? "el turno"}
          abiertaEn={caja.abierta_en}
          cargando={cargando}
          onCancelar={() => {
            setArqueoAbierto(false);
            void cajaAbierta(sesion.dispositivoId).then((c) => setCaja(c ?? null));
          }}
          onCerrar={async (declarado, desglose) => {
            await cerrarCaja({
              comercioId: sesion.comercioId!,
              cajaSesionId: caja.id,
              declaradoCentavos: declarado,
              desglose,
              declaradoPor: sesion.operador?.id ?? sesion.usuarioId,
            });
            usarSesion.getState().definirCaja(null);
          }}
        />
      </Hoja>
    </main>
  );
}

function Tarjeta({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="tarjeta p-4">
      <p className="text-xs uppercase tracking-wide text-text-muted">{titulo}</p>
      <p className="num text-2xl font-bold">{valor}</p>
    </div>
  );
}

function FormularioMovimiento({
  tipo,
  onGuardar,
}: {
  tipo: TipoCajaMov;
  onGuardar: (motivo: string, montoCentavos: number) => void;
}) {
  const motivos = tipo === "INGRESO" ? MOTIVOS_INGRESO : MOTIVOS_EGRESO;
  const [motivo, setMotivo] = useState<string>(motivos[0]);
  const [tipeado, setTipeado] = useState("");

  const monto = tipeado === "" ? 0 : Number(tipeado) * 100;

  return (
    <div className="flex flex-col gap-4 p-4">
      <Select value={motivo} onChange={(e) => setMotivo(e.target.value)} aria-label="Motivo">
        {motivos.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </Select>

      <p className="num text-center text-4xl font-bold">{formatearPesos(monto)}</p>

      <Numpad valor={tipeado} onCambio={setTipeado} maxDigitos={8} />

      <Boton
        variante="primario"
        tamano="grande"
        ancho="completo"
        disabled={monto <= 0}
        onClick={() => onGuardar(motivo, monto)}
      >
        Registrar
      </Boton>
    </div>
  );
}
