/**
 * De un nombre de producto a su ilustración.
 *
 * Por qué no fotos: la foto es fricción. Pedirle al dueño que fotografíe 260
 * productos es lo que hace que abandone la carga del catálogo (regla del
 * proyecto). Pero sin NADA visual, una grilla de 22 rectángulos de texto es
 * ilegible de un vistazo, que es justo lo que el POS necesita.
 *
 * La solución es un dibujo por arquetipo, no por producto. "Coca-Cola 1,5 L" y
 * "Sprite 1,5 L" comparten la silueta de botella; lo que las distingue es el
 * color de categoría y el nombre. Eso alcanza para reconocer sin leer, que es
 * todo lo que se le pide a la grilla.
 *
 * Los dibujos viven en `public/prod/productos.svg` como un sprite: una sola
 * petición, cacheada por el service worker, sin peso en el bundle.
 */

/** Reglas en orden. Gana la primera que coincide, así que van de específica a general. */
const REGLAS: Array<[RegExp, string]> = [
  // --- Servicios (antes que todo: "carga de SUBE" no es una bebida) ---
  [/\b(sube|monedero|transporte|colectivo)\b/, "p-transporte"],
  [/\b(carga|recarga|credito|crédito|saldo|virtual)\b/, "p-recarga"],

  // --- Cigarrillos ---
  [/\b(encendedor|yesquero|fosforo|fósforo|magiclick)\b/, "p-encendedor"],
  [/\b(marlboro|philip|chesterfield|lucky|camel|parliament|rothmans|viceroy|cigarrillo|box \d+|tabaco|armado)\b/, "p-cigarrillos"],

  // --- Alcoholes ---
  [/\b(fernet|aperitivo|gancia|campari|vermouth|licor|whisky|vodka|gin|ron|aperol)\b/, "p-fernet"],
  [/\b(vino|malbec|tinto|blanco reserva|espumante|champ)/, "p-vino"],
  [/\b(cerveza|quilmes|brahma|stella|heineken|corona|patagonia|andes|imperial|schneider|porron|porrón|birra)\b/, "p-cerveza"],

  // --- Bebidas ---
  [/\b(speed|red bull|monster|energizante|energ)/, "p-energizante"],
  // El lookbehind no es opcional: sin él "5 l" matchea adentro de
  // "Coca-Cola 1,5 L" y la gaseosa más vendida del país se dibuja como un
  // bidón de agua.
  [/\b(bidon|bidón|dispenser)\b|(?<![\d,.])\b(5|6|8) ?l\b/, "p-bidon"],
  [/\b(jugo|cepita|baggio|ades|citric|nectar|néctar|tang|clight)\b/, "p-jugo"],
  [/\b(agua|villavicencio|villa del sur|eco de los andes|glaciar|soda|tonica|tónica)\b/, "p-agua"],
  [/\b(lata|473|354|310)\b/, "p-lata"],
  [/\b(coca|pepsi|sprite|fanta|manaos|7up|seven up|paso de los toros|mirinda|schweppes|gaseosa|pomelo|naranja \d)/, "p-gaseosa"],

  // --- Golosinas ---
  [/\b(alfajor|jorgito|guaymallen|guaymallén|terrabusi|havanna|milka alfajor|capitan del espacio)\b/, "p-alfajor"],
  [/\b(chupetin|chupetín|pico dulce|lollipop|mr pops)\b/, "p-chupetin"],
  [/\b(chicle|beldent|topline|bazooka|bubbaloo|tutti frutti)\b/, "p-chicle"],
  [/\b(turron|turrón|mantecol|nougat)\b/, "p-turron"],
  [/\b(caramelo|media hora|sugus|butter toffee|flynn|halls|menthoplus|pastilla|gomita|mogul)\b/, "p-caramelo"],
  [/\b(chocolate|milka|cofler|block|shot|rhodesia|kinder|bon o bon|aguila|águila|tita|rocklets|m&m|nucrem|marroc)\b/, "p-chocolate"],

  // --- Galletitas ---
  [/\b(oblea|bañada|bañadas|opera|ópera|tofi|pepitos oblea)\b/, "p-oblea"],
  [/\b(galletita|oreo|pepitos|criollita|traviata|express|hogare|melba|surtido|chocolinas|maria|lincoln|merengada|vainilla|obleas|toddy|rumba|mana|maná)\b/, "p-galletitas"],

  // --- Snacks ---
  [/\b(mani|maní|nuez|almendra|pasas|mix|frutos secos|garrapinada)\b/, "p-mani"],
  [/\b(papas|lays|pringles|palito|conito|3d|doritos|chizito|snack|copeton|copetón|nachos|tostitos)\b/, "p-papas"],

  // --- Panadería ---
  [/\b(lactal|pan de molde|bimbo|hamburguesa|pancho|figaza)\b/, "p-panlactal"],
  [/\b(factura|medialuna|churro|budin|budín|bizcochuelo|magdalena|tortita)\b/, "p-factura"],
  [/\b(pan|baguette|felipe|mignon|criollo|galleta de campo)\b/, "p-pan"],

  // --- Fiambrería ---
  [/\b(salchicha|chorizo|morcilla|salchichon|salchichón|viena)\b/, "p-salchicha"],
  [/\b(queso|cremoso|port salut|muzzarella|mozzarella|sardo|rallado|tybo)\b/, "p-queso"],
  [/\b(jamon|jamón|paleta|salame|salamin|salamín|mortadela|bondiola|panceta|fiambre|lomito)\b/, "p-jamon"],

  // --- Lácteos ---
  [/\b(dulce de leche|ddl|vacalin|vacalín|sancor dulce)\b/, "p-dulcedeleche"],
  [/\b(huevo|maple)\b/, "p-huevos"],
  [/\b(manteca|margarina|dorita)\b/, "p-manteca"],
  [/\b(yogur|yoghurt|yogurt|ser |actimel|danonino|postre|flan)\b/, "p-yogur"],
  [/\b(leche|crema|chocolatada|cindor|nesquik|la serenisima|serenísima)\b/, "p-leche"],

  // --- Helados ---
  [/\b(pote|1 kg helado|helado kg)\b/, "p-potehelado"],
  [/\b(helado|palito|bombon helado|frigor|torpedo|aquarius)\b/, "p-helado"],

  // --- Almacén ---
  [/\b(yerba|playadito|rosamonte|taragui|taragüi|cbse|union|unión|mate cocido)\b/, "p-yerba"],
  [/\b(cafe|café|nescafe|nescafé|la virginia|dolca|torrado)\b/, "p-cafe"],
  [/\b(te |té |saquito|manzanilla|boldo|tisana|green hills)\b/, "p-te"],
  [/\b(azucar|azúcar|ledesma|endulzante|edulcorante|hileret)\b/, "p-azucar"],
  [/\b(fideo|tallarin|tallarín|mostachol|spaghetti|espagueti|tirabuzon|tirabuzón|codito|pasta|matarazzo|luchetti|don vicente)\b/, "p-fideos"],
  [/\b(arroz|gallo|lenteja|poroto|garbanzo|polenta|harina|leudante|semola|sémola)\b/, "p-arroz"],
  [/\b(aceite|natura|cocinero|vinagre|oliva)\b/, "p-aceite"],
  [/\b(mermelada|miel|arrope|jalea)\b/, "p-mermelada"],
  [/\b(lata|atun|atún|arveja|choclo|tomate|pure|puré|salsa|conserva|caballa|sardina)\b/, "p-conserva"],

  // --- Limpieza ---
  [/\b(papel higienico|papel higiénico|higienico|higiénico|rollo de cocina|servilleta|pañuelo|panuelo)\b/, "p-papelhigienico"],
  [/\b(esponja|virulana|trapo|rejilla|escoba|secador|guante)\b/, "p-esponja"],
  [/\b(jabon en polvo|jabón en polvo|ala |skip|drive|suavizante|vivere|comfort)\b/, "p-jabonpolvo"],
  [/\b(detergente|magistral|cif|mr musculo|músculo|limpiador|desengrasante|lustramuebles|blem)\b/, "p-detergente"],
  [/\b(lavandina|ayudin|ayudín|desinfectante|procenex|cloro)\b/, "p-lavandina"],

  // --- Perfumería ---
  [/\b(pañal|panal|pampers|huggies|babysec|toallita femenina|always|protector diario)\b/, "p-panales"],
  [/\b(preservativo|prime|tulipan|tulipán|condon|condón)\b/, "p-preservativo"],
  [/\b(desodorante|antitranspirante|rexona|axe|nivea|dove aerosol)\b/, "p-desodorante"],
  [/\b(pasta dental|dentifrico|dentífrico|colgate|kolynos|odol|cepillo dental|enjuague)\b/, "p-pastadental"],
  [/\b(shampoo|acondicionador|sedal|pantene|plusbelle|crema de enjuague|gel)\b/, "p-shampoo"],
  [/\b(jabon|jabón|lux|rexona jabon|espuma|afeitar|gillette)\b/, "p-jabon"],

  // --- Librería ---
  [/\b(pegamento|plasticola|voligoma|cinta|adhesiv|poxi)\b/, "p-pegamento"],
  [/\b(tijera|sacapunta|regla|compas|compás|broche|abrochadora)\b/, "p-tijera"],
  [/\b(lapicera|birome|bic|lapiz|lápiz|marcador|resaltador|corrector)\b/, "p-lapicera"],
  [/\b(cuaderno|repuesto|carpeta|hoja|resma|block|anotador|agenda|sobre)\b/, "p-cuaderno"],
];

