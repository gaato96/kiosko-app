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

    const { data, error } = await supabaseBrowser().auth.signInWithPassword({
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

    // Al dueño se lo lleva al panel: entra a mirar cómo viene el día. Al
    // empleado, directo al mostrador, que es lo único que puede hacer.
    // El rol vive en el JWT (lo inyecta el hook de Supabase), no en la fila de
    // auth.users, así que se lee del token y no de `data.user`.
    const destino = params.get("volver") ?? (rolDelToken(data.session?.access_token) === "dueno" ? "/reportes" : "/pos");

    router.replace(destino);
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
          placeholder="kiosko@ejemplo.com"
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

/** Lee `app_metadata.rol` del access token sin traer una librería para eso. */
function rolDelToken(token?: string): string | null {
  if (!token) return null;
  try {
    const carga = token.split(".")[1];
    if (!carga) return null;
    const json = atob(carga.replace(/-/g, "+").replace(/_/g, "/"));
    return (JSON.parse(json)?.app_metadata?.rol as string) ?? null;
  } catch {
    // Un token que no se puede leer no es motivo para trabar el login: el
    // destino por defecto (el mostrador) sirve para cualquier rol.
    return null;
  }
}
