import { parseArgs } from "node:util";
import { sonar } from "./nucleo/sueno.js";

/**
 * npm run sonar -- --repo <ruta>
 *
 * Hace soñar a la memoria ahora, sin esperar a la próxima siembra: olvida
 * lo que no se volvió a ver en 30 días, pasa a la memoria lo que se repitió
 * en tareas distintas y deja esperando lo que vino de afuera (ver sueno.ts).
 * Lo que pasó queda contado en .dolphin/DREAMS.md.
 */

const { values } = parseArgs({ options: { repo: { type: "string", default: process.cwd() } } });
const repo = values.repo ?? process.cwd();

const s = await sonar(repo);
console.log(`\n  dolphin · la memoria soñó en ${repo}\n`);
if (s.promovidas.length === 0 && s.esperando.length === 0 && s.olvidadas === 0) {
  console.log("  Nada nuevo: lo que está en observación todavía no se ganó el lugar.\n");
}
for (const { nota, puntaje } of s.promovidas) {
  console.log(`  entró   ${nota.texto}  (puntaje ${puntaje.total.toFixed(2).replace(".", ",")}, ${puntaje.tareas} tareas)`);
}
for (const { nota } of s.esperando) console.log(`  espera  ${nota.texto}  (vino de afuera: aprobala en la vista Memoria)`);
if (s.olvidadas > 0) console.log(`  olvidó  ${s.olvidadas} nota(s) que no se volvieron a ver en 30 días`);
if (s.promovidas.length + s.esperando.length + s.olvidadas > 0) console.log("\n  El porqué de cada una, en .dolphin/DREAMS.md\n");
