import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

/**
 * Alta de un comercio nuevo.
 *
 * Usa el service role porque es la única operación que no puede pasar por RLS:
 * el usuario todavía no tiene `comercio_id` en el JWT, así que cualquier
 * política lo rechazaría. Por eso el tenant se deriva SIEMPRE de la sesión
 * verificada del servidor y nunca de lo que manda el cliente.
 */
const zEntrada = z.object({
  nombreComercio: z.string().min(2).max(80),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "El slug solo puede tener letras, números y guiones"),
  nombrePersona: z.string().min(2).max(60),
  pin: z.string().regex(/^\d{4}$/),
});

export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Necesitás estar logueado" }, { status: 401 });
  }

  const cuerpo = zEntrada.safeParse(await request.json().catch(() => null));
  if (!cuerpo.success) {
    return NextResponse.json({ error: "Faltan datos o están mal" }, { status: 400 });
  }

  const admin = supabaseAdmin();

  // Un usuario no puede crear un segundo comercio desde acá.
  const { data: existente } = await admin
    .from("usuarios_comercio")
    .select("comercio_id")
    .eq("id", user.id)
    .maybeSingle();

  if (existente) {
    return NextResponse.json({ error: "Ya pertenecés a un kiosco" }, { status: 409 });
  }

  const { nombreComercio, slug, nombrePersona, pin } = cuerpo.data;

  const { data: comercio, error: errorComercio } = await admin
    .from("comercios")
    .insert({ nombre: nombreComercio, slug })
    .select("id")
    .single();

  if (errorComercio) {
    const ocupado = errorComercio.message.includes("duplicate") || errorComercio.code === "23505";
    return NextResponse.json(
      { error: ocupado ? "Ese nombre ya está usado. Probá con otro." : errorComercio.message },
      { status: ocupado ? 409 : 500 },
    );
  }

  const { error: errorConfig } = await admin
    .from("config_comercio")
    .insert({ comercio_id: comercio.id });
  if (errorConfig) {
    return NextResponse.json({ error: errorConfig.message }, { status: 500 });
  }

  const { error: errorUsuario } = await admin.from("usuarios_comercio").insert({
    id: user.id,
    comercio_id: comercio.id,
    nombre: nombrePersona,
    rol: "dueno",
  });
  if (errorUsuario) {
    return NextResponse.json({ error: errorUsuario.message }, { status: 500 });
  }

  // El PIN se hashea del lado de la base: acá nunca se guarda en claro.
  const { error: errorPin } = await admin.rpc("definir_pin_admin", {
    p_usuario_id: user.id,
    p_pin: pin,
  });
  if (errorPin) {
    // El kiosco ya existe; el PIN se puede poner después desde Configuración.
    return NextResponse.json({ ok: true, avisoPin: errorPin.message });
  }

  return NextResponse.json({ ok: true, comercioId: comercio.id });
}
