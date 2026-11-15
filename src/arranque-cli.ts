import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { configPropuesta, decirDeteccion, detectarProyecto } from "./nucleo/arranque.js";

/**
 * `dolphin arranque [--repo <ruta>] [--json]`
 *
 * Qué es este repo, con qué se instala y qué corre el portón. Solo LEE: no escribe el
 * `dolphin.config.json`, lo propone. Quien lo guarda es quien lo aprueba.
 *
 * Por qué existe como comando y no sólo adentro del TUI: la misma pregunta se la hace el
 * escritorio cuando abrís un repo, y la respuesta tiene que ser LA MISMA. Con la detección
 * encerrada en `tui/sesion.ts`, el escritorio sólo podía copiarla — y una copia de la detección es
 * dos lugares donde arreglar el día que aparezca un gestor nuevo, con la garantía de que uno de
 * los dos se va a quedar viejo. Acá hay un solo detector y dos pantallas que lo preguntan.
 *
 * Con `--json` sale la propuesta entera para que la lea un programa; sin él, las mismas tres
 * líneas que lee una persona en la terminal.
 */

const { values } = parseArgs({
  options: {
    repo: { type: "string", default: process.cwd() },
    json: { type: "boolean", default: false },
  },
  allowPositionals: true,
});

const repo = resolve(values.repo ?? process.cwd());
const deteccion = await detectarProyecto(repo);

if (values.json) {
  // `propuesta` es lo que iría al archivo; `deteccion` es el porqué. Van las dos: quien lo muestre
  // necesita poder decir QUÉ encontró, no sólo qué va a escribir.
  console.log(JSON.stringify({ repo, deteccion, propuesta: configPropuesta(deteccion) }, null, 2));
} else {
  console.log(`\n${decirDeteccion(deteccion)}\n`);
}
