"use client";

/**
 * La pantalla del mostrador.
 *
 * Meta medible del módulo: 3 productos + efectivo en 8 toques y menos de 15
 * segundos, sin internet. Todo lo que está acá se juzga contra eso.
 *
 * Toques de una venta típica:
 *   1-3  tres teclas rápidas
 *   4    COBRAR
 *   5    EFECTIVO
 *   6    billete rápido ($10.000)
 *   7    Confirmar
 *   8    Listo
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import {
  BadgePercent,
  Check,
  LayoutGrid,
  Receipt,
  Search,
  ShoppingBasket,
  Store,
  TrendingUp,
  UserRound,
  Wallet,
  Zap,
} from "lucide-react";
import { EstadoSync } from "@/components/estado-sync";
import { AltaExpress } from "@/components/pos/alta-express";
import { AperturaCaja } from "@/components/pos/apertura-caja";
import { ModoBalanza } from "@/components/pos/balanza";
import { AutorizacionDueno } from "@/components/pos/autorizacion-dueno";
import { PantallaCobro } from "@/components/pos/cobro";
import { SelectorCliente } from "@/components/pos/selector-cliente";
import { ProductoCard } from "@/components/pos/producto-card";
import { SelectorOperador } from "@/components/pos/selector-operador";
import { PanelTicket } from "@/components/pos/ticket";
import { Boton } from "@/components/ui/boton";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { Hoja } from "@/components/ui/hoja";
import { Input } from "@/components/ui/campo";
import { Ilustracion } from "@/components/ui/ilustracion";
import { db } from "@/lib/db/schema";
import { formatearPesos } from "@/lib/money";
import { buscarProductos, productosDeTeclasRapidas, type ResultadoBusqueda } from "@/lib/pos/buscar";
import { masVendidos, ofertasVigentes, refrescarRankingVendidos } from "@/lib/pos/destacados";
import { precioVigente } from "@/lib/producto";
import { abrirCaja, cajaAbierta } from "@/lib/pos/caja";
import { registrarCobro } from "@/lib/pos/clientes";
import { cerrarVenta } from "@/lib/pos/venta";
import { rolEnMostrador, usarSesion } from "@/lib/store/sesion";
import { totalDe, usarTicket, type PagoTicket } from "@/lib/store/ticket";
import type { Cliente, Producto } from "@/lib/tipos";
import { cn, haptico } from "@/lib/utils";

type Vista = "grilla" | "cobro" | "balanza";

export function PantallaPos() {
  const sesion = usarSesion();
  const ticket = usarTicket();

  const [vista, setVista] = useState<Vista>("grilla");
  const [consulta, setConsulta] = useState("");
  const [resultados, setResultados] = useState<ResultadoBusqueda[]>([]);
  const [categoriaId, setCategoriaId] = useState<string | null>(null);
  const [productoPeso, setProductoPeso] = useState<Producto | null>(null);
  const [altaAbierta, setAltaAbierta] = useState(false);
  const [operadorAbierto, setOperadorAbierto] = useState(false);
  const [exito, setExito] = useState<{ total: number; vuelto: number } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  // Sin caja abierta el POS no cobra. No es un capricho: si las ventas no
  // cuelgan de una sesión de caja, el arqueo del turno no cierra nunca.
  const [cajaId, setCajaId] = useState<string | null | undefined>(undefined);
  const [clienteAbierto, setClienteAbierto] = useState(false);
  // En celular el ticket no puede vivir siempre en pantalla: se comía el 43%
  // del alto y dejaba dos productos por fila. Vive plegado en una barra y se
  // abre a pantalla completa cuando hace falta.
  const [ticketAbierto, setTicketAbierto] = useState(false);
  const [excesoCredito, setExcesoCredito] = useState<Cliente | null>(null);

  const buscadorRef = useRef<HTMLInputElement>(null);

  // Solo las vivas: la sincronización trae la categoría archivada con
  // `activo: false` en vez de borrar la fila, así que hay que filtrarla acá o
  // el rail sigue mostrando un rubro que ya no existe.
  const categorias = useLiveQuery(
    () => db().categorias.orderBy("orden").filter((c) => c.activo).toArray(),
    [],
    [],
  );
  const config = useLiveQuery(() => db().config.toArray(), [], []);
  const redondeo = config?.[0]?.redondeo_centavos ?? 1;

  useEffect(() => {
    void cajaAbierta(sesion.dispositivoId).then((c) => {
      setCajaId(c?.id ?? null);
      usarSesion.getState().definirCaja(c?.id ?? null);
    });
  }, [sesion.dispositivoId]);

  // Cuenta viva del catálogo local. Es la señal de que terminó el primer pull:
  // sin esto, en un dispositivo recién vinculado la grilla queda mostrando
  // "todavía no cargaste productos" con el catálogo ya bajado.
  const catalogoLocal = useLiveQuery(() => db().productos.count(), [], 0);

  const [teclas, setTeclas] = useState<Producto[]>([]);
  const [vendidos, setVendidos] = useState<Producto[]>([]);
  const [ofertas, setOfertas] = useState<Producto[]>([]);
  const [solapa, setSolapa] = useState<"teclas" | "vendidos" | "ofertas">("teclas");
  useEffect(() => {
    void productosDeTeclasRapidas().then(setTeclas);
    // Salen de Dexie, no de la red: la pantalla de cobro no espera a nadie.
    void masVendidos().then(setVendidos);
    void ofertasVigentes().then(setOfertas);
  }, [catalogoLocal]);

  // El ranking del servidor —el único que ve las ventas de los otros
  // mostradores— se baja SIN esperarlo y queda cacheado para la próxima vez.
  useEffect(() => {
    if (!sesion.comercioId) return;
    void refrescarRankingVendidos(sesion.comercioId).then(() =>
      masVendidos().then(setVendidos),
    );
  }, [sesion.comercioId]);

  /**
   * Las solapas de la tira de arriba, sin las vacías. Mostrar "Ofertas" en un
   * kiosco que no tiene ninguna es un botón que no hace nada.
   */
  const destacados = useMemo(
    () =>
      [
        { clave: "teclas" as const, texto: "Teclas rápidas", icono: Zap, tinte: "text-warning", items: teclas },
        { clave: "vendidos" as const, texto: "Los que más vendés", icono: TrendingUp, tinte: "text-plata", items: vendidos },
        { clave: "ofertas" as const, texto: "En oferta", icono: BadgePercent, tinte: "text-plata", items: ofertas },
      ].filter((d) => d.items.length > 0),
    [teclas, vendidos, ofertas],
  );

  // Si la solapa elegida se quedó sin nada, se cae a la primera que tenga algo.
  const solapaViva = destacados.some((d) => d.clave === solapa)
    ? solapa
    : (destacados[0]?.clave ?? "teclas");

  // Búsqueda local. Sin debounce a propósito: corre sobre un índice en memoria
  // y tiene que sentirse instantánea mientras se escribe.
  useEffect(() => {
    let vigente = true;
    void buscarProductos(consulta, { categoriaId }).then((r) => {
      if (vigente) setResultados(r);
    });
    return () => {
      vigente = false;
    };
  }, [consulta, categoriaId, catalogoLocal]);

  const total = totalDe(ticket.lineas, ticket.descuentoCentavos);

  const agregarProducto = useCallback(
    (p: Producto) => {
      if (p.tipo_venta === "PESO") {
        setProductoPeso(p);
        setVista("balanza");
        return;
      }

      if (p.tipo_producto === "SERVICIO") {
        // Los servicios piden el monto: una recarga de $5.000 y una de $2.000
        // son el mismo producto.
        const texto = prompt(`¿De cuánto es ${p.nombre}?`);
        const monto = texto ? Number(texto.replace(/\D/g, "")) * 100 : 0;
        if (monto <= 0) return;
        ticket.agregar({
          productoId: p.id,
          descripcion: p.nombre,
          tipoVenta: "UNIDAD",
          cantidad: 1,
          precioUnitarioCentavos: monto,
          totalCentavos: monto,
          esServicio: true,
        });
        setConsulta("");
        buscadorRef.current?.focus();
        return;
      }

      // El precio VIGENTE: si el producto está en oferta se cobra la oferta.
      // Un precio promocionado que solo vale en la Vidriera es una discusión
      // con el cliente parado en el mostrador.
      const precio = precioVigente(p);
      ticket.agregar({
        productoId: p.id,
        descripcion: p.nombre,
        tipoVenta: "UNIDAD",
        cantidad: 1,
        precioUnitarioCentavos: precio,
        totalCentavos: precio,
        // Se marca, no se bloquea: un stock negativo es información real.
        sinStock: p.controla_stock && p.stock_actual <= 0,
      });
      setConsulta("");
      buscadorRef.current?.focus();
    },
    [ticket],
  );

  // Atajos de teclado: también son el punto de entrada del lector de barras,
  // que se comporta como un teclado que termina en Enter.
  useEffect(() => {
    const alTeclado = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== buscadorRef.current) {
        e.preventDefault();
        buscadorRef.current?.focus();
        return;
      }
      if (e.key === "F9" && ticket.lineas.length > 0) {
        e.preventDefault();
        setVista("cobro");
        return;
      }
      if (e.key === "Escape") setVista("grilla");
      if (/^F([1-9]|1[0-2])$/.test(e.key)) {
        const i = Number(e.key.slice(1)) - 1;
        const p = teclas[i];
        if (p) {
          e.preventDefault();
          agregarProducto(p);
        }
      }
    };
    window.addEventListener("keydown", alTeclado);
    return () => window.removeEventListener("keydown", alTeclado);
  }, [teclas, ticket.lineas.length, agregarProducto]);

  async function confirmarCobro(pagos: PagoTicket[]) {
    if (!sesion.comercioId) return;
    setGuardando(true);
    try {
      const r = await cerrarVenta({
        comercioId: sesion.comercioId,
        usuarioId: sesion.operador?.id ?? sesion.usuarioId,
        dispositivoId: sesion.dispositivoId,
        cajaSesionId: sesion.cajaSesionId,
        clienteId: ticket.clienteId,
        lineas: ticket.lineas,
        pagos,
        descuentoCentavos: ticket.descuentoCentavos,
      });

      haptico([15, 40, 15]);
      ticket.vaciar();
      setVista("grilla");
      setExito({ total: r.totalCentavos, vuelto: r.vueltoCentavos });
      setTimeout(() => setExito(null), 2500);
      buscadorRef.current?.focus();
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "No se pudo guardar la venta");
    } finally {
      setGuardando(false);
    }
  }

  const sinResultados = consulta.trim() !== "" && resultados.length === 0;

  const abrirBalanza = useCallback(() => {
    const peso = resultados.find((p) => p.tipo_venta === "PESO");
    if (peso) {
      setProductoPeso(peso);
      setVista("balanza");
      return;
    }
    setConsulta("");
    setAviso("Buscá el producto de fiambrería y tocalo: abre la balanza directo.");
  }, [resultados]);

  const porCategoria = useMemo(() => {
    const mapa = new Map<string, { color: string; nombre: string }>();
    for (const c of categorias ?? []) mapa.set(c.id, { color: c.color, nombre: c.nombre });
    return mapa;
  }, [categorias]);

  // Modal bloqueante: no se descarta y no deja pasar al cobro.
  if (cajaId === null && sesion.comercioId) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="tarjeta w-full max-w-md shadow-[var(--sombra-3)]">
          <AperturaCaja
            cargando={guardando}
            onAbrir={async (fondo) => {
              setGuardando(true);
              const nueva = await abrirCaja({
                comercioId: sesion.comercioId!,
                dispositivoId: sesion.dispositivoId,
                usuarioId: sesion.operador?.id ?? sesion.usuarioId,
                fondoInicialCentavos: fondo,
              });
              setCajaId(nueva.id);
              usarSesion.getState().definirCaja(nueva.id);
              setGuardando(false);
            }}
          />
        </div>
      </div>
    );
  }

  if (vista === "balanza" && productoPeso) {
    return (
      <ModoBalanza
        producto={productoPeso}
        redondeoCentavos={redondeo}
        onVolver={() => {
          setProductoPeso(null);
          setVista("grilla");
        }}
        onAgregar={(gramos, totalCentavos) => {
          ticket.agregar({
            productoId: productoPeso.id,
            descripcion: productoPeso.nombre,
            tipoVenta: "PESO",
            cantidad: gramos,
            precioUnitarioCentavos: productoPeso.precio_por_kg_centavos ?? 0,
            totalCentavos,
          });
          setProductoPeso(null);
          setVista("grilla");
          setConsulta("");
        }}
      />
    );
  }

  if (vista === "cobro") {
    return (
      <PantallaCobro
        totalCentavos={total}
        clienteNombre={ticket.clienteNombre}
        cargando={guardando}
        onVolver={() => setVista("grilla")}
        onConfirmar={confirmarCobro}
        onElegirCliente={() => setClienteAbierto(true)}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      {/* Rail de categorias: vertical y siempre visible. Una tira horizontal
          de chips obliga a scrollear para llegar a "Limpieza", y en el
          mostrador eso son dos gestos de mas por venta. */}
      <nav
        aria-label="Categorías"
        className="order-2 flex shrink-0 gap-1 overflow-x-auto border-t border-border bg-surface px-2 py-1.5 sin-scrollbar lg:order-1 lg:w-[5.5rem] lg:flex-col lg:overflow-y-auto lg:border-r lg:border-t-0 lg:px-1.5 lg:py-2"
      >
        <BotonCategoria
          activa={categoriaId === null}
          nombre="Todo"
          onClick={() => setCategoriaId(null)}
        />
        {categorias?.map((c) => (
          <BotonCategoria
            key={c.id}
            activa={categoriaId === c.id}
            nombre={c.nombre}
            color={c.color}
            onClick={() => setCategoriaId(categoriaId === c.id ? null : c.id)}
          />
        ))}
      </nav>

      <section className="order-1 flex min-h-0 flex-1 flex-col lg:order-2">
        <header className="vidrio sticky top-0 z-20 flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5">
          <div className="hidden items-center gap-2.5 pr-1 xl:flex">
            <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radio-sm)] bg-[linear-gradient(140deg,var(--brand-suave),var(--brand))] text-brand-fg shadow-[var(--sombra-1)]">
              <Store size={17} aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-display text-sm font-semibold leading-tight">
                {sesion.comercioNombre ?? "Mostrador"}
              </span>
              <span className="block text-[0.6875rem] leading-tight text-text-sutil">
                {sesion.operador?.nombre ?? "Sin operador"}
              </span>
            </span>
          </div>

          <div className="relative min-w-0 flex-1">
            <Search
              size={18}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-sutil"
            />
            <Input
              ref={buscadorRef}
              value={consulta}
              onChange={(e) => setConsulta(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && resultados[0]) {
                  e.preventDefault();
                  agregarProducto(resultados[0]);
                }
              }}
              placeholder="Buscar producto o escanear código…"
              autoFocus
              className="min-h-12 pl-11 pr-14 text-[0.9375rem]"
              aria-label="Buscar producto"
            />
            <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-[var(--radio-xs)] border border-border bg-surface-alt px-2 py-1 font-mono text-[0.6875rem] font-semibold text-text-sutil sm:block">
              /
            </kbd>
          </div>

          <EstadoSync className="hidden lg:inline-flex" />

          <div className="flex shrink-0 items-center gap-1">
            {/* Volver al panel. Solo si el que está EN EL MOSTRADOR es el
                dueño. Antes miraba `rolCuenta`, o sea la cuenta con la que se
                abrió la sesión, así que el empleado que entraba con PIN sobre
                la tablet del dueño seguía viendo el botón —y entrando. */}
            {rolEnMostrador(sesion) === "dueno" ? (
              <Link href="/reportes" aria-label="Ir al panel">
                <Boton variante="fantasma" tamano="icono">
                  <LayoutGrid size={19} />
                </Boton>
              </Link>
            ) : null}

            <Link href="/ventas" aria-label="Ventas del día">
              <Boton variante="fantasma" tamano="icono">
                <Receipt size={19} />
              </Boton>
            </Link>

            <Link href="/caja" aria-label="Caja">
              <Boton variante="fantasma" tamano="icono">
                <Wallet size={19} />
              </Boton>
            </Link>

            <Boton
              variante="secundario"
              tamano="chico"
              onClick={() => setOperadorAbierto(true)}
              aria-label="Cambiar de operador"
              className="min-h-12 gap-2"
            >
              <UserRound size={18} />
              <span className="hidden max-w-24 truncate sm:inline">
                {sesion.operador?.nombre ?? "Operador"}
              </span>
            </Boton>
          </div>
        </header>

        {/* La tira de arriba: lo que se cobra sin buscar.
        
            Antes eran solo las teclas rápidas, que alguien configura una vez y
            después nadie vuelve a tocar. Ahora convive con lo que MÁS SE VENDE
            —calculado de las ventas de verdad, no de una lista a mano— y con
            las ofertas vigentes, para que el que cobra sepa que ese producto
            está promocionado antes de que se lo diga el cliente.
            
            Las solapas se dibujan solo si hay más de una con contenido: un
            kiosco recién instalado no tiene ventas ni ofertas todavía. */}
        {destacados.length > 0 && consulta === "" ? (
          <div className="border-b border-border px-3 pb-3 pt-3">
            <div className="mb-2.5 flex items-center gap-1 overflow-x-auto sin-scrollbar">
              {destacados.map(({ clave, texto, icono: Icono, tinte }) => (
                <button
                  key={clave}
                  type="button"
                  onClick={() => setSolapa(clave)}
                  aria-pressed={solapaViva === clave}
                  className={cn(
                    "presion flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-bold uppercase tracking-wide",
                    solapaViva === clave
                      ? "bg-surface-alt text-text"
                      : "text-text-sutil hover:text-text-muted",
                  )}
                >
                  <Icono size={12} className={tinte} aria-hidden />
                  {texto}
                </button>
              ))}
              {solapaViva === "teclas" ? (
                <span className="ml-auto hidden shrink-0 pl-2 text-xs text-text-sutil sm:inline">
                  F1 a F12
                </span>
              ) : null}
            </div>

            <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(6rem,1fr))] sm:gap-2.5 sm:[grid-template-columns:repeat(auto-fill,minmax(7.25rem,1fr))]">
              {(destacados.find((d) => d.clave === solapaViva)?.items ?? [])
                .slice(0, 12)
                .map((p) => (
                  <ProductoCard
                    key={p.id}
                    producto={p}
                    color={p.categoria_id ? porCategoria.get(p.categoria_id)?.color : null}
                    categoriaNombre={
                      p.categoria_id ? porCategoria.get(p.categoria_id)?.nombre : null
                    }
                    onElegir={agregarProducto}
                  />
                ))}
            </div>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-24 lg:pb-3">
          {sinResultados ? (
            <EstadoVacio
              titulo={`No hay ningún "${consulta}"`}
              detalle="Podés crearlo ahora con nombre y precio, y seguir cobrando."
              accion={
                <Boton variante="primario" tamano="grande" onClick={() => setAltaAbierta(true)}>
                  Crear «{consulta}» y agregar
                </Boton>
              }
            />
          ) : resultados.length === 0 ? (
            <EstadoVacio
              titulo="Todavía no cargaste productos"
              detalle="Empezá por el catálogo semilla: tildás lo que vendés y le ponés precio. No hace falta cargar nada a mano."
            />
          ) : (
            <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(6.25rem,1fr))] sm:gap-2.5 sm:[grid-template-columns:repeat(auto-fill,minmax(7.75rem,1fr))]">
              {resultados.map((p) => (
                <ProductoCard
                  key={p.id}
                  producto={p}
                  color={p.categoria_id ? porCategoria.get(p.categoria_id)?.color : null}
                  categoriaNombre={p.categoria_id ? porCategoria.get(p.categoria_id)?.nombre : null}
                  onElegir={agregarProducto}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Escritorio y tablet horizontal: el ticket siempre a la vista. */}
      <PanelTicket
        className="order-3 hidden h-full w-[23rem] shrink-0 lg:flex xl:w-[25rem]"
        onCobrar={() => setVista("cobro")}
        onBalanza={abrirBalanza}
      />

      {/* Celular: barra plegada abajo. Un toque la abre entera. */}
      {!ticketAbierto ? (
        <BarraTicket total={total} lineas={ticket.lineas.length} onAbrir={() => setTicketAbierto(true)} />
      ) : (
        <div className="fixed inset-0 z-40 flex flex-col bg-[rgb(19_26_38/0.5)] lg:hidden">
          <button
            aria-label="Cerrar el ticket"
            className="flex-1 cursor-pointer"
            onClick={() => setTicketAbierto(false)}
          />
          <PanelTicket
            className="max-h-[85dvh] w-full shrink-0 animate-[subir_0.28s_cubic-bezier(0.16,1,0.3,1)]"
            onCerrar={() => setTicketAbierto(false)}
            onCobrar={() => {
              setTicketAbierto(false);
              setVista("cobro");
            }}
            onBalanza={() => {
              setTicketAbierto(false);
              abrirBalanza();
            }}
          />
        </div>
      )}

      <Hoja abierta={altaAbierta} onCerrar={() => setAltaAbierta(false)} titulo="Producto nuevo">
        {sesion.comercioId ? (
          <AltaExpress
            nombreInicial={consulta}
            comercioId={sesion.comercioId}
            categorias={categorias ?? []}
            onCancelar={() => setAltaAbierta(false)}
            onCreado={(p) => {
              setAltaAbierta(false);
              agregarProducto(p);
            }}
          />
        ) : null}
      </Hoja>

      <Hoja abierta={operadorAbierto} onCerrar={() => setOperadorAbierto(false)} titulo="Cambiar de operador">
        <div className="p-4">
          <SelectorOperador
            onListo={() => setOperadorAbierto(false)}
            onCancelar={() => setOperadorAbierto(false)}
          />
        </div>
      </Hoja>

      <Hoja abierta={clienteAbierto} onCerrar={() => setClienteAbierto(false)} titulo="Fiar a">
        {sesion.comercioId ? (
          <SelectorCliente
            comercioId={sesion.comercioId}
            montoCentavos={total}
            onElegir={(c) => {
              ticket.definirCliente(c.id, c.nombre);
              setClienteAbierto(false);
              setVista("cobro");
            }}
            onCobrarDeOtraForma={() => {
              setClienteAbierto(false);
              setVista("cobro");
            }}
            onRegistrarPago={async (c) => {
              const texto = prompt(`¿Cuánto paga ${c.nombre}?`);
              const monto = texto ? Number(texto.replace(/\D/g, "")) * 100 : 0;
              if (monto <= 0) return;
              await registrarCobro({
                comercioId: sesion.comercioId!,
                clienteId: c.id,
                montoCentavos: monto,
                medio: "EFECTIVO",
                cajaSesionId: sesion.cajaSesionId,
                usuarioId: sesion.operador?.id ?? sesion.usuarioId,
              });
              setAviso(`Pago registrado. Entró como ingreso de caja.`);
            }}
            onPedirAutorizacion={(c) => {
              setClienteAbierto(false);
              setExcesoCredito(c);
            }}
          />
        ) : null}
      </Hoja>

      <Hoja
        abierta={excesoCredito !== null}
        onCerrar={() => setExcesoCredito(null)}
        titulo="Pasar el límite"
      >
        {excesoCredito ? (
          <AutorizacionDueno
            accion="exceder_credito"
            descripcion={`Fiarle ${formatearPesos(total)} a ${excesoCredito.nombre}, que ya está en el límite.`}
            detalle={{ cliente_id: excesoCredito.id, monto_centavos: total }}
            onCancelar={() => setExcesoCredito(null)}
            onAutorizado={() => {
              ticket.definirCliente(excesoCredito.id, excesoCredito.nombre);
              setExcesoCredito(null);
              setVista("cobro");
            }}
          />
        ) : null}
      </Hoja>

      <Hoja abierta={aviso !== null} onCerrar={() => setAviso(null)} titulo="Atención">
        <div className="flex flex-col gap-4 p-4">
          <p>{aviso}</p>
          <Boton variante="primario" ancho="completo" onClick={() => setAviso(null)}>
            Entendido
          </Boton>
        </div>
      </Hoja>

      {exito ? (
        // El comprobante de la venta cerrada: el mismo papel del ticket, con
        // el sello de COBRADO encima. El vuelto va en el renglon mas grande
        // porque es el unico numero que el operador todavia necesita.
        <div
          role="status"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgb(19_26_38/0.55)] p-6 backdrop-blur-sm animate-[aparecer_0.15s_ease-out]"
        >
          <div className="papel papel-cortado relative w-full max-w-xs rounded-t-[var(--radio)] px-6 pb-8 pt-6 text-center shadow-[var(--sombra-3)] animate-[subir_0.3s_cubic-bezier(0.16,1,0.3,1)]">
            <span
              aria-hidden
              className="absolute -right-2 top-4 flex -rotate-4 items-center gap-1.5 rounded-[var(--radio-xs)] border-[3px] border-plata px-3 py-1 font-display text-lg font-extrabold uppercase tracking-[0.12em] text-plata animate-[sello_0.42s_cubic-bezier(0.34,1.4,0.5,1)_0.1s_both]"
            >
              <Check size={18} strokeWidth={3.5} /> Cobrado
            </span>

            <p className="mb-6 mt-8 font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-papel-tinta/55">
              Comprobante
            </p>

            <span className="guia mb-5 flex items-baseline font-mono text-sm text-papel-tinta/70">
              <span>total</span>
              <span className="num-recibo font-bold text-papel-tinta">
                {formatearPesos(exito.total)}
              </span>
            </span>

            {exito.vuelto > 0 ? (
              // El vuelto se muestra DESPUES de confirmar tambien: es cuando el
              // operador esta contando los billetes.
              <div className="border-t border-dashed border-papel-linea pt-5">
                <p className="font-mono text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-papel-tinta/55">
                  Su vuelto
                </p>
                <output
                  aria-live="polite"
                  className="num mt-1 block text-6xl font-extrabold leading-none tracking-[-0.03em] text-plata"
                >
                  {formatearPesos(exito.vuelto)}
                </output>
              </div>
            ) : (
              <p className="border-t border-dashed border-papel-linea pt-5 font-mono text-sm text-papel-tinta/60">
                Pago justo, sin vuelto.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Boton del rail de categorias. Lleva la ilustracion generica de la categoria,
 * no un emoji: el emoji lo dibuja cada sistema operativo distinto y en una
 * tablet Android barata la mitad no existen.
 */
function BotonCategoria({
  activa,
  nombre,
  color,
  onClick,
}: {
  activa: boolean;
  nombre: string;
  color?: string;
  onClick: () => void;
}) {
  const tinte = color ?? "var(--tinta)";

  return (
    <button
      type="button"
      onClick={() => {
        haptico(8);
        onClick();
      }}
      aria-pressed={activa}
      className={cn(
        "presion flex shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-[var(--radio)] px-2 py-2",
        "min-h-14 min-w-[4.25rem] lg:min-h-[4.25rem] lg:w-full lg:min-w-0",
        activa
          ? "bg-tinta text-brand-fg shadow-[var(--sombra-2)]"
          : "text-text-muted hover:bg-surface-alt hover:text-text",
      )}
    >
      {nombre === "Todo" ? (
        <span
          aria-hidden
          className={cn(
            "grid h-6 w-6 grid-cols-2 gap-[3px]",
            activa ? "opacity-100" : "opacity-60",
          )}
        >
          <i className="rounded-[2px] bg-current" />
          <i className="rounded-[2px] bg-current" />
          <i className="rounded-[2px] bg-current" />
          <i className="rounded-[2px] bg-current" />
        </span>
      ) : (
        <Ilustracion
          nombre=""
          categoria={nombre}
          color={activa ? "currentColor" : tinte}
          className="h-7 w-7"
        />
      )}
      <span className="w-full truncate text-center text-[0.6875rem] font-semibold leading-tight">
        {nombre}
      </span>
    </button>
  );
}

/**
 * El ticket plegado, solo en celular. Muestra lo único que hace falta ver
 * mientras se cargan productos: cuánto va y cuántos ítems hay.
 */
function BarraTicket({
  total,
  lineas,
  onAbrir,
}: {
  total: number;
  lineas: number;
  onAbrir: () => void;
}) {
  return (
    <div className="borde-seguro fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 px-2.5 pt-2.5 shadow-[0_-8px_24px_-12px_rgb(19_26_38/0.3)] backdrop-blur-lg lg:hidden">
      <button
        onClick={() => {
          haptico(8);
          onAbrir();
        }}
        disabled={lineas === 0}
        className="presion flex min-h-16 w-full cursor-pointer items-center gap-3 rounded-[var(--radio)] bg-tinta px-4 text-brand-fg shadow-[var(--sombra-2)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15">
          <ShoppingBasket size={18} aria-hidden />
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block text-xs opacity-75">
            {lineas === 0 ? "Ticket vacío" : `${lineas} ${lineas === 1 ? "ítem" : "ítems"}`}
          </span>
          <span className="num block text-xl font-bold leading-none">{formatearPesos(total)}</span>
        </span>
        <span className="shrink-0 text-sm font-bold">Ver ticket</span>
      </button>
    </div>
  );
}
