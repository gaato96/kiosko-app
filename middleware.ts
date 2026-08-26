import { NextResponse, type NextRequest } from "next/server";
import { tenantDeClaims } from "@/lib/auth";
import { actualizarSesion } from "@/lib/supabase/middleware";

/**
 * Protege el POS y el admin, y refresca la sesión en cada request.
 *
 * Lo que NO hace: decidir permisos finos. El rol lo aplica RLS en la base.
 * Acá solo se evita mostrarle a alguien una pantalla que igual no podría usar.
 */

const RUTAS_PUBLICAS = ["/login", "/t/", "/offline", "/manifest.json", "/sw.js", "/icons/"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (RUTAS_PUBLICAS.some((r) => pathname === r || pathname.startsWith(r))) {
    return NextResponse.next();
  }

  const { response, claims } = await actualizarSesion(request);

  if (!claims) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("volver", pathname);
    return NextResponse.redirect(url);
  }

  const tenant = tenantDeClaims(claims);

  // Invitación a medias: hay cuenta pero todavía no hay comercio.
  if (!tenant.comercioId && pathname !== "/onboarding") {
    const url = request.nextUrl.clone();
    url.pathname = "/onboarding";
    return NextResponse.redirect(url);
  }

  // El admin es del dueño. Un empleado recibe 403, no una pantalla en blanco.
  //
  // `/vidriera` queda afuera a propósito: el pedido que entra lo atiende quien
  // esté en el mostrador. Si para confirmarlo hay que llamar al dueño, el
  // cliente que está esperando del otro lado ya se fue a pedir a otro lado.
  const ADMIN = ["/productos", "/stock", "/clientes", "/reportes", "/config", "/precios", "/compras", "/usuarios"];
  if (ADMIN.some((r) => pathname.startsWith(r)) && tenant.rol !== "dueno") {
    const url = request.nextUrl.clone();
    url.pathname = "/sin-permiso";
    return NextResponse.rewrite(url, { status: 403 });
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|woff2)$).*)"],
};
