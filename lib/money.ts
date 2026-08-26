/**
 * lib/money.ts — LA ÚNICA implementación de dinero del proyecto.
 *
 * Regla de oro #1: la plata se guarda y se calcula en CENTAVOS enteros.
 * Nunca float, nunca `number` con decimales. El formateo a pesos vive
 * solamente en la capa de presentación.
 *
 * Si encontrás lógica de redondeo duplicada en otro archivo, está mal:
 * borrala y usá esto.
 */

/** Unidades de redondeo que ofrece la configuración del comercio. */
export const UNIDADES_REDONDEO = [1, 100, 1000, 5000, 10000] as const;
export type UnidadRedondeo = (typeof UNIDADES_REDONDEO)[number];

/** Etiquetas para la UI de configuración. */
export const ETIQUETAS_REDONDEO: Record<number, string> = {
  1: "Sin redondeo",
  100: "Al peso ($1)",
  1000: "A $10",
  5000: "A $50",
  10000: "A $100",
};

/**
 * Redondea un importe en centavos al múltiplo más cercano de `unidadCentavos`.
 * En Argentina las monedas no circulan: el kiosco define si redondea a $1, $10,
 * $50 o $100 y todo el sistema respeta esa única decisión.
 *
 * Redondeo al más cercano, con los empates hacia arriba en valor absoluto
 * (media vuelta "half away from zero"), para que -$50 y $50 se comporten igual.
 */
export function redondear(centavos: number, unidadCentavos: number): number {
  if (!Number.isFinite(centavos)) throw new Error("redondear: centavos no es finito");
  if (!Number.isInteger(centavos)) throw new Error("redondear: centavos debe ser entero");
  if (!Number.isInteger(unidadCentavos) || unidadCentavos < 1) {
    throw new Error("redondear: unidadCentavos debe ser un entero >= 1");
  }
  if (unidadCentavos === 1) return centavos;

  const signo = centavos < 0 ? -1 : 1;
  const abs = Math.abs(centavos);
  const resto = abs % unidadCentavos;
  const piso = abs - resto;
  const redondeado = resto * 2 >= unidadCentavos ? piso + unidadCentavos : piso;
  return signo * redondeado;
}

/** Redondeo siempre hacia arriba (se usa en costos y márgenes, no en cobros). */
export function redondearArriba(centavos: number, unidadCentavos: number): number {
  if (unidadCentavos <= 1) return centavos;
  const signo = centavos < 0 ? -1 : 1;
  const abs = Math.abs(centavos);
  return signo * Math.ceil(abs / unidadCentavos) * unidadCentavos;
}

/**
 * Formatea centavos como pesos argentinos: `1240000` -> `"$ 12.400"`.
 * Los centavos solo se muestran si existen: `1240050` -> `"$ 12.400,50"`.
 */
export function formatearPesos(
  centavos: number,
  opciones: { signo?: boolean; simbolo?: boolean } = {},
): string {
  const { signo = false, simbolo = true } = opciones;
  const entero = Math.trunc(Math.abs(centavos) / 100);
  const resto = Math.abs(centavos) % 100;

  const miles = entero.toLocaleString("es-AR", { useGrouping: true });
  const cuerpo = resto === 0 ? miles : `${miles},${String(resto).padStart(2, "0")}`;

  const negativo = centavos < 0;
  const prefijo = negativo ? "-" : signo ? "+" : "";
  return simbolo ? `${prefijo}$ ${cuerpo}` : `${prefijo}${cuerpo}`;
}

/** Solo el número, sin símbolo. Útil dentro de inputs. */
export function formatearNumero(centavos: number): string {
  return formatearPesos(centavos, { simbolo: false });
}

/**
 * Parsea texto escrito por una persona a centavos.
 * Acepta `"$ 12.400"`, `"12400"`, `"12.400,50"`, `"12,50"`, `"1.234.567"`.
 * Convención argentina: el punto separa miles, la coma separa decimales.
 * Devuelve `null` si no hay un número interpretable.
 */
