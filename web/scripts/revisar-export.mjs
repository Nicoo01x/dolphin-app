/**
 * Mira el export antes de publicarlo: que ninguna página se vaya con la dirección de probar en
 * casa adentro.
 *
 * Un `rel="canonical"` o un `og:url` que digan `localhost` no son un detalle estético: desindexan
 * el sitio y rompen la vista previa en WhatsApp, Telegram y X. Pasó —las 24 páginas salieron así—
 * y desde el navegador no se ve, porque la página se dibuja igual de bien.
 *
 * Sin `DOLPHIN_SITIO` esto avisa y deja pasar: es el build de probar en local, que ya sale sin
 * esas etiquetas. Con `DOLPHIN_SITIO` puesto, cualquier `localhost` en una etiqueta de dirección
 * corta el build.
 *
 *   node scripts/revisar-export.mjs
 */
import { readdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const RAIZ = new URL("../out/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

/** Todos los archivos del export, recursivo. */
function archivos(dir) {
  const salida = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) salida.push(...archivos(ruta));
    else salida.push(ruta);
  }
  return salida;
}

/*
 * Las notas de `public/` (LEEME.md, FUENTE.md: cómo se grabó cada video, de dónde sale cada
 * captura) son para el repo, no para el sitio. Next copia `public/` entero a `out/`, así que sin
 * esto quedaban servidas en odolphin.tech/videos/app-12-11/LEEME.md, con rutas de la máquina y el
 * usuario de GitHub adentro. Se sacan del export; en el repo siguen.
 */
const notas = archivos(RAIZ).filter((a) => a.toLowerCase().endsWith(".md"));
for (const nota of notas) unlinkSync(nota);
if (notas.length > 0) console.log(`  ${notas.length} notas del repo fuera del export (LEEME.md y FUENTE.md de public/).`);

/*
 * Nico (14/11/2026): que la web no nombre a la base de la que sale Dolphin. Se mira lo que lee
 * una persona o un buscador —el HTML y los .txt de las páginas— y no los .js, donde los nombres de
 * los paquetes no se ven. La palabra suelta, sin distinguir mayúsculas.
 */
const conLaBase = archivos(RAIZ)
  .filter((a) => /\.(html|txt|xml|json)$/i.test(a))
  .filter((a) => /\borca\b/i.test(readFileSync(a, "utf8")));
if (conLaBase.length > 0) {
  console.error(`\n  ${conLaBase.length} ${conLaBase.length === 1 ? "archivo nombra" : "archivos nombran"} a la base:\n`);
  for (const a of conLaBase.slice(0, 10)) console.error(`  ${a.slice(RAIZ.length)}`);
  console.error("\n  La web no lo nombra (ver Preguntas.tsx y docs). Sacalo del texto y volvé a construir.\n");
  process.exit(1);
}

function paginas(dir) {
  const salida = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) salida.push(...paginas(ruta));
    else if (nombre.endsWith(".html")) salida.push(ruta);
  }
  return salida;
}

/** Las etiquetas que llevan la dirección del sitio. Un `localhost` en un ejemplo de comando no cuenta. */
const DE_DIRECCION = [
  /<link[^>]+rel="canonical"[^>]*>/gi,
  /<meta[^>]+property="og:url"[^>]*>/gi,
  /<meta[^>]+name="twitter:url"[^>]*>/gi,
];

const publicado = Boolean(process.env.DOLPHIN_SITIO);
const malas = [];
let conCanonical = 0;

for (const archivo of paginas(RAIZ)) {
  const html = readFileSync(archivo, "utf8");
  for (const patron of DE_DIRECCION) {
    for (const etiqueta of html.match(patron) ?? []) {
      conCanonical += 1;
      if (/localhost|127\.0\.0\.1/.test(etiqueta)) malas.push(`${archivo.slice(RAIZ.length)} · ${etiqueta.trim()}`);
    }
  }
}

if (malas.length > 0) {
  console.error(`\n  ${malas.length} ${malas.length === 1 ? "etiqueta se va" : "etiquetas se van"} con la dirección de local adentro:\n`);
  for (const m of malas.slice(0, 10)) console.error(`  ${m}`);
  console.error("\n  Construí con la dirección de verdad: DOLPHIN_SITIO=https://… npx next build\n");
  process.exit(1);
}

if (!publicado) {
  console.log("  Export de prueba: sin DOLPHIN_SITIO, las páginas salen sin canonical ni og:url (y así tiene que ser).");
  if (conCanonical > 0) {
    console.error(`\n  Pero ${conCanonical} salieron igual: alguna página arma la etiqueta sin mirar SITIO_PUBLICADO.\n`);
    process.exit(1);
  }
} else {
  console.log(`  ${conCanonical} etiquetas de dirección, todas con ${process.env.DOLPHIN_SITIO}.`);
}
