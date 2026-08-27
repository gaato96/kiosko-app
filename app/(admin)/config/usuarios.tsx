"use client";

/**
 * Alta y gestión de usuarios.
 *
 * El PIN no se recupera por mail: solo el dueño lo resetea desde acá. Si el
 * dueño único olvida el suyo, lo cambia con la contraseña de su cuenta.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, KeyRound, UserPlus } from "lucide-react";
import { Boton } from "@/components/ui/boton";
import { Campo, Input, Select } from "@/components/ui/campo";
import { Hoja } from "@/components/ui/hoja";
import { SubirImagen } from "@/components/ui/subir-imagen";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Rol, UsuarioComercio } from "@/lib/tipos";
import { cn } from "@/lib/utils";

export function PanelUsuarios({
  usuarios,
  usuarioActual,
  comercioId,
}: {
  usuarios: UsuarioComercio[];
  usuarioActual: string;
  comercioId: string;
}) {
  const router = useRouter();
  const [pinPara, setPinPara] = useState<UsuarioComercio | null>(null);
  const [fotoPara, setFotoPara] = useState<UsuarioComercio | null>(null);
  const [invitando, setInvitando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  async function cambiarAvatar(u: UsuarioComercio, url: string | null) {
    const { error } = await supabaseBrowser()
      .from("usuarios_comercio")
      .update({ avatar_url: url })
      .eq("id", u.id);
    if (error) return setAviso(error.message);
    router.refresh();
  }

  async function cambiarActivo(u: UsuarioComercio, activo: boolean) {
    const { error } = await supabaseBrowser()
      .from("usuarios_comercio")
      .update({ activo })
      .eq("id", u.id);
    if (error) return setAviso(error.message);
    router.refresh();
  }

  async function cambiarRol(u: UsuarioComercio, rol: Rol) {
    const { error } = await supabaseBrowser().from("usuarios_comercio").update({ rol }).eq("id", u.id);
    if (error) return setAviso(error.message);
    setAviso(`${u.nombre} ahora es ${rol === "dueno" ? "dueño" : "empleado"}. Tiene que volver a entrar para que el cambio tome efecto.`);
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Quién usa el sistema</h2>
        <Boton onClick={() => setInvitando(true)}>
          <UserPlus size={18} /> Sumar a alguien
        </Boton>
      </header>

      {aviso ? (
        <p className="tarjeta p-4 text-sm">{aviso}</p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {usuarios.map((u) => (
          <li
            key={u.id}
            className={cn(
              "flex flex-wrap items-center gap-3 tarjeta p-4",
              !u.activo && "opacity-60",
            )}
          >
            {/* La foto también se toca desde acá: es el dueño el que carga a
                los empleados, y pedirle a cada uno que entre a poner su foto
                es un paso que nadie da. */}
            <button
              type="button"
              onClick={() => setFotoPara(u)}
              aria-label={`Cambiar la foto de ${u.nombre}`}
              className="presion group relative h-11 w-11 shrink-0 cursor-pointer overflow-hidden rounded-full"
            >
              {u.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={u.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-primary font-bold text-primary-fg">
                  {u.nombre.charAt(0).toUpperCase()}
                </span>
              )}
              <span className="absolute inset-0 flex items-center justify-center bg-[rgb(4_7_14/0.55)] text-white opacity-0 transition-opacity group-hover:opacity-100">
                <Camera size={16} aria-hidden />
              </span>
            </button>

            <span className="min-w-32 flex-1">
              <span className="block font-medium">{u.nombre}</span>
              <span className="block text-sm text-text-muted">
                {u.rol === "dueno" ? "Dueño" : "Empleado"}
                {u.id === usuarioActual ? " · sos vos" : ""}
                {!u.activo ? " · desactivado" : ""}
              </span>
            </span>

            <Select
              value={u.rol}
              onChange={(e) => cambiarRol(u, e.target.value as Rol)}
              disabled={u.id === usuarioActual}
              className="min-h-11 w-36"
              aria-label={`Rol de ${u.nombre}`}
            >
              <option value="empleado">Empleado</option>
              <option value="dueno">Dueño</option>
            </Select>

            <Boton tamano="chico" onClick={() => setPinPara(u)}>
              <KeyRound size={16} /> PIN
            </Boton>

            <Boton
              tamano="chico"
              variante={u.activo ? "fantasma" : "secundario"}
              disabled={u.id === usuarioActual}
              onClick={() => cambiarActivo(u, !u.activo)}
            >
              {u.activo ? "Desactivar" : "Reactivar"}
            </Boton>
          </li>
        ))}
      </ul>

      <p className="text-sm text-text-muted">
        El empleado no ve costos, márgenes, reportes ni el efectivo esperado. Eso no depende de que
        se le escondan los botones: la base directamente no le devuelve esos datos.
      </p>

      <Hoja abierta={pinPara !== null} onCerrar={() => setPinPara(null)} titulo="Cambiar el PIN">
        {pinPara ? (
          <FormularioPin
            usuario={pinPara}
            onListo={(mensaje) => {
              setPinPara(null);
              setAviso(mensaje);
            }}
          />
        ) : null}
      </Hoja>

      <Hoja
        abierta={fotoPara !== null}
        onCerrar={() => setFotoPara(null)}
        titulo={fotoPara ? `Foto de ${fotoPara.nombre}` : ""}
      >
        {fotoPara ? (
          <div className="flex flex-col gap-4 p-5">
            <SubirImagen
              valor={fotoPara.avatar_url}
              onCambio={(url) => {
                setFotoPara({ ...fotoPara, avatar_url: url });
                void cambiarAvatar(fotoPara, url);
              }}
              comercioId={comercioId}
              carpeta="usuarios"
              forma="redonda"
              etiqueta="Foto"
              ayuda="Se ve en el mostrador cuando se cambia de operador. Opcional."
            />
            <Boton variante="primario" ancho="completo" onClick={() => setFotoPara(null)}>
              Listo
            </Boton>
          </div>
        ) : null}
      </Hoja>

      <Hoja abierta={invitando} onCerrar={() => setInvitando(false)} titulo="Sumar a alguien">
        <FormularioInvitacion
          onListo={(mensaje) => {
            setInvitando(false);
            setAviso(mensaje);
            router.refresh();
          }}
        />
      </Hoja>
    </section>
  );
}

