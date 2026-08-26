/**
 * Trae fotos reales de producto para el kiosco demo.
 *
 * Fuente: Open Food Facts. Es una base colaborativa y abierta de productos
 * reales — incluye el catálogo argentino — y sus fotos son CC-BY-SA, o sea que
 * se pueden usar citando la fuente. No se scrapean sitios de marca: eso sería
 * usar material con derechos ajenos.
 *
 * Las imágenes se BAJAN al repo (`public/prod/fotos/`) en vez de enlazarse: la
 * app es offline-first y una foto que necesita internet para verse no sirve en
 * un mostrador sin señal. Además el service worker las precachea.
 *
 * En producción esto no corre: el dueño le saca la foto a cada producto con el
 * celular y va a Supabase Storage. Esto es solo para que la demo se vea como se
 * va a ver de verdad.
 *
 *   node scripts/fotos-demo.mjs
 */

import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { Client } = require("pg");

const DESTINO = path.join(process.cwd(), "public", "prod", "fotos");

/**
 * OJO con el endpoint. `/api/v2/search` IGNORA `search_terms` en silencio y
 * devuelve siempre el mismo primer producto — la primera versión de este script
 * bajó nueve veces la foto del mismo bizcocho salado, y las nueve líneas
 * dijeron "ok". El buscador de verdad vive en otro host.
 */
const BUSCADOR = "https://search.openfoodfacts.org/search";
const PRODUCTO = "https://world.openfoodfacts.org/api/v2/product";
const UA = { "User-Agent": "KioskoApp/0.1 (seed de demo)" };

/**
 * Por producto: qué buscar, y sobre todo cómo saber que lo que volvió es lo que
 * se pidió.
 *
 * `requiere` no es opcional. Buscar "alfajor jorgito" devuelve galletitas
 * Jorgito, y "yerba playadito" devuelve una lata de bebida energizante con
 * yerba: la marca coincide, el producto no. Sin validar el resultado la demo
 * termina con fotos que no corresponden, que es peor que no tener foto.
 *
 * Los que faltan son deliberados: el tabaco no es alimento y no está en Open
 * Food Facts, y "Carga de SUBE" es un servicio. Esos se quedan con la
 * ilustración, que para el caso comunica mejor que cualquier foto.
 */
const BUSQUEDAS = {
  "Agua mineral 500 ml": {
    terminos: ["agua mineral villavicencio", "agua mineral natural", "agua sin gas"],
    requiere: /agua/,
    excluye: /saborizada|gasificada|tonica/,
  },
  "Alfajor Jorgito": {
    terminos: ["alfajor jorgito", "alfajor dulce de leche", "alfajor chocolate"],
    requiere: /alfajor/,
  },
  "Bon o Bon": {
    terminos: ["bon o bon arcor", "bonobon", "bombon relleno mani"],
    requiere: /bon.?o.?bon|bonobon/,
  },
  "Cerveza Quilmes 1 L": {
    terminos: ["cerveza quilmes", "quilmes clasica", "cerveza rubia lager"],
    requiere: /cerveza|quilmes|lager/,
    excluye: /sin alcohol/,
  },
  "Chicle Beldent": {
    terminos: ["beldent chicle", "chicle sin azucar menta", "goma de mascar"],
    requiere: /beldent|chicle|goma de mascar/,
  },
  // Ningun resultado de busqueda daba una botella grande de Coca argentina:
  // sale siempre una lata, y una lata y una botella de litro y medio son dos
  // productos distintos en el mostrador. Se fija el codigo de barras.
  "Coca-Cola 1,5 L": { codigo: "7790895003035" },
  "Coca-Cola 500 ml": {
    terminos: ["coca cola 500 ml", "coca cola classic"],
    requiere: /coca.?cola/,
    excluye: /zero|light|sin azucar/,
  },
  "Jamón cocido": {
    terminos: ["jamon cocido", "jamon cocido feteado"],
    requiere: /jamon/,
    excluye: /crudo|serrano|pavo/,
  },
  "Queso cremoso": {
    terminos: ["queso cremoso", "queso port salut", "queso cuartirolo"],
    requiere: /queso/,
    excluye: /rallado|untable|crema de queso/,
  },
  "Salame milán": {
    terminos: ["salame milan", "salame italiano", "salamin"],
    requiere: /salam/,
  },
  "Yerba Playadito 1 kg": {
    terminos: ["yerba mate playadito", "yerba mate elaborada con palo", "yerba mate 1 kg"],
    requiere: /yerba/,
    // Sin esto entra una lata de bebida energizante "con yerba mate".
    excluye: /lata|energy|energizante|bebida|tea|drink|infusion/,
  },
};

