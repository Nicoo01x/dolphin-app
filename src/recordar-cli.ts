import { parseArgs } from "node:util";
import { leerMemoria, olvidarRecuerdo, prenderRecuerdo, recordar } from "./nucleo/memoria.js";
import { leerPerfil, sumarAlPerfil } from "./nucleo/perfil.js";

/**
 * npm run recordar -- "los importes van con coma decimal" [--patron "toLocaleString\\('en"]
 * npm run recordar -- --listar | --apagar <id> | --prender <id> | --olvidar <id>
 * npm run recordar -- --perfil "hay monotributistas Y responsables inscriptos"
 *
 * Cada corrección que escribís queda en la memoria del repo: con
 * --patron se vuelve un verificador del portón (una línea nueva que lo
 * matchee corta el intento, gratis); sin patrón, viaja en el prompt de
 * cada siembra para que el agente la tenga en cuenta antes de escribir.
 * Con --perfil va al perfil del proyecto (.dolphin/PERFIL.md), que viaja
 * ENTERO en todos los prompts, siempre, sea cual sea el modelo.
 */

const { values, positionals } = parseArgs({
  options: {
    repo: { type: "string", default: process.cwd() },
    patron: { type: "string" },
    listar: { type: "boolean", default: false },
    apagar: { type: "string" },
    prender: { type: "string" },
    olvidar: { type: "string" },
    perfil: { type: "boolean", default: false },
  },
  allowPositionals: true,
});

const repo = values.repo ?? process.cwd();

if (values.perfil) {
  const linea = positionals.join(" ").trim();
  if (linea === "") {
    // Sin texto, --perfil muestra lo que el proyecto ya sabe de sí mismo.
    const perfil = await leerPerfil(repo);
    console.log(perfil === "" ? "\n  El perfil está vacío: el proyecto todavía no sabe nada de sí mismo.\n" : `\n${perfil}\n`);
    process.exit(0);
  }
  await sumarAlPerfil(repo, linea);
  console.log(`\n  Al perfil: «${linea}»\n  Desde ahora viaja entero en TODOS los prompts, con cualquier modelo.\n`);
  process.exit(0);
}

if (values.listar) {
  const memoria = await leerMemoria(repo);
  if (memoria.recuerdos.length === 0) {
    console.log("\n  La memoria está vacía: todavía no le enseñaste nada a dolphin acá.\n");
  } else {
    console.log("");
    for (const r of memoria.recuerdos) {
      const estado = r.activo ? "·" : "(apagado)";
      const como = r.patron ? `verificador /${r.patron}/` : "va en el prompt";
      console.log(`  ${r.id}  ${estado}  ${r.dicho}  —  ${como}`);
    }
    console.log("");
  }
  process.exit(0);
}

if (values.apagar || values.prender) {
  const id = (values.apagar ?? values.prender)!;
  const quedo = await prenderRecuerdo(repo, id, Boolean(values.prender));
  console.log(quedo ? `\n  Listo: ${id} quedó ${values.prender ? "prendido" : "apagado"}.\n` : `\n  No hay ningún recuerdo ${id}.\n`);
  process.exit(quedo ? 0 : 1);
}

if (values.olvidar) {
  const quedo = await olvidarRecuerdo(repo, values.olvidar);
  console.log(quedo ? `\n  Olvidado.\n` : `\n  No hay ningún recuerdo ${values.olvidar}.\n`);
  process.exit(quedo ? 0 : 1);
}

const dicho = positionals.join(" ").trim();
if (dicho === "") {
  console.log(`
  dolphin recordar: la memoria de ingeniería del repo.

  npm run recordar -- "los importes van con coma decimal, nunca punto"
  npm run recordar -- "nada de console.log en src" --patron "console\\.log"
  npm run recordar -- --perfil "hay monotributistas Y responsables inscriptos"
  npm run recordar -- --listar · --perfil (sin texto: lo muestra)
  npm run recordar -- --apagar <id> · --prender <id> · --olvidar <id>
`);
  process.exit(1);
}

try {
  // Lo que dice el dueño es regla de entrada: no pasa por el sueño.
  const recuerdo = await recordar(repo, dicho, values.patron, undefined, { origen: "owner" });
  const como = recuerdo.patron
    ? "entra al portón como verificador: una línea nueva que lo pise corta el intento"
    : "viaja en el prompt de cada siembra";
  console.log(`\n  Aprendido (${recuerdo.id}): «${recuerdo.dicho}»\n  Desde ahora ${como}.\n`);
} catch (error) {
  console.error(`\n  ${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
}