function FormularioPin({
  usuario,
  onListo,
}: {
  usuario: UsuarioComercio;
  onListo: (mensaje: string) => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  return (
    <form
      className="flex flex-col gap-4 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!/^\d{4}$/.test(pin)) return setError("El PIN son 4 dígitos.");

        setGuardando(true);
        const { error } = await supabaseBrowser().rpc("definir_pin", {
          p_usuario_id: usuario.id,
          p_pin: pin,
        });
        setGuardando(false);

        if (error) return setError(error.message);
        onListo(`PIN de ${usuario.nombre} actualizado.`);
      }}
    >
      <p className="text-text-muted">
        El PIN de {usuario.nombre} sirve para cambiar de operador en el mostrador y, si es dueño,
        para autorizar anulaciones y descuentos. No reemplaza al login.
      </p>

      <Campo etiqueta="PIN nuevo" ayuda="4 dígitos. Se guarda hasheado y se valida en el servidor.">
        <Input
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          autoFocus
          className="num text-center text-2xl tracking-[0.5em]"
        />
      </Campo>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <Boton variante="primario" tamano="grande" ancho="completo" type="submit" disabled={guardando}>
        Guardar PIN
      </Boton>
    </form>
  );
}

function FormularioInvitacion({ onListo }: { onListo: (mensaje: string) => void }) {
  const [mail, setMail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  return (
    <form
      className="flex flex-col gap-4 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setEnviando(true);
        setError(null);

        // Magic link de Supabase. Al entrar por primera vez cae en /onboarding,
        // donde el dueño lo asocia al comercio con su rol y su PIN.
        const { error } = await supabaseBrowser().auth.signInWithOtp({
          email: mail.trim(),
          options: { shouldCreateUser: true, emailRedirectTo: `${location.origin}/onboarding` },
        });

        setEnviando(false);
        if (error) return setError(error.message);
        onListo(`Le mandamos el link de acceso a ${mail}. Cuando entre, terminá de darle el alta acá.`);
      }}
    >
      <p className="text-text-muted">
        Le llega un link por mail. No hace falta que invente una contraseña.
      </p>

      <Campo etiqueta="Mail">
        <Input
          type="email"
          value={mail}
          onChange={(e) => setMail(e.target.value)}
          autoCapitalize="none"
          required
          autoFocus
        />
      </Campo>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <Boton variante="primario" tamano="grande" ancho="completo" type="submit" disabled={enviando}>
        {enviando ? "Enviando…" : "Mandar la invitación"}
      </Boton>
    </form>
  );
}
