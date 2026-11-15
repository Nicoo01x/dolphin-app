import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { comoSeLee, guardarEstado, listarGuardados, porQueNoSePuedeVolver, volverA } from "./nucleo/volver.js";

/**
 * dolphin volver                 los momentos en que el proyecto andaba
 * dolphin volver <id>            volver a uno (guardando antes lo que hay)
 * dolphin volver --guardar "…"   guardar este momento a mano
 *
 * «Lo toqué y se rompió todo» sin saber git (ver nucleo/volver.ts).
 */

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    repo: { type: "string", default: process.cwd() },
    guardar: { type: "string" },
    json: { type: "boolean", default: false },
    ayuda: { type: "boolean", short: "h", default: false },
  },
});

const repo = resolve(values.repo);
const corto = (id: string) => id.slice(0, 8);

function ayuda(): never {
  console.error(`
  dolphin volver · los momentos en que el proyecto andaba

  dolphin volver                    la lista (--json)
  dolphin volver <id>               volver a ese momento
  dolphin volver --guardar "por qué"  guardar este momento a mano

  Cada vez que el portón pasa entero se guarda uno solo. Volver guarda antes lo
  que haya, así que siempre se puede deshacer: nada se pierde.
`);
  process.exit(1);
}

try {
  if (values.ayuda) ayuda();

  if (values.guardar !== undefined) {
    const punto = await guardarEstado(repo, { porQue: values.guardar.trim() || "a mano" });
    if (!punto) {
      console.error("\n  No pude guardar: el repo todavía no tiene ningún commit.\n");
      process.exit(1);
    }
    console.log(values.json ? JSON.stringify(punto, null, 2) : `\n  Guardado: ${corto(punto.id)}  ${comoSeLee(punto)}\n`);
  } else if (positionals.length === 0) {
    const puntos = await listarGuardados(repo);
    if (values.json) {
      console.log(JSON.stringify(puntos, null, 2));
    } else if (puntos.length === 0) {
      console.log("\n  Todavía no hay ningún momento guardado. Se guarda uno solo cada vez que el portón pasa entero.\n");
    } else {
      const no = await porQueNoSePuedeVolver(repo);
      console.log("");
      for (const p of puntos) console.log(`  ${corto(p.id)}  ${comoSeLee(p)}`);
      console.log(no ? `\n  Ahora no se puede volver: ${no}.\n` : `\n  Para volver a uno: dolphin volver ${corto(puntos[0]!.id)}\n`);
    }
  } else {
    const r = await volverA(repo, positionals[0]!);
    if (values.json) {
      console.log(JSON.stringify(r, null, 2));
    } else {
      console.log(`\n  Volviste a: ${comoSeLee(r.volvioA)}`);
      console.log(
        r.loQueHabia
          ? `  Lo que había quedó guardado: para deshacer esto, dolphin volver ${corto(r.loQueHabia.id)}\n`
          : "  (no pude guardar lo que había)\n",
      );
    }
  }
} catch (error) {
  console.error(`\n  ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