export function parsearPesos(texto: string): number | null {
  if (typeof texto !== "string") return null;
  const limpio = texto.replace(/[^\d.,-]/g, "").trim();
  if (limpio === "" || limpio === "-") return null;

  const negativo = limpio.startsWith("-");
  const sinSigno = limpio.replace(/-/g, "");

  const ultimaComa = sinSigno.lastIndexOf(",");
  const ultimoPunto = sinSigno.lastIndexOf(".");

  let enteroTxt: string;
  let decimalTxt = "";

  if (ultimaComa !== -1) {
    // La coma manda como separador decimal.
    enteroTxt = sinSigno.slice(0, ultimaComa).replace(/[.,]/g, "");
    decimalTxt = sinSigno.slice(ultimaComa + 1).replace(/[.,]/g, "");
  } else if (ultimoPunto !== -1) {
    const cola = sinSigno.slice(ultimoPunto + 1);
    const puntos = sinSigno.split(".").length - 1;
    // "12.50" con dos decimales y un solo punto se lee como decimal;
    // "12.400" o "1.234.567" se leen como miles.
    if (puntos === 1 && cola.length > 0 && cola.length <= 2) {
      enteroTxt = sinSigno.slice(0, ultimoPunto);
      decimalTxt = cola;
    } else {
      enteroTxt = sinSigno.replace(/\./g, "");
    }
  } else {
    enteroTxt = sinSigno;
  }

  if (enteroTxt === "") enteroTxt = "0";
  if (!/^\d+$/.test(enteroTxt)) return null;
  if (decimalTxt !== "" && !/^\d+$/.test(decimalTxt)) return null;

  const centavosDecimal = Number((decimalTxt + "00").slice(0, 2));
  const total = Number(enteroTxt) * 100 + centavosDecimal;
  if (!Number.isSafeInteger(total)) return null;
  return negativo ? -total : total;
}

/** Pesos enteros -> centavos. Atajo para seeds y tests. */
export function pesos(monto: number): number {
  return Math.round(monto * 100);
}

/**
 * Aplica un porcentaje sobre un importe y devuelve el resultado en centavos
 * enteros. Se usa en la actualización masiva por inflación (M7).
 */
export function aplicarPorcentaje(centavos: number, pct: number): number {
  return Math.round(centavos * (1 + pct / 100));
}

/**
 * Precio de venta sugerido a partir del costo y un margen objetivo sobre venta.
 * margen = (venta - costo) / venta  =>  venta = costo / (1 - margen)
 */
export function precioPorMargen(
  costoCentavos: number,
  margenPct: number,
  redondeoCentavos = 1,
): number {
  if (margenPct >= 100) throw new Error("precioPorMargen: el margen debe ser < 100%");
  const bruto = Math.round(costoCentavos / (1 - margenPct / 100));
  return redondear(bruto, redondeoCentavos);
}

/** Margen porcentual sobre el precio de venta. Devuelve 0 si no hay precio. */
export function margenPct(precioCentavos: number, costoCentavos: number): number {
  if (precioCentavos <= 0) return 0;
  return ((precioCentavos - costoCentavos) / precioCentavos) * 100;
}

/** Ganancia bruta en centavos. */
export function ganancia(precioCentavos: number, costoCentavos: number): number {
  return precioCentavos - costoCentavos;
}

/**
 * Desglose de vuelto en billetes argentinos en circulación.
 * Sirve para sugerirle al operador con qué darlo.
 */
export const BILLETES_ARS = [2000000, 1000000, 500000, 200000, 100000, 50000, 20000, 10000] as const;

export function desglosarVuelto(centavos: number): Array<{ billete: number; cantidad: number }> {
  let resto = Math.max(0, centavos);
  const salida: Array<{ billete: number; cantidad: number }> = [];
  for (const billete of BILLETES_ARS) {
    const cantidad = Math.floor(resto / billete);
    if (cantidad > 0) {
      salida.push({ billete, cantidad });
      resto -= billete * cantidad;
    }
  }
  return salida;
}
