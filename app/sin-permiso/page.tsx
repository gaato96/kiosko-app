import { ShieldAlert } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Sin permiso" };

export default function SinPermiso() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <ShieldAlert size={40} className="text-warning" />
      <h1 className="text-2xl font-bold">Esta parte es del dueño</h1>
      <p className="max-w-sm text-text-muted">
        Tu usuario atiende el mostrador. Si necesitás entrar acá, pedile al dueño que te cambie el
        rol.
      </p>
      <Link
        href="/pos"
        className="mt-2 inline-flex min-h-14 items-center rounded-[var(--radio)] bg-primary px-6 font-semibold text-primary-fg"
      >
        Volver a cobrar
      </Link>
    </main>
  );
}
