"use client";

/**
 * <SelectorCliente> — a quién se le fía.
 *
 * La tarjeta muestra SIEMPRE los tres números: debe, límite y disponible.
 * Si la venta no entra, el sistema bloquea y ofrece las tres salidas reales:
 * cobrar de otra forma, registrar un pago primero, o el override del dueño.
 */

import { useEffect, useState } from "react";
import { Loader2, Search, ShieldAlert, TriangleAlert, UserPlus, WifiOff } from "lucide-react";
import { Boton } from "@/components/ui/boton";
import { Campo, Input } from "@/components/ui/campo";
import { formatearPesos, parsearPesos } from "@/lib/money";
import {
  ETIQUETAS_ESTADO,
  antiguedadTexto,
  buscarClientes,
  crearClienteExpress,
  disponibleDe,
  estadoDeCuenta,
  evaluarFiado,
  refrescarClientes,
  type Veredicto,
} from "@/lib/pos/clientes";
import type { Cliente } from "@/lib/tipos";
import { cn } from "@/lib/utils";

export function SelectorCliente({
  comercioId,
  montoCentavos,
  onElegir,
  onCobrarDeOtraForma,
  onRegistrarPago,
  onPedirAutorizacion,
}: {
  comercioId: string;
  /** Lo que se quiere fiar ahora. 0 si solo se está eligiendo un cliente. */
  montoCentavos: number;
  onElegir: (c: Cliente) => void;
  onCobrarDeOtraForma: () => void;
  onRegistrarPago: (c: Cliente) => void;
  onPedirAutorizacion: (c: Cliente) => void;
}) {
  const [consulta, setConsulta] = useState("");
  const [lista, setLista] = useState<Cliente[]>([]);
  const [bloqueado, setBloqueado] = useState<{ cliente: Cliente; veredicto: Veredicto } | null>(null);
  const [altaAbierta, setAltaAbierta] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [sinRed, setSinRed] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    void buscarClientes(consulta)
      .then((r) => {
        if (vigente) setLista(r);
      })
      .catch(() => {
        if (vigente) setLista([]);
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [consulta, version]);

  /**
   * Si en la base local no hay NINGÚN cliente, se pregunta una vez al servidor.
   *
   * Antes, un dispositivo que todavía no había sincronizado abría "Fiar a" con
   * una lista vacía y sin una sola palabra: el que estaba cobrando veía la
   * pantalla en blanco y no tenía forma de saber si el kiosco no tenía
   * clientes cargados o si el sistema estaba roto.
   */
  useEffect(() => {
    if (cargando || lista.length > 0 || consulta !== "") return;
    let vigente = true;
    void refrescarClientes(comercioId)
      .then((cuantos) => {
        if (!vigente) return;
        if (cuantos === null) setSinRed(true);
        else if (cuantos > 0) setVersion((v) => v + 1);
      })
      .catch(() => {
        if (vigente) setSinRed(true);
      });
    return () => {
      vigente = false;
    };
    // Corre una sola vez por apertura: si el kiosco no tiene clientes, no tiene
    // sentido volver a preguntar en cada tecla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comercioId]);

  if (altaAbierta) {
    return (
      <AltaClienteExpress
        comercioId={comercioId}
        nombreInicial={consulta}
        onCancelar={() => setAltaAbierta(false)}
        onCreado={onElegir}
      />
    );
  }

  if (bloqueado) {
    const { cliente, veredicto } = bloqueado;
    const esAdvertencia = veredicto.resultado === "advierte";

    return (
      <div className="flex flex-col gap-4 p-4">
        <header className="flex items-start gap-3">
          {esAdvertencia ? (
            <TriangleAlert size={24} className="mt-0.5 shrink-0 text-warning" />
          ) : (
            <ShieldAlert size={24} className="mt-0.5 shrink-0 text-danger" />
          )}
          <div>
            <h2 className="text-lg font-semibold">
              {esAdvertencia ? "Ojo con el saldo" : `${cliente.nombre} llegó al límite`}
            </h2>
            <p className="text-text-muted">{veredicto.mensaje}</p>
          </div>
        </header>

        <TarjetaCliente cliente={cliente} antiguedadMs={veredicto.antiguedadMs} />

        <p className="num text-sm text-text-muted">
          Esta compra es de {formatearPesos(montoCentavos)}.
        </p>

        <div className="flex flex-col gap-2">
          <Boton tamano="grande" ancho="completo" onClick={onCobrarDeOtraForma}>
            Cobrar de otra forma
          </Boton>
          <Boton tamano="grande" ancho="completo" onClick={() => onRegistrarPago(cliente)}>
            Registrar un pago primero
          </Boton>
          {esAdvertencia ? (
            <Boton variante="contorno" tamano="grande" ancho="completo" onClick={() => onElegir(cliente)}>
              Fiar igual
            </Boton>
          ) : (
            <Boton
              variante="contorno"
              tamano="grande"
              ancho="completo"
              onClick={() => onPedirAutorizacion(cliente)}
            >
              Autorizar igual (PIN del dueño)
            </Boton>
          )}
          <Boton variante="fantasma" ancho="completo" onClick={() => setBloqueado(null)}>
            Elegir otro cliente
          </Boton>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="relative">
        <Search
          size={18}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
        />
        {/* Sin `autoFocus`: en celular abría el teclado antes de que se
            pintara la lista, tapaba las tarjetas y dejaba la hoja a medio
            dibujar. Con el dedo ya se toca el campo cuando hace falta. */}
        <Input
          type="search"
          enterKeyHint="search"
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          placeholder="Buscar cliente…"
          className="pl-10"
          aria-label="Buscar cliente"
        />
      </div>

      {cargando && lista.length === 0 ? (
        <p className="flex items-center justify-center gap-2 py-8 text-text-muted">
          <Loader2 size={18} className="animate-spin" aria-hidden /> Buscando…
        </p>
      ) : lista.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          {sinRed ? (
            <WifiOff size={26} className="text-text-sutil" aria-hidden />
          ) : null}
          <p className="font-semibold">
            {consulta.trim() !== ""
              ? `No hay ningún cliente que se llame “${consulta.trim()}”`
              : "Todavía no tenés clientes con cuenta"}
          </p>
          <p className="max-w-xs text-sm text-text-muted">
            {consulta.trim() !== ""
              ? "Crealo ahora con el nombre y el límite, y seguí cobrando."
              : sinRed
                ? "Este dispositivo todavía no bajó la lista y no hay internet. Podés crear el cliente igual: se sincroniza solo cuando vuelva."
                : "El fiado arranca cuando cargás al primero. Nombre y límite, nada más."}
          </p>
        </div>
      ) : (
        <ul className="flex max-h-96 flex-col gap-2 overflow-y-auto">
          {lista.map((c) => (
            <li key={c.id}>
              <button
                className="w-full text-left"
                onClick={() => {
                  if (montoCentavos <= 0) return onElegir(c);
                  const veredicto = evaluarFiado(c, montoCentavos);
                  if (veredicto.resultado === "permite") return onElegir(c);
                  setBloqueado({ cliente: c, veredicto });
                }}
              >
                <TarjetaCliente cliente={c} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Boton variante="secundario" tamano="grande" ancho="completo" onClick={() => setAltaAbierta(true)}>
        <UserPlus size={20} /> Cliente nuevo
      </Boton>
    </div>
  );
}

function TarjetaCliente({ cliente, antiguedadMs }: { cliente: Cliente; antiguedadMs?: number }) {
  const estado = estadoDeCuenta(cliente);
  const etiqueta = ETIQUETAS_ESTADO[estado];
  const disponible = disponibleDe(cliente);
  const proporcion =
    cliente.limite_credito_centavos > 0
      ? Math.min(100, (cliente.saldo_centavos / cliente.limite_credito_centavos) * 100)
      : 100;

  return (
    <div className="tarjeta p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold">{cliente.nombre}</span>
        {/* Nunca el color solo: siempre acompañado de texto. */}
        <span className={cn("text-sm font-medium", etiqueta.clase)}>{etiqueta.texto}</span>
      </div>

      <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
        <div>
          <dt className="text-xs text-text-muted">Debe</dt>
          <dd className="num font-semibold">{formatearPesos(cliente.saldo_centavos)}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">Límite</dt>
          <dd className="num">{formatearPesos(cliente.limite_credito_centavos)}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">Disponible</dt>
          <dd className="num font-semibold text-success">{formatearPesos(disponible)}</dd>
        </div>
      </dl>

      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-surface-alt"
        role="img"
        aria-label={`Usó el ${Math.round(proporcion)} por ciento de su crédito`}
      >
        <div
          className={cn(
            "h-full",
            proporcion >= 100 ? "bg-danger" : proporcion >= 80 ? "bg-warning" : "bg-success",
          )}
          style={{ width: `${proporcion}%` }}
        />
      </div>

      {antiguedadMs !== undefined && antiguedadMs > 60_000 ? (
        <p className="mt-2 flex items-center gap-1 text-xs text-warning">
          <TriangleAlert size={12} /> Saldo de {antiguedadTexto(antiguedadMs)}
        </p>
      ) : null}
    </div>
  );
}

function AltaClienteExpress({
  comercioId,
  nombreInicial,
  onCreado,
  onCancelar,
}: {
  comercioId: string;
  nombreInicial: string;
  onCreado: (c: Cliente) => void;
  onCancelar: () => void;
}) {
  const [nombre, setNombre] = useState(nombreInicial);
  const [telefono, setTelefono] = useState("");
  const [limite, setLimite] = useState("");

  return (
    <form
      className="flex flex-col gap-4 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const cliente = await crearClienteExpress({
          comercioId,
          nombre,
          telefono: telefono.trim() || null,
          limiteCreditoCentavos: parsearPesos(limite) ?? 0,
        });
        onCreado(cliente);
      }}
    >
      <Campo etiqueta="Nombre">
        <Input value={nombre} onChange={(e) => setNombre(e.target.value)} required autoFocus />
      </Campo>

      <Campo etiqueta="Teléfono" ayuda="Hace falta para mandarle el recordatorio por WhatsApp.">
        <Input
          inputMode="tel"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          placeholder="11 2233 4455"
        />
      </Campo>

      <Campo etiqueta="Límite de crédito" ayuda="En $0 el cliente existe pero no se le fía.">
        <Input
          inputMode="numeric"
          value={limite}
          onChange={(e) => setLimite(e.target.value)}
          placeholder="50000"
        />
      </Campo>

      <div className="flex gap-2">
        <Boton variante="fantasma" ancho="completo" type="button" onClick={onCancelar}>
          Cancelar
        </Boton>
        <Boton variante="primario" tamano="grande" ancho="completo" type="submit">
          Crear y fiar
        </Boton>
      </div>
    </form>
  );
}
