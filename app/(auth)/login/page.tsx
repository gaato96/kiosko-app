import { CloudOff, Scale, Wallet } from "lucide-react";
import { FormularioLogin } from "./formulario";

export const metadata = { title: "Entrar" };

/**
 * Login partido: el formulario a la izquierda, y a la derecha un ticket de
 * papel que dice para qué sirve esto. El ticket no es adorno — es el mismo
 * material que domina el POS, así que la primera pantalla ya enseña el
 * lenguaje visual de la app.
 */
const RASGOS = [
  { icono: CloudOff, texto: "Cobrás aunque se caiga internet" },
  { icono: Scale, texto: "Balanza integrada, sin calculadora" },
  { icono: Wallet, texto: "Fiado, arqueo y reportes del día" },
] as const;

export default function Login() {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1fr_0.85fr]">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-12 flex items-center gap-2.5">
            <Marca />
            <span className="font-display text-[0.9375rem] font-bold tracking-tight">
              Kiosko App
            </span>
          </div>

          <h1 className="font-display text-[2.5rem] font-extrabold leading-[1.02] tracking-[-0.03em]">
            Abrí el
            <br />
            mostrador
          </h1>
          <p className="mb-9 mt-3 text-[0.9375rem] leading-relaxed text-text-muted">
            Entrá con el mail del negocio. Para cambiar de persona en la caja se usa el PIN, no
            el login.
          </p>

          <FormularioLogin />
        </div>
      </div>

      {/* El ticket. Mismo papel, mismo corte dentado que en el POS. */}
      <aside className="relative hidden items-center justify-center overflow-hidden bg-hundida px-10 lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.5] [background-image:radial-gradient(var(--borde-fuerte)_1px,transparent_1px)] [background-size:22px_22px]"
        />

        <div className="papel papel-cortado relative w-full max-w-[19rem] rounded-t-[var(--radio)] shadow-[var(--sombra-3)]">
          <span aria-hidden className="toldo block h-2 rounded-t-[var(--radio)]" />

          <div className="px-6 pb-10 pt-6">
            <p className="text-center font-mono text-[0.6875rem] uppercase tracking-[0.2em] text-papel-tinta/50">
              Kiosco · turno mañana
            </p>

            <p className="mt-7 font-display text-[1.75rem] font-extrabold leading-[1.08] tracking-[-0.03em] text-papel-tinta">
              El mostrador no espera a que vuelva internet.
            </p>

            <ul className="mt-8 flex flex-col gap-3.5 border-t border-dashed border-papel-linea pt-6">
              {RASGOS.map(({ icono: Icono, texto }) => (
                <li key={texto} className="flex items-start gap-3">
                  <Icono size={16} className="mt-0.5 shrink-0 text-plata" aria-hidden />
                  <span className="font-mono text-[0.8125rem] leading-snug text-papel-tinta/80">
                    {texto}
                  </span>
                </li>
              ))}
            </ul>

            <span className="guia mt-8 flex items-baseline font-mono text-sm">
              <span className="font-bold uppercase tracking-wider text-papel-tinta/60">Total</span>
              <span className="num-recibo text-xl font-bold text-plata">Tu kiosco</span>
            </span>
          </div>
        </div>
      </aside>
    </main>
  );
}

/** La marca: una persiana de kiosco a medio levantar. */
function Marca() {
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radio-sm)] bg-tinta text-white">
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
        <path d="M3 4h18v3H3z" fill="currentColor" />
        <path d="M4 9h16M4 13h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M4 17h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".5" />
      </svg>
    </span>
  );
}
