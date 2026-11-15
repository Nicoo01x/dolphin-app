// Primero: saca ELECTRON_RUN_AS_NODE del entorno antes de que nadie lance nada.
import "./nucleo/electron.js";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { leerPolitica } from "./nucleo/politica.js";
import { vigilarPr } from "./nucleo/pr.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    repo: { type: "string", default: process.cwd() },
    pr: { type: "string" },
    vueltas: { type: "string", default: "3" },
  },
});

if (positionals[0] !== "vigilar") {
  console.error("\n  Usá: dolphin pr vigilar [--repo X] [--pr N] [--vueltas 3]\n");
  process.exit(1);
}

const repo = resolve(values.repo ?? process.cwd());
const r = await vigilarPr({
  repo,
  ...(values.pr ? { pr: Number.parseInt(values.pr, 10) } : {}),
  vueltas: Math.max(1, Math.min(10, Number.parseInt(values.vueltas ?? "3", 10) || 3)),
  prohibidos: (await leerPolitica(repo)).comandosProhibidos,
});
console.log(`\n  PR${r.numero ? ` #${r.numero}` : ""}: ${r.porQue} (${r.vueltas} vuelta(s)).\n`);
process.exit(r.ok ? 0 : 1);
