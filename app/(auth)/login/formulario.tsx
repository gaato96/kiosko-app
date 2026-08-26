"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AlertCircle } from "lucide-react";
import { Boton } from "@/components/ui/boton";
import { Campo, Input } from "@/components/ui/campo";
import { supabaseBrowser } from "@/lib/supabase/browser";

function Formulario() {
  const router = useRouter();
  const params = useSearchParams();
  const [mail, setMail] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);

    const { error } = await supabaseBrowser().auth.signInWithPassword({
      email: mail.trim(),
      password: clave,
    });

    if (error) {
      // Un solo mensaje para todo esconde la causa real. "Probaste 30 veces en
      // una hora" y "te equivocaste de contraseña" se arreglan distinto.
      const m = error.message.toLowerCase();
      if (m.includes("rate limit") || error.status === 429) {
        setError("Demasiados intentos seguidos. Esperá un minuto y probá de nuevo.");
      } else if (m.includes("invalid login")) {
        setError(
          "Ese mail y esa contraseña no coinciden. Ojo con el autocompletado del navegador: " +
            "borrá los dos campos y escribilos a mano.",
        );
      } else if (m.includes("email not confirmed")) {
        setError("La cuenta existe pero falta confirmar el mail.");
      } else if (m.includes("fetch") || m.includes("network")) {
        setError("No se pudo llegar al servidor. Revisá la conexión.");
      } else {
        setError(error.message);
      }
      setCargando(false);
      return;
    }

    router.replace(params.get("volver") ?? "/pos");
    router.refresh();
  }

  return (
    <form onSubmit={entrar} className="flex flex-col gap-5">
      <Campo etiqueta="Mail" requerido>
        <Input
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          required
          value={mail}
          onChange={(e) => setMail(e.target.value)}
          placeholder="kiosco@ejemplo.com"
        />
      </Campo>

      <Campo etiqueta="Contraseña" requerido>
        <Input
          type="password"
          autoComplete="current-password"
          required
          value={clave}
          onChange={(e) => setClave(e.target.value)}
        />
      </Campo>

      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-[var(--radio)] border border-danger/30 bg-danger-tenue p-3 text-sm font-medium text-danger"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      <Boton
        type="submit"
        variante="primario"
        tamano="grande"
        ancho="completo"
        cargando={cargando}
        className="mt-1"
      >
        {cargando ? "Entrando…" : "Entrar"}
      </Boton>

      <p className="text-sm leading-relaxed text-text-sutil">
        La sesión queda abierta en este dispositivo. Para cambiar de persona en el mostrador se usa
        el PIN, no el login.
      </p>
    </form>
  );
}

export function FormularioLogin() {
  return (
    <Suspense fallback={null}>
      <Formulario />
    </Suspense>
  );
}
