// Primero: saca ELECTRON_RUN_AS_NODE del entorno antes de que nadie lance nada (ver electron.ts).
import "./nucleo/electron.js";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { preguntar } from "./preguntar.js";
import { sesionesDelRepo } from "./seguir.js";

/**
 * dolphin preguntar "¿por qué dejaste el pago único?" [--repo X] [--sesion ID]
 *
 * Le pregunta a tu última charla de Claude Code en ese repo (o a la que digas; mirá cuáles hay con
 * «dolphin seguir --lista»). Contesta en una copia y en solo lectura. Gasta un turno de tu cupo.
 */

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { repo: { type: "string", default: process.cwd() }, sesion: { type: "string" } },
});

const repo = resolve(values.repo ?? process.cwd());
const pregunta = positionals.join(" ").trim();
if (!pregunta) {
  console.error('\n  Falta la pregunta: dolphin preguntar "¿qué quedó a medias?"\n');
  process.exit(1);
}
const sesiones = await sesionesDelRepo(repo);
const sesion = values.sesion ? sesiones.find((s) => s.id === values.sesion || s.id.startsWith(values.sesion!)) : sesiones[0];
if (!sesion) {
  console.error(`\n  No encontré esa sesión de Claude Code en ${repo}. Mirá las que hay con «dolphin seguir --lista».\n`);
  process.exit(1);
}
console.log(`\n  le pregunto a la sesión ${sesion.id.slice(0, 8)} («${sesion.ultimoPedido.slice(0, 60)}»)…\n`);
try {
  const r = await preguntar(repo, sesion.id, pregunta);
  console.log(`${r.texto}\n`);
} catch (error) {
  console.error(`  ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
