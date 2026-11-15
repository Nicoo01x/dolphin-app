// Primero: saca ELECTRON_RUN_AS_NODE del entorno antes de que nadie lance nada (ver electron.ts).
import "./nucleo/electron.js";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { comparar, MOTORES_POR_DEFECTO, textoDeComparacion } from "./comparar.js";
import { soltarEnlacesAlCortar } from "./nucleo/entorno.js";
import { revisarRepo } from "./nucleo/repo.js";
import { motorDe, type Motor } from "./nucleo/router.js";

/**
 * dolphin comparar --tarea "…" [--motores claude,codex,antigravity] [--verificar typecheck,test]
 *
 * La misma tarea a varios motores a la vez, cada uno en su rama y con el portón; al final, una página
 * con las apps lado a lado para elegir mirando. Elegís con /elegir n en la terminal o en Telegram.
 */

const { values } = parseArgs({
  options: {
    repo: { type: "string", default: process.cwd() },
    tarea: { type: "string", default: "" },
    motores: { type: "string", default: "" },
    verificar: { type: "string", default: "" },
    demo: { type: "boolean", default: false },
  },
});

const tarea = (values.tarea ?? "").trim();
if (!tarea) {
  console.error(`
  dolphin comparar · la misma tarea a varios motores, y elegís mirando

  dolphin comparar --tarea "un buscador en la lista de pedidos" --motores claude,codex,antigravity
`);
  process.exit(1);
}
const repo = resolve(values.repo ?? process.cwd());
const revision = await revisarRepo(repo);
if (!revision.sirve) {
  console.error(`\n  ${revision.porQue}\n`);
  process.exit(1);
}
soltarEnlacesAlCortar();

const motores: Motor[] = values.demo
  ? ["mentira", "mentira", "mentira"]
  : values.motores
    ? values.motores.split(",").map((m) => motorDe(m.trim(), "claude"))
    : [...MOTORES_POR_DEFECTO];
const verificar = (values.verificar ?? "").split(",").map((s) => s.trim()).filter(Boolean);
console.log(`\n  dolphin comparar · «${tarea}» a ${motores.join(", ")} a la vez\n`);
const c = await comparar({ repo, tarea, motores, ...(verificar.length ? { verificar } : {}) });
console.log(textoDeComparacion(c).split("\n").map((l) => `  ${l}`).join("\n"));
console.log(`\n  La página: ${resolve(repo, ".dolphin", "comparar", `${c.id}.html`)}\n`);
