// Primero: saca ELECTRON_RUN_AS_NODE del entorno antes de que nadie lance nada (ver electron.ts).
import "./nucleo/electron.js";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { deBugAArreglo, textoDelBug } from "./bug.js";
import { soltarEnlacesAlCortar } from "./nucleo/entorno.js";
import { revisarRepo } from "./nucleo/repo.js";
import { motorDe } from "./nucleo/router.js";

/**
 * dolphin bug --que "lo que viste" [--elemento "lo que señalaste con X-ray"] [--agente claude]
 *
 * Primero una prueba que reproduce el bug (y tiene que fallar), después el arreglo encima, hasta que
 * esa prueba pase. Lo usa X-ray: señalás lo que está mal y le pasás el elemento con --elemento.
 */

const { values } = parseArgs({
  options: {
    repo: { type: "string", default: process.cwd() },
    que: { type: "string", default: "" },
    elemento: { type: "string", default: "" },
    agente: { type: "string", default: "claude" },
    verificar: { type: "string", default: "" },
  },
});

const descripcion = (values.que ?? "").trim();
if (!descripcion) {
  console.error(`
  dolphin bug · del bug que viste al arreglo, con la prueba primero

  dolphin bug --que "el cupón del 10 % no descuenta nada"
  dolphin bug --que "este botón no hace nada" --elemento "Botón «Aplicar cupón» en Tienda — Chrome"
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
const verificar = (values.verificar ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const r = await deBugAArreglo(
  { repo, descripcion, ...(values.elemento ? { elemento: values.elemento } : {}), agente: motorDe(values.agente, "claude"), ...(verificar.length ? { verificar } : {}) },
  { contar: (t) => console.log(`  ${t}`) },
);
console.log(`\n  ${textoDelBug(r)}\n`);
process.exit(r.etapa === "arreglado" ? 0 : 1);
