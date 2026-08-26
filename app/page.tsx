import Link from "next/link";
import { ArrowRight, ScanBarcode, Scale, Wallet } from "lucide-react";

export default function Inicio() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-8 p-6">
      <div>
        <h1 className="text-4xl font-bold">Kiosko App</h1>
        <p className="mt-2 text-text-muted">
          Gestión para kioscos y maxikioscos. Funciona sin conexión.
        </p>
      </div>

      <nav className="grid gap-3">
        <Enlace href="/pos" icono={<ScanBarcode size={24} />} titulo="Punto de venta" detalle="Cobrar" />
        <Enlace href="/balanza" icono={<Scale size={24} />} titulo="Balanza" detalle="Vender por peso" />
        <Enlace href="/caja" icono={<Wallet size={24} />} titulo="Caja" detalle="Movimientos y arqueo" />
      </nav>

      <Link href="/debug" className="text-sm text-text-muted underline underline-offset-4">
        Diagnóstico
      </Link>
    </main>
  );
}

function Enlace({
  href,
  icono,
  titulo,
  detalle,
}: {
  href: string;
  icono: React.ReactNode;
  titulo: string;
  detalle: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-16 items-center gap-4 tarjeta px-5 hover:bg-surface-alt"
    >
      <span className="text-primary">{icono}</span>
      <span className="flex-1">
        <span className="block font-semibold">{titulo}</span>
        <span className="block text-sm text-text-muted">{detalle}</span>
      </span>
      <ArrowRight size={20} className="text-text-muted" />
    </Link>
  );
}
