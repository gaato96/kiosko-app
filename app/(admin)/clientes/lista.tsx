"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { uuidv7 } from "uuidv7";
import { Check, MessageCircle, Search } from "lucide-react";
import { Boton } from "@/components/ui/boton";
import { Campo, Input, Select } from "@/components/ui/campo";
import { Hoja } from "@/components/ui/hoja";
import { normalizar } from "@/lib/db/schema";
import { formatearPesos, parsearPesos } from "@/lib/money";
import { ETIQUETAS_ESTADO, disponibleDe, estadoDeCuenta } from "@/lib/pos/clientes";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { enlaceWhatsApp, mensajeDeuda, type MovimientoResumen } from "@/lib/wa";
import type { Cliente, MedioPago } from "@/lib/tipos";
import { cn } from "@/lib/utils";

type Filtro = "todos" | "con-deuda" | "al-limite" | "dormidos";

export function ListaDeudores({
  clientes,
  nombreComercio,
}: {
  clientes: Cliente[];
  nombreComercio: string;
}) {
  const router = useRouter();
  const [consulta, setConsulta] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("con-deuda");
  const [cobrando, setCobrando] = useState<Cliente | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const visibles = useMemo(() => {
    const q = normalizar(consulta);
    const hace30 = Date.now() - 30 * 86400000;

    return clientes.filter((c) => {
      if (q && !normalizar(c.nombre).includes(q)) return false;
      if (filtro === "con-deuda") return c.saldo_centavos > 0;
      if (filtro === "al-limite") return estadoDeCuenta(c) === "al-limite" && c.saldo_centavos > 0;
      if (filtro === "dormidos")
        return c.saldo_centavos > 0 && new Date(c.actualizado_en).getTime() < hace30;
      return true;
    });
  }, [clientes, consulta, filtro]);

  async function recordar(cliente: Cliente) {
    // Se traen los últimos movimientos para armar el detalle del mensaje.
    const { data } = await supabaseBrowser()
      .from("cuenta_corriente_movimientos")
      .select("creado_en, tipo, monto_centavos")
      .eq("cliente_id", cliente.id)
      .order("creado_en", { ascending: false })
      .limit(6);

    const movimientos: MovimientoResumen[] = (data ?? [])
      .map((m) => ({
        fecha: m.creado_en,
        tipo: m.tipo as MovimientoResumen["tipo"],
        monto_centavos: m.monto_centavos,
      }))
      .reverse();

    const texto = mensajeDeuda({
      nombreCliente: cliente.nombre.split(" ")[0] ?? cliente.nombre,
      nombreComercio,
      saldoCentavos: cliente.saldo_centavos,
      movimientos,
    });

    if (!cliente.telefono) {
      await navigator.clipboard.writeText(texto);
      setAviso(`${cliente.nombre} no tiene teléfono cargado. El mensaje quedó copiado.`);
      return;
    }

    const url = enlaceWhatsApp(cliente.telefono, texto);
    if (url) window.open(url, "_blank", "noopener");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <Input
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            placeholder="Buscar cliente…"
            className="pl-10"
            aria-label="Buscar cliente"
          />
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto sin-scrollbar">
        {(
          [
            ["con-deuda", "Con deuda"],
            ["al-limite", "Al límite"],
            ["dormidos", "Sin movimiento hace 30 días"],
            ["todos", "Todos"],
          ] as const
        ).map(([valor, texto]) => (
          <button
            key={valor}
            onClick={() => setFiltro(valor)}
            className={cn(
              "min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium",
              filtro === valor ? "border-primary bg-primary text-primary-fg" : "border-border bg-surface",
            )}
          >
            {texto}
          </button>
        ))}
      </div>

      {aviso ? (
        <p className="tarjeta p-4 text-sm">{aviso}</p>
      ) : null}

      {visibles.length === 0 ? (
        <p className="rounded-[var(--radio)] border border-dashed border-border p-8 text-center text-text-muted">
          {filtro === "con-deuda" ? "Nadie debe nada. Bien ahí." : "No hay clientes que coincidan."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visibles.map((c) => {
            const estado = estadoDeCuenta(c);
            const etiqueta = ETIQUETAS_ESTADO[estado];

            return (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-3 tarjeta p-4"
              >
                <div className="min-w-40 flex-1">
                  <p className="font-medium">{c.nombre}</p>
                  <p className={cn("text-sm", etiqueta.clase)}>{etiqueta.texto}</p>
                </div>

                <dl className="flex gap-4 text-sm">
                  <div>
                    <dt className="text-xs text-text-muted">Debe</dt>
                    <dd className="num font-semibold">{formatearPesos(c.saldo_centavos)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted">Disponible</dt>
                    <dd className="num">{formatearPesos(disponibleDe(c))}</dd>
                  </div>
                </dl>

                <div className="flex gap-2">
                  <Boton tamano="chico" onClick={() => recordar(c)} disabled={c.saldo_centavos <= 0}>
                    <MessageCircle size={16} /> Recordar
                  </Boton>
                  <Boton
                    tamano="chico"
                    variante="primario"
                    onClick={() => setCobrando(c)}
                    disabled={c.saldo_centavos <= 0}
                  >
                    Cobrar
                  </Boton>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Hoja abierta={cobrando !== null} onCerrar={() => setCobrando(null)} titulo="Registrar pago">
        {cobrando ? (
          <FormularioCobro
            cliente={cobrando}
            onListo={(mensaje) => {
              setCobrando(null);
              setAviso(mensaje);
              router.refresh();
            }}
          />
        ) : null}
      </Hoja>
    </div>
  );
}

function FormularioCobro({
  cliente,
  onListo,
}: {
  cliente: Cliente;
  onListo: (mensaje: string) => void;
}) {
  const [monto, setMonto] = useState(String(Math.round(cliente.saldo_centavos / 100)));
  const [medio, setMedio] = useState<MedioPago>("EFECTIVO");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const centavos = parsearPesos(monto) ?? 0;
  const restante = cliente.saldo_centavos - centavos;

  async function confirmar() {
    setGuardando(true);
    setError(null);

    // Se busca la caja abierta para que un cobro en efectivo entre como INGRESO.
    // Sin ese paso el arqueo cierra mal, y es el error más común de los sistemas
    // que tienen fiados.
    const { data: caja } = await supabaseBrowser()
      .from("caja_sesiones")
      .select("id")
      .eq("estado", "ABIERTA")
      .limit(1)
      .maybeSingle();

    const { error } = await supabaseBrowser().rpc("registrar_cobro_cc", {
      payload: {
        id: uuidv7(),
        comercio_id: cliente.comercio_id,
        cliente_id: cliente.id,
        monto_centavos: centavos,
        medio,
        caja_sesion_id: caja?.id ?? null,
        usuario_id: null,
        creado_en: new Date().toISOString(),
      },
    });

    setGuardando(false);
    if (error) return setError(error.message);

    onListo(
      restante <= 0
        ? `${cliente.nombre} quedó al día.`
        : `Pago registrado. ${cliente.nombre} queda debiendo ${formatearPesos(restante)}.`,
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <p>
        {cliente.nombre} debe{" "}
        <span className="num font-semibold">{formatearPesos(cliente.saldo_centavos)}</span>
      </p>

      <Campo etiqueta="Monto">
        <Input inputMode="numeric" value={monto} onChange={(e) => setMonto(e.target.value)} autoFocus />
      </Campo>

      <div className="flex gap-2">
        <Boton
          ancho="completo"
          onClick={() => setMonto(String(Math.round(cliente.saldo_centavos / 100)))}
        >
          Paga todo
        </Boton>
        <Boton ancho="completo" onClick={() => setMonto("")}>
          Pago parcial
        </Boton>
      </div>

      <Campo etiqueta="Medio">
        <Select value={medio} onChange={(e) => setMedio(e.target.value as MedioPago)}>
          <option value="EFECTIVO">Efectivo</option>
          <option value="TRANSFERENCIA">Transferencia</option>
          <option value="DEBITO">Débito</option>
        </Select>
      </Campo>

      {medio === "EFECTIVO" ? (
        <p className="text-sm text-text-muted">
          Al ser efectivo entra como ingreso de caja, así el arqueo del turno sigue cerrando.
        </p>
      ) : null}

      {centavos > cliente.saldo_centavos ? (
        <p className="text-sm text-warning">
          Está pagando más de lo que debe. Le queda{" "}
          {formatearPesos(centavos - cliente.saldo_centavos)} a favor para la próxima compra.
        </p>
      ) : null}

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <Boton
        variante="primario"
        tamano="grande"
        ancho="completo"
        disabled={centavos <= 0 || guardando}
        onClick={confirmar}
      >
        <Check size={20} /> Confirmar
      </Boton>
    </div>
  );
}
