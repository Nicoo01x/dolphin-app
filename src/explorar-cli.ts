import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { carpetaDeBandeja, marcarResueltos, sumarAsuntos } from "./nucleo/bandeja.js";
import { leerConfig } from "./nucleo/config.js";
import { git, gitValor } from "./nucleo/git.js";
import {
  NO_TOCAR_POR_DEFECTO,
  explorar,
  guardarCobertura,
  invalidar,
  leerCobertura,
  type Cobertura,
} from "./tester/explorador.js";
import { abrirNavegadorExplorable } from "./tester/explorador-playwright.js";

/**
 * npm run explorar -- --url http://127.0.0.1:3000 [--repo <ruta>]
 *
 * Recorre la app como una persona y deja en la bandeja lo que no anduvo.
 * Lo que ya revisó y no cambió no lo vuelve a revisar: la cobertura se
 * guarda en `.dolphin/cobertura.json` y se invalida sola por el diff.
 */

const { values } = parseArgs({
  options: {
    url: { type: "string", default: "" },
    repo: { type: "string", default: process.cwd() },
    todo: { type: "boolean", default: false },
    cambiaron: { type: "string", default: "" },
    grabar: { type: "boolean", default: false },
    tope: { type: "string", default: "60" },
    ancho: { type: "string", default: "1440" },
    alto: { type: "string", default: "900" },
  },
});

if (!values.url) {
  console.error(`
  dolphin explorar · recorre tu app como una persona y anota lo que no anda

  npm run explorar -- --url http://127.0.0.1:3000 --repo "D:/mi-proyecto"

  --url        dónde está corriendo la app
  --repo       el repo de la app: ahí quedan la bandeja y la cobertura
  --todo       revisar todo de nuevo, aunque no haya cambiado
  --cambiaron  rutas que cambiaron, separadas por coma: se revisan aunque ya estuvieran
  --grabar     grabar el recorrido en video
  --tope       cuántas cosas tocar como mucho (default 60)
`);
  process.exit(1);
}

// Absoluta desde acá: con «../mi-app», el enlace a node_modules de cada worktree apuntaba a la nada.
const repo = resolve(values.repo ?? process.cwd());

async function headDe(ruta: string): Promise<string | undefined> {
  try {
    return await gitValor(["rev-parse", "HEAD"], ruta);
  } catch {
    return undefined;
  }
}

async function archivosCambiadosDesde(ruta: string, desde: string): Promise<string[]> {
  try {
    return (await git(["diff", "--name-only", desde, "HEAD"], ruta)).split("\n").map((l) => l.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/** Lo que el repo pide no tocar, además de lo de siempre. */
async function noTocarDelRepo(ruta: string): Promise<RegExp[]> {
  const config = await leerConfig(ruta);
  return (config.explorar?.noTocar ?? []).map((t) => new RegExp(t, "i"));
}

let cobertura: Cobertura = values.todo ? { estados: {} } : await leerCobertura(repo);
const head = await headDe(repo);

// Lo que cambió desde la última vuelta se vuelve a revisar, sin que nadie lo pida.
if (cobertura.head && head && cobertura.head !== head) {
  const archivos = await archivosCambiadosDesde(repo, cobertura.head);
  const r = invalidar(cobertura, { archivos });
  cobertura = r.cobertura;
  if (r.invalidados > 0) console.log(`  ${r.invalidados} pantalla(s) se vuelven a revisar: su código cambió desde la última vuelta.`);
}
if (values.cambiaron) {
  const r = invalidar(cobertura, { superficies: values.cambiaron.split(",").map((s) => s.trim()) });
  cobertura = r.cobertura;
}

const navegador = await abrirNavegadorExplorable({
  ancho: Number.parseInt(values.ancho ?? "1440", 10),
  alto: Number.parseInt(values.alto ?? "900", 10),
  carpetaCapturas: carpetaDeBandeja(repo),
  ...(values.grabar ? { carpetaVideo: join(repo, ".dolphin", "videos") } : {}),
});

if (!navegador) {
  console.error("\n  No encontré un navegador para explorar: instalá playwright-core y Chrome (o Edge).\n");
  process.exit(1);
}

console.log(`\n  dolphin explorar · ${values.url}\n`);
if (navegador.avisoVideo) console.log(`  (${navegador.avisoVideo})\n`);
const inicio = Date.now();

try {
  const informe = await explorar(navegador.pagina, cobertura, {
    inicio: values.url,
    noTocar: [...NO_TOCAR_POR_DEFECTO, ...(await noTocarDelRepo(repo))],
    topeDeAcciones: Number.parseInt(values.tope ?? "60", 10) || 60,
  });

  const video = await navegador.cerrar();
  // Cada error sabe de qué video es y en qué segundo pasó: la consola salta directo a ese momento.
  const nombreVideo = video ? basename(video) : undefined;
  const asuntos = informe.asuntos.map((a) => (nombreVideo && a.momento !== undefined ? { ...a, video: nombreVideo } : a));
  const resultado = await sumarAsuntos(repo, asuntos);
  const resueltos = await marcarResueltos(repo, informe.sanas);
  await guardarCobertura(repo, { ...informe.cobertura, ...(head ? { head } : {}) });

  const segundos = ((Date.now() - inicio) / 1000).toFixed(1);
  console.log(`  Revisé ${informe.revisados.length} pantalla(s) y toqué ${informe.acciones} cosas en ${segundos} s.`);
  if (informe.salteados > 0) {
    console.log(`  ${informe.salteados} pantalla(s) ya estaban revisadas y su código no cambió: no las toqué.`);
  }
  for (const e of informe.revisados) console.log(`    · ${e.ruta}`);

  if (resultado.sumados.length === 0) {
    console.log(`\n  No encontré nada nuevo${resultado.yaEstaban > 0 ? ` (${resultado.yaEstaban} que ya estaban en la bandeja)` : ""}.`);
  } else {
    console.log(`\n  ${resultado.sumados.length} error(es) nuevo(s) en la bandeja:`);
    for (const a of resultado.sumados) console.log(`    × ${a.titulo}  (${a.donde})`);
    if (resultado.yaEstaban > 0) console.log(`  Y ${resultado.yaEstaban} que ya estaban: no se duplican.`);
  }
  if (resueltos.length > 0) {
    console.log(`\n  ${resueltos.length} error(es) que estaban en la bandeja ya no pasan: los volví a probar y los cerré.`);
    for (const a of resueltos) console.log(`    ✓ ${a.titulo}`);
  }
  if (resultado.rechazados > 0) console.log(`  ${resultado.rechazados} que alguien ya había descartado: no vuelven.`);
  if (video) console.log(`\n  El recorrido quedó grabado en:\n  ${video}`);
  console.log("");
} catch (error) {
  await navegador.cerrar().catch(() => undefined);
  console.error(`\n  La exploración se cortó: ${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
}
