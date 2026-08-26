/**
 * La URL pública del comercio.
 *
 * `NEXT_PUBLIC_APP_URL` la carga una persona a mano en el panel de Vercel, y
 * ahí es facilísimo escribir `mi-app.vercel.app` sin el esquema. Sin `https://`
 * el href queda relativo y el navegador lo pega al dominio actual, con lo que
 * el link de la Vidriera sale duplicado:
 *
 *   https://mi-app.vercel.app/mi-app.vercel.app/t/kiosco
 *
 * Es un error de dedo que no debería romper el link que el kiosco imprime en un
 * QR y pega en la puerta. Por eso se normaliza acá y no se confía en el valor.
 */

/** Devuelve el origen con esquema y sin barra final. Vacío si no hay nada usable. */
export function origenPublico(crudo?: string | null): string {
  const v = (crudo ?? "").trim();
  if (!v) return "";

  const conEsquema = /^https?:\/\//i.test(v) ? v : `https://${v}`;

  try {
    // `new URL` valida y de paso descarta cualquier path que hayan pegado de más.
    return new URL(conEsquema).origin;
  } catch {
    return "";
  }
}

/**
 * El link que se comparte por WhatsApp y se imprime en el QR.
 * Si no hay origen configurado devuelve la ruta relativa, que sigue funcionando
 * dentro de la app aunque no sirva para compartir.
 */
export function urlVidriera(slug: string, crudo?: string | null): string {
  const origen = origenPublico(crudo);
  const ruta = `/t/${slug}`;
  return origen ? `${origen}${ruta}` : ruta;
}
