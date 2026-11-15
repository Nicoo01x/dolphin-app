// Primero: saca ELECTRON_RUN_AS_NODE del entorno antes de que nadie lance nada (ver electron.ts).
import "./nucleo/electron.js";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { exportarBitacora, importarBitacora } from "./bitacora-compartida.js";

/**
 * dolphin bitacora exportar [--salida dolphin-bitacora.json]
 * dolphin bitacora importar <archivo o URL>
 *
 * Exportar deja las lecciones del proyecto sin nada del proyecto (ni rutas, ni nombres, ni claves),
 * etiquetadas por framework, para compartirlas. Importar las trae como candidatas de afuera: no se
 * usan hasta que les des el visto bueno en la Memoria de la consola.
 */

const [accion] = process.argv.slice(2);
process.argv.splice(2, 1);
const { values, positionals } = parseArgs({
  options: {
    repo: { type: "string", default: process.cwd() },
    salida: { type: "string", default: "dolphin-bitacora.json" },
  },
  allowPositionals: true,
});
const repo = resolve(values.repo ?? process.cwd());

if (accion === "exportar") {
  const paquete = await exportarBitacora(repo);
  const salida = resolve(values.salida ?? "dolphin-bitacora.json");
  await writeFile(salida, `${JSON.stringify(paquete, null, 2)}\n`, "utf8");
  console.log(`\n  ${paquete.lecciones.length} lección(es) de ${paquete.marcos.join(", ") || "este repo"}, sin nada del proyecto, en ${salida}.`);
  console.log("  Leelo antes de compartirlo: es lo que va a ver otra persona.\n");
} else if (accion === "importar" && positionals[0]) {
  const fuente = positionals[0];
  const texto = /^https?:\/\//i.test(fuente) ? await (await fetch(fuente, { signal: AbortSignal.timeout(15_000) })).text() : await readFile(resolve(fuente), "utf8");
  const r = await importarBitacora(repo, JSON.parse(texto));
  console.log(`\n  ${r.sumadas} lección(es) nueva(s) esperan tu visto bueno en la Memoria${r.yaEstaban ? `; ${r.yaEstaban} ya las tenías` : ""}.`);
  for (const d of r.descartadas) console.log(`  no entró ${d}`);
  console.log("");
} else {
  console.error(`
  dolphin bitacora · lo que aprendió tu agente, para que lo sepan los de todos

  dolphin bitacora exportar --salida dolphin-bitacora.json
  dolphin bitacora importar https://ejemplo.com/bitacora-next16.json
`);
  process.exit(1);
}
