// Primero: saca ELECTRON_RUN_AS_NODE del entorno antes de que nadie lance nada (ver electron.ts).
import "./nucleo/electron.js";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { doctor, textoDelDoctor } from "./doctor.js";
import { estadoDeLaCola, lineaDeLaCola, lugaresDeVerificacion } from "./nucleo/cola-de-verificacion.js";
import { leerConfig } from "./nucleo/config.js";
import { revisarRepo } from "./nucleo/repo.js";

/**
 * dolphin doctor [--repo <ruta>] [--solo-mirar]
 *
 * Busca lo que quedó roto cuando algo se cortó a mitad de camino (worktrees abandonados, agentes que
 * siguen corriendo para nadie, enlaces rotos, asuntos colgados), lo arregla y dice qué hizo. Con
 * --solo-mirar dice qué arreglaría sin tocar nada.
 */

const { values } = parseArgs({
  options: {
    repo: { type: "string", default: process.cwd() },
    "solo-mirar": { type: "boolean", default: false },
  },
});
const repo = resolve(values.repo ?? process.cwd());
const revision = await revisarRepo(repo);
if (!revision.sirve) {
  console.error(`\n  ${revision.porQue}\n`);
  process.exit(1);
}
const hallazgos = await doctor(repo, { arreglar: !values["solo-mirar"] });
console.log(`\n${textoDelDoctor(hallazgos).split("\n").map((l) => `  ${l}`).join("\n")}\n`);

// La cola de verificación no es algo roto sino algo en curso, así que no es un hallazgo: una línea
// aparte, y solo si hay algo tomado o esperando. Es lo único que dice que un `tsc` lento está en fila.
const cola = lineaDeLaCola(
  await estadoDeLaCola({ lugares: lugaresDeVerificacion({ config: (await leerConfig(repo)).porton?.verificacionesALaVez }) }).catch(() => ({ lugares: 1, ocupados: [], esperando: 0 })),
);
if (cola) console.log(`  ${cola}\n`);