function sinTildes(texto) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** `Coca-Cola 1,5 L` -> `coca-cola-1-5-l` */
function slug(nombre) {
  return sinTildes(nombre)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function json(url) {
  const r = await fetch(url, { headers: UA });
  return r.ok ? r.json() : null;
}

/**
 * Devuelve el primer producto que tiene foto Y pasa la validación.
 * Preferir no traer nada antes que traer la foto equivocada.
 */
async function buscarFoto(nombre, { codigo, terminos, requiere, excluye }, yaUsados) {
  // Codigo fijo: cuando la busqueda por texto no discrimina, se apunta al
  // producto exacto y listo.
  if (codigo) {
    const d = await json(
      `${PRODUCTO}/${codigo}.json?fields=code,product_name,brands,image_front_url`,
    );
    if (d?.product?.image_front_url) return d.product;
    console.log(`   ?  ${nombre} — el codigo ${codigo} no tiene foto`);
    return null;
  }

  for (const termino of terminos) {
    const busqueda = await json(`${BUSCADOR}?q=${encodeURIComponent(termino)}&page_size=20`);
    if (!busqueda) continue;

    for (const hit of busqueda.hits ?? []) {
      if (!hit.code || yaUsados.has(hit.code)) continue;

      const d = await json(
        `${PRODUCTO}/${hit.code}.json?fields=code,product_name,brands,image_front_url`,
      );
      const p = d?.product;
      if (!p?.image_front_url) continue;

      const texto = sinTildes(`${p.product_name ?? ""} ${p.brands ?? ""}`);
      if (!requiere.test(texto)) continue;
      if (excluye?.test(texto)) continue;

      return p;
    }
  }
  console.log(`   ?  ${nombre} — ningún resultado pasó la validación`);
  return null;
}

async function main() {
  await mkdir(DESTINO, { recursive: true });

  const c = new Client({
    host: `db.${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0]}.supabase.co`,
    port: 5432,
    user: "postgres",
    password: process.env.SUPABASE_DB_PASSWORD,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const { rows: productos } = await c.query("select id, nombre from productos order by nombre");
  const creditos = [];
  const yaUsados = new Set();
  let bajadas = 0;

  for (const p of productos) {
    const receta = BUSQUEDAS[p.nombre];
    if (!receta) {
      console.log(`   ·  ${p.nombre} — sin foto a propósito, queda la ilustración`);
      continue;
    }

    const hallazgo = await buscarFoto(p.nombre, receta, yaUsados);
    if (!hallazgo) continue;

    const img = await fetch(hallazgo.image_front_url, { headers: UA });
    if (!img.ok) {
      console.log(`   ?  ${p.nombre} — la foto no bajó (${img.status})`);
      continue;
    }

    yaUsados.add(hallazgo.code);
    const archivo = `${slug(p.nombre)}.jpg`;
    await writeFile(path.join(DESTINO, archivo), Buffer.from(await img.arrayBuffer()));
    await c.query("update productos set imagen_url = $1 where id = $2", [
      `/prod/fotos/${archivo}`,
      p.id,
    ]);

    creditos.push(
      `- **${p.nombre}** → ${hallazgo.product_name || "(sin nombre)"} · ${hallazgo.brands || "s/marca"} · [${hallazgo.code}](https://world.openfoodfacts.org/product/${hallazgo.code})`,
    );
    bajadas++;
    console.log(
      `   ok ${p.nombre.padEnd(22)} -> ${hallazgo.product_name || "?"} (${hallazgo.brands || "s/marca"})`,
    );
  }

  await writeFile(
    path.join(DESTINO, "CREDITOS.md"),
    "# Fotos de la demo\n\n" +
      "Vienen de [Open Food Facts](https://world.openfoodfacts.org), bajo licencia\n" +
      "[CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/deed.es). Se usan\n" +
      "solo para que el kiosco de demostración se vea como un kiosco real; en\n" +
      "producción cada dueño sube las fotos de sus propios productos.\n\n" +
      "Se regeneran con `node scripts/fotos-demo.mjs`.\n\n" +
      creditos.join("\n") +
      "\n",
    "utf8",
  );

  await c.end();
  console.log(`\n${bajadas} fotos en public/prod/fotos/`);
}

main().catch((e) => {
  console.error("Falló:", e.message);
  process.exit(1);
});
