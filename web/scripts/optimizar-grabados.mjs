// Pasa los grabados de public/grabados a WebP de 1600 px como máximo: para una trama de puntos
// sobra, y la página baja de ~16 MB a ~3. Los originales se vuelven a bajar desde FUENTES.md.
// uso: node scripts/optimizar-grabados.mjs
import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const carpeta = new URL("../public/grabados/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
let antes = 0;
let despues = 0;
for (const nombre of await readdir(carpeta)) {
  if (!/\.(jpe?g|png)$/i.test(nombre)) continue;
  const origen = join(carpeta, nombre);
  const destino = join(carpeta, nombre.replace(/\.(jpe?g|png)$/i, ".webp"));
  antes += (await stat(origen)).size;
  await sharp(origen).resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toFile(destino);
  despues += (await stat(destino)).size;
  await rm(origen);
  console.log(nombre, "→", destino.split(/[\\/]/).pop());
}
console.log(`${(antes / 1e6).toFixed(1)} MB → ${(despues / 1e6).toFixed(1)} MB`);
