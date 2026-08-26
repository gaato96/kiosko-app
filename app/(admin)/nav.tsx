"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Boxes,
  ScanBarcode,
  Settings,
  Store,
  Tags,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import type { Rol } from "@/lib/tipos";
import { cn } from "@/lib/utils";

/**
 * El menu vive aca, del lado del cliente: los componentes de icono de lucide
 * son funciones y React no las puede serializar cruzando la frontera
 * servidor -> cliente.
 */
const GRUPOS = [
  {
    rotulo: "Mirar",
    soloDueno: true,
    items: [
      { href: "/reportes", icono: BarChart3, texto: "Panel" },
      { href: "/caja-historial", icono: Wallet, texto: "Cajas" },
    ],
  },
  {
    rotulo: "Mercadería",
    soloDueno: true,
    items: [
      { href: "/productos", icono: ScanBarcode, texto: "Productos" },
      { href: "/stock", icono: Boxes, texto: "Stock" },
      { href: "/precios", icono: Tags, texto: "Precios" },
    ],
  },
  {
    rotulo: "Vender",
    items: [
      { href: "/clientes", icono: Users, texto: "Fiados", soloDueno: true },
      { href: "/vidriera", icono: Store, texto: "Pedidos" },
    ],
  },
  {
    rotulo: "Cuenta",
    soloDueno: true,
    items: [{ href: "/config", icono: Settings, texto: "Configuración" }],
  },
] as const;

/**
 * Navegación del admin. Marcar la sección activa no es decoración: sin eso,
 * ocho links iguales obligan a leer la URL para saber dónde estás.
 *
 * En pantalla chica se aplasta a una tira horizontal scrolleable, con los
 * grupos disueltos: en el celular el dueño entra a una sección puntual, no
 * navega el árbol completo.
 */
export function NavAdmin({ rol }: { rol: Rol | "anon" }) {
  const ruta = usePathname();
  const activo = (href: string) => ruta === href || ruta.startsWith(`${href}/`);

  // Al empleado no se le muestran secciones a las que el middleware le va a
  // contestar 403. Un link que lleva a una pared no es un permiso, es basura.
  const grupos = GRUPOS.map((g) => ({
    ...g,
    items: g.items.filter(
      (i) => rol === "dueno" || (!("soloDueno" in g && g.soloDueno) && !("soloDueno" in i && i.soloDueno)),
    ),
  })).filter((g) => g.items.length > 0);

  return (
    <nav className="flex-1 overflow-y-auto">
      {/* Escritorio: agrupada y vertical */}
      <div className="hidden flex-col gap-5 px-3 pb-4 lg:flex">
        {grupos.map((g) => (
          <div key={g.rotulo} className="flex flex-col gap-0.5">
            <p className="rotulo px-3 pb-1.5">{g.rotulo}</p>
            {g.items.map(({ href, icono: Icono, texto }) => (
              <Link
                key={href}
                href={href}
                aria-current={activo(href) ? "page" : undefined}
                className={cn(
                  "presion flex min-h-11 items-center gap-2.5 rounded-[var(--radio)] px-3 text-sm font-semibold",
                  activo(href)
                    ? "bg-tinta text-brand-fg shadow-[var(--sombra-1)]"
                    : "text-text-muted hover:bg-surface-alt hover:text-text",
                )}
              >
                <Icono size={17} className="shrink-0" aria-hidden />
                {texto}
              </Link>
            ))}
          </div>
        ))}
      </div>

      {/* Celular y tablet: una sola tira */}
      <div className="flex gap-1.5 overflow-x-auto p-2 sin-scrollbar lg:hidden">
        {grupos.flatMap((g) =>
          g.items.map(({ href, icono: Icono, texto }) => (
            <Link
              key={href}
              href={href}
              aria-current={activo(href) ? "page" : undefined}
              className={cn(
                "presion flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold",
                activo(href)
                  ? "border-tinta bg-tinta text-brand-fg"
                  : "border-border text-text-muted hover:text-text",
              )}
            >
              <Icono size={16} className="shrink-0" aria-hidden />
              {texto}
            </Link>
          )),
        )}
        <Link
          href="/pos"
          className="presion flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-[linear-gradient(180deg,var(--plata-viva),var(--plata))] px-4 text-sm font-bold text-plata-fg"
        >
          <Zap size={15} aria-hidden />
          Cobrar
        </Link>
      </div>
    </nav>
  );
}
