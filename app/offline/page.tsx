import { CloudOff } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Sin conexión" };

export default function SinConexion() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <CloudOff size={40} className="text-warning" />
      <h1 className="text-2xl font-bold">Esta pantalla necesita conexión</h1>
      <p className="max-w-sm text-text-muted">
        El punto de venta sigue funcionando sin internet. Los reportes y la configuración no.
      </p>
      <Link
        href="/pos"
        className="mt-2 inline-flex min-h-14 items-center rounded-[var(--radio)] bg-primary px-6 font-semibold text-primary-fg"
      >
        Ir a cobrar
      </Link>
    </main>
  );
}
