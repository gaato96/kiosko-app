"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/components/ui/boton";
import { Campo, Input } from "@/components/ui/campo";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { normalizar } from "@/lib/db/schema";

export function FormularioOnboarding({ yaAsociado, mail }: { yaAsociado: boolean; mail: string }) {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [nombrePersona, setNombrePersona] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  /** El slug tiene que ser corto y decible por teléfono: es el link público. */
  const slug = normalizar(nombre)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  async function refrescarSesion() {
    setTrabajando(true);
    // Al refrescar, el hook vuelve a correr y el JWT trae comercio_id y rol.
    const { error } = await supabaseBrowser().auth.refreshSession();
    setTrabajando(false);
    if (error) return setError(error.message);
    router.replace("/pos");
    router.refresh();
  }

  if (yaAsociado) {
    return (
      <div className="flex flex-col gap-4">
        <p className="tarjeta p-4">
          Ya estás dado de alta. Solo falta refrescar tu sesión para que tu usuario tome el kiosco y
          el rol.
        </p>
        <Boton variante="primario" tamano="grande" onClick={refrescarSesion} disabled={trabajando}>
          {trabajando ? "Actualizando…" : "Entrar"}
        </Boton>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!/^\d{4}$/.test(pin)) return setError("El PIN son 4 dígitos.");

        setTrabajando(true);
        setError(null);

        // El alta del comercio pasa por una ruta del servidor: crear el tenant y
        // asociarse a uno mismo como dueño no lo puede hacer el cliente, porque
        // todavía no tiene comercio_id en el JWT y RLS lo rechazaría.
        const res = await fetch("/api/onboarding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nombreComercio: nombre.trim(), slug, nombrePersona: nombrePersona.trim(), pin }),
        });

        if (!res.ok) {
          const cuerpo = (await res.json().catch(() => ({}))) as { error?: string };
          setTrabajando(false);
          return setError(cuerpo.error ?? "No se pudo crear el kiosco.");
        }

        await refrescarSesion();
      }}
    >
      <Campo etiqueta="¿Cómo se llama tu kiosco?">
        <Input value={nombre} onChange={(e) => setNombre(e.target.value)} required autoFocus />
      </Campo>

      {slug ? (
        <p className="text-sm text-text-muted">
          Tu vidriera va a estar en <span className="font-mono">/t/{slug}</span>
        </p>
      ) : null}

      <Campo etiqueta="¿Cómo te llamás?" ayuda={`Vas a entrar con ${mail}.`}>
        <Input value={nombrePersona} onChange={(e) => setNombrePersona(e.target.value)} required />
      </Campo>

      <Campo
        etiqueta="Tu PIN de 4 dígitos"
        ayuda="Es el que vas a usar para autorizar anulaciones y descuentos en el mostrador."
      >
        <Input
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          className="num text-center text-2xl tracking-[0.5em]"
          required
        />
      </Campo>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <Boton variante="primario" tamano="grande" type="submit" disabled={trabajando || !slug}>
        {trabajando ? "Creando…" : "Crear mi kiosco"}
      </Boton>
    </form>
  );
}
