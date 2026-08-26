/**
 * Genera los íconos de la PWA a partir de un SVG.
 *   node scripts/generar-iconos.mjs
 * Usa sharp, que ya viene con Next.
 */
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";

const FONDO = "#0f1115";
const AZUL = "#2563eb";
const CLARO = "#f2f4f8";

/** El toldo del kiosco, que es lo que se reconoce de lejos en la pantalla de inicio. */
function svg({ padding }) {
  const c = 512;
  const m = padding; // margen para la zona segura del maskable
  const ancho = c - m * 2;
  const x = m;
  const toldoY = m + ancho * 0.18;
  const toldoAlto = ancho * 0.22;
  const franja = ancho / 6;

  const franjas = Array.from({ length: 6 }, (_, i) =>
    i % 2 === 0
      ? `<rect x="${x + i * franja}" y="${toldoY}" width="${franja}" height="${toldoAlto}" fill="${AZUL}"/>`
      : `<rect x="${x + i * franja}" y="${toldoY}" width="${franja}" height="${toldoAlto}" fill="${CLARO}"/>`,
  ).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${c}" height="${c}" viewBox="0 0 ${c} ${c}">
  <rect width="${c}" height="${c}" fill="${FONDO}"/>
  <g>
    ${franjas}
    <rect x="${x}" y="${toldoY + toldoAlto}" width="${ancho}" height="${ancho * 0.52}" fill="#171a21" stroke="${AZUL}" stroke-width="10" rx="12"/>
    <text x="${c / 2}" y="${toldoY + toldoAlto + ancho * 0.38}"
          font-family="Inter, Arial, sans-serif" font-size="${ancho * 0.42}" font-weight="700"
          fill="${CLARO}" text-anchor="middle">K</text>
  </g>
</svg>`;
}

await mkdir("public/icons", { recursive: true });

const trabajos = [
  { archivo: "icono-192.png", tamano: 192, padding: 32 },
  { archivo: "icono-512.png", tamano: 512, padding: 32 },
  { archivo: "maskable-192.png", tamano: 192, padding: 96 },
  { archivo: "maskable-512.png", tamano: 512, padding: 96 },
  { archivo: "apple-touch-icon.png", tamano: 180, padding: 32 },
];

for (const { archivo, tamano, padding } of trabajos) {
  const buffer = Buffer.from(svg({ padding }));
  await sharp(buffer).resize(tamano, tamano).png().toFile(`public/icons/${archivo}`);
  console.log(`✓ public/icons/${archivo}`);
}

await writeFile("public/icons/icono.svg", svg({ padding: 32 }), "utf8");
console.log("✓ public/icons/icono.svg");