/** Cuando ninguna regla acierta, el dibujo lo pone la categoría. */
const POR_CATEGORIA: Record<string, string> = {
  bebidas: "p-gaseosa",
  gaseosas: "p-gaseosa",
  aguas: "p-agua",
  cervezas: "p-cerveza",
  alcoholes: "p-cerveza",
  cigarrillos: "p-cigarrillos",
  golosinas: "p-caramelo",
  chocolates: "p-chocolate",
  alfajores: "p-alfajor",
  galletitas: "p-galletitas",
  snacks: "p-papas",
  copeton: "p-papas",
  panaderia: "p-pan",
  fiambreria: "p-jamon",
  lacteos: "p-leche",
  helados: "p-helado",
  almacen: "p-arroz",
  limpieza: "p-detergente",
  perfumeria: "p-shampoo",
  libreria: "p-cuaderno",
  servicios: "p-recarga",
};

/** Sin tildes, en minúscula. Los nombres del catálogo vienen de todas formas. */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Devuelve el id del símbolo para un producto.
 * `tipoVenta` gana sobre todo lo demás en PESO: la balanza es lo que define el
 * gesto, y verla dibujada le avisa al operador antes de tocar.
 */
export function ilustracionDe(
  nombre: string,
  categoria?: string | null,
  tipoVenta?: string | null,
): string {
  const n = normalizar(nombre);

  for (const [patron, simbolo] of REGLAS) {
    if (patron.test(n)) return simbolo;
  }

  if (categoria) {
    const c = normalizar(categoria).replace(/\s+/g, "");
    for (const [clave, simbolo] of Object.entries(POR_CATEGORIA)) {
      if (c.includes(clave)) return simbolo;
    }
  }

  if (tipoVenta === "PESO") return "p-balanza";

  return "p-generico";
}

export const SPRITE = "/prod/productos.svg";
