// Primero: saca ELECTRON_RUN_AS_NODE del entorno antes de que nadie lance nada (ver electron.ts).
import "./nucleo/electron.js";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { avisoDeLineaBase, medirLineaBase } from "./nucleo/linea-base.js";
import { soltarEnlacesAlCortar } from "./nucleo/entorno.js";
import { revisarRepo } from "./nucleo/repo.js";
import { LATIDO_MS, latirAsunto, tomarAsunto } from "./nucleo/bandeja.js";
import { prepararSiembra, quienMide, sembrarTarea, tallerDeLaSiembra, type Motor, type PedidoDeTarea } from "./siembra.js";
import { tareaDeIssue } from "./nucleo/pr.js";
import { decirSalteadas, fasesSalteadas } from "./nucleo/porton.js";
import type { Cosecha } from "./nucleo/tipos.js";
import { contarReparto, esEstrategia, MOTORES } from "./nucleo/router.js";
import { revisarNombres } from "./nucleo/relevo.js";
import { reducirEvento } from "./nucleo/en-vivo.js";
import { abrirTablero } from "./tablero/en-vivo.js";

/**
 * dolphin sembrar --repo <ruta> --tarea "..." --verificar typecheck,test [--n 3]
 *
 * Con `--agente claude` trabaja el CLI de Claude Code de verdad, uno por
 * rama. El de mentira queda como default porque no gasta un peso: sirve
 * para probar el circuito —worktrees, portón, elección— sin tokens.
 *
 * La siembra se arma en `siembra.ts`, el mismo lugar que usan la cola de
 * tareas y lo que corre solo: acá solo se leen los flags y se cuenta.
 */

const { values } = parseArgs({
  options: {
    repo: { type: "string", default: process.cwd() },
    n: { type: "string", default: "1" },
    tarea: { type: "string", default: "" },
    verificar: { type: "string", default: "" },
    rama: { type: "string", default: "dolphin" },
    sucio: { type: "boolean", default: false },
    agente: { type: "string", default: "mentira" },
    relevo: { type: "string", default: "" },
    reintentos: { type: "string", default: "1" },
    presupuesto: { type: "string", default: "" },
    modelo: { type: "string", default: "" },
    estrategia: { type: "string", default: "" },
    contexto: { type: "string", default: "" },
    igual: { type: "boolean", default: false },
    suscripcion: { type: "boolean", default: false },
    automatico: { type: "boolean", default: false },
    asunto: { type: "string", default: "" },
    issue: { type: "string", default: "" },
    "de-afuera": { type: "boolean", default: false },
    "sin-tablero": { type: "boolean", default: false },
  },
  allowPositionals: true,
});

// Un issue de GitHub se siembra directo: su título y su cuerpo son la tarea.
let tarea = values.tarea ?? "";
if (values.issue) {
  try {
    tarea = await tareaDeIssue(values.repo ?? process.cwd(), Number.parseInt(values.issue, 10));
  } catch (error) {
    console.error(`\n  No pude leer el issue #${values.issue}: ${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  }
}

// Sin tarea no hay nada que sembrar, y el default de --repo es el cwd:
// quien prueba el comando a ciegas sembraría sobre el repo de dolphin.
if (tarea.trim() === "") {
  console.error(`
  dolphin · la tarea se escribe en una rama, se prueba fase por fase y se entrega probada

  npm run sembrar -- --repo "D:/mi-proyecto" --tarea "qué hay que hacer"
                     --verificar "typecheck,test" --agente claude

  --repo       el repo donde trabajar (por defecto, esta carpeta)
  --n          cuántas ramas abrir (default 1; más, para comparar enfoques)
  --tarea      qué tienen que hacer
  --issue      un issue de GitHub a sembrar (su título y su cuerpo son la tarea)
  --verificar  scripts de npm que forman el portón, separados por coma
  --agente     claude | antigravity | codex | acp | mentira, y los de «dolphin motores»
               (todos reciben la misma memoria). «acp» es cualquier agente que hable
               el protocolo, con su comando en dolphin.config.json: ver docs/acp.md
  --relevo     a quién le pasa la rama si el agente no puede trabajar (sin cupo, sin clave,
               sin sesión), en orden y separados por coma: sigue en el MISMO worktree con el
               traspaso de lo que ya se hizo. Tienen que ser de otra empresa que el titular
  --reintentos vueltas del bucle corregir-y-reprobar por fase (default 1)
  --presupuesto tope en dólares para toda la siembra: escribir, fases y correcciones;
                alcanzado, no se corrige más (default sin tope)
  --modelo     quién escribe: haiku, sonnet, opus… (manda sobre la estrategia)
  --estrategia calidad | equilibrada | economia: el caro escribe, el barato revisa
               (por defecto, la de dolphin.config.json → modelos, o equilibrada)
  --sucio      no borrar los worktrees de las ramas que no se eligen
  --igual      sembrar aunque el repo ya esté en rojo
  --suscripcion el agente corre con suscripción: no se muestran montos
  --automatico corre solo: el agente sin pedir permisos, la política en el portón
  --asunto     el asunto de la bandeja que esta siembra implementa
  --sin-tablero sin el tablero en vivo: renglones de texto, como en un log
  --de-afuera  la tarea vino de afuera (un issue de otro, la web): lo que deje en
               la memoria espera tu visto bueno (con --issue va solo)

  probá primero: npm run demo
  y para varias tareas a la vez: npm run cola
`);
  process.exit(1);
}

const cantidad = Number.parseInt(values.n ?? "1", 10);

// `parseInt("abc")` es NaN y `Array.from({ length: NaN })` es []: la corrida
// terminaba con éxito, cero ramas y una cosecha vacía.
if (!Number.isInteger(cantidad) || cantidad < 1) {
  console.error(`
  --n tiene que ser un número de 1 para arriba (recibí «${values.n}»).
`);
  process.exit(1);
}

const motor = MOTORES.find((m) => m === values.agente);
if (!motor) {
  console.error(`\n  --agente tiene que ser ${MOTORES.join(", ")} (recibí «${values.agente}»).\n`);
  process.exit(1);
}

// Los relevos: se validan acá, antes de abrir un worktree. Una cadena mal armada descubierta a
// mitad de una siembra ya cuesta plata, y la de dos cuentas del mismo proveedor no se arma nunca.
const relevos: Motor[] = [];
for (const nombre of (values.relevo ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
  const suplente = MOTORES.find((m) => m === nombre);
  if (!suplente) {
    console.error(`\n  --relevo tiene que ser ${MOTORES.join(", ")} (recibí «${nombre}»).\n`);
    process.exit(1);
  }
  relevos.push(suplente);
}
if (relevos.length > 0) {
  try {
    revisarNombres([{ nombre: motor }, ...relevos.map((nombre) => ({ nombre }))]);
  } catch (error) {
    console.error(`\n  ${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  }
}

if (values.estrategia && !esEstrategia(values.estrategia)) {
  console.error(`\n  --estrategia tiene que ser calidad, equilibrada o economia (recibí «${values.estrategia}»).\n`);
  process.exit(1);
}

// Absoluta desde acá: con «../mi-app», el enlace a node_modules de cada worktree apuntaba a la nada.
const repo = resolve(values.repo ?? process.cwd());
// Un Ctrl+C a mitad de una siembra no deja worktrees con el enlace puesto ni agentes vivos.
soltarEnlacesAlCortar();
const pedido: PedidoDeTarea = {
  repo,
  tarea,
  agente: motor,
  ...(relevos.length > 0 ? { relevos } : {}),
  ...(values.modelo ? { modelo: values.modelo } : {}),
  ...(values.estrategia && esEstrategia(values.estrategia) ? { estrategia: values.estrategia } : {}),
  verificar: (values.verificar ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  ...(values.contexto ? { contexto: values.contexto } : {}),
  automatico: values.automatico ?? false,
  // Un issue lo puede escribir cualquiera: lo que deje en la memoria espera tu visto bueno.
  ...(values["de-afuera"] || values.issue ? { deAfuera: true } : {}),
};

// Antes de abrir un solo worktree: que la carpeta exista, sea un repo y
// tenga un commit. Si no, git falla con un stack trace por la cara.
const revision = await revisarRepo(repo);
if (!revision.sirve) {
  console.error(`\n  ${revision.porQue}\n`);
  process.exit(1);
}

// El asunto de la bandeja que esta siembra implementa lo toma ESTE proceso apenas arranca, y late
// mientras viva: preparar y medir la línea base pueden tardar minutos antes de que empiece a
// sembrar, y un asunto que no late se da por cortado (ver liberarCortados).
const asunto = values.asunto;
if (asunto) {
  await tomarAsunto(repo, asunto, process.pid).catch(() => null);
  setInterval(() => void latirAsunto(repo, asunto, process.pid).catch(() => {}), LATIDO_MS).unref();
}

const preparada = await prepararSiembra(pedido);

console.log(`\n  dolphin · ${cantidad === 1 ? "una rama" : `${cantidad} ramas`} en ${repo}`);
// Solo se anuncia la medición si de verdad alguna rama sale a medir (ver quienMide).
const { explorar: _medible, ...sinMedir } = preparada.reparto;
console.log(`  agente: ${preparada.agente.nombre} · ${contarReparto(quienMide(preparada, cantidad) ? preparada.reparto : sinMedir)}`);
if (preparada.reparto.porDatos) console.log(`  ${preparada.reparto.porDatos}`);
console.log("");

// Antes de gastar un peso: ¿el repo estaba sano? Si ya fallaba, todas las
// ramas se cortan en la misma fase y parece culpa de los agentes.
if (preparada.verificadores.length > 0) {
  // En un worktree como el de cada rama, no en tu árbol: ahí están tus cambios a medio hacer.
  const linea = await medirLineaBase(repo, [...preparada.verificadores], await tallerDeLaSiembra(pedido, preparada));
  const aviso = avisoDeLineaBase(linea);
  if (aviso) {
    console.log(`  ⚠  ${aviso}\n`);
    if (!values.igual) {
      console.log("  (sembrá con --igual si querés hacerlo igual)\n");
      process.exit(1);
    }
  }
}

// En una terminal de verdad, la siembra se ve en vivo (ramas, portón, línea de tiempo); en un log, renglones.
const tablero = process.stdout.isTTY && !values["sin-tablero"] ? abrirTablero(process.stdout) : null;
tablero?.recibir({
  t: Date.now(),
  tipo: "siembra",
  tarea,
  universos: cantidad,
  fases: preparada.verificadores.map((v) => v.nombre),
  agente: preparada.agente.nombre,
});

const { cosecha, donde, aprendido, deshecho, sueno, parte } = await sembrarTarea(pedido, preparada, {
  cantidad,
  rama: values.rama ?? "dolphin",
  limpiar: !values.sucio,
  reintentos: Number.parseInt(values.reintentos ?? "1", 10) || 0,
  ...(values.presupuesto ? { presupuesto: Number.parseFloat(values.presupuesto) } : {}),
  suscripcion: values.suscripcion ?? false,
  ...(values.asunto ? { asunto: values.asunto } : {}),
  transmitir: true,
  alPasar(evento) {
    if (tablero) {
      const reducido = reducirEvento(evento);
      if (reducido) tablero.recibir({ ...reducido, t: Date.now() });
      return;
    }
    if (evento.tipo === "nace") console.log(`  ·  ${evento.universo.id} · ${evento.enfoque}`);
    if (evento.tipo === "escribio") {
      const superficies = evento.contrato?.superficies.join(", ");
      const nota = superficies ? ` · toca ${superficies}` : evento.contrato ? " · no se ve en pantalla" : " · sin contrato";
      const quien = evento.modelo ? ` (${evento.modelo})` : "";
      console.log(`  ·  ${evento.universo.id} escribió ${evento.forma.agregadas} líneas${quien}${nota}`);
    }
    if (evento.tipo === "fallo-escribiendo") console.log(`  ×  ${evento.universo.id} se cayó: ${evento.porQue}`);
  },
});

tablero?.recibir({
  t: Date.now(),
  tipo: "cosecha",
  ...(cosecha.ganador ? { elegida: cosecha.ganador.universo.rama } : {}),
  ...(cosecha.porQueGano ? { porQue: cosecha.porQueGano } : {}),
  ms: cosecha.ms,
  gastado: cosecha.gastado,
  ...(cosecha.suscripcion ? { suscripcion: true } : {}),
});
tablero?.cerrar();

if (aprendido) console.log(`\n  La memoria aprendió sola: ${aprendido.dicho}`);
for (const r of deshecho) console.log(`\n  Se deshizo una corrección y quedó anotado: ${r.dicho}`);
// Lo que la memoria soñó al terminar: qué pasó del corto plazo a la memoria, y qué espera tu visto bueno.
for (const { nota } of sueno?.promovidas ?? []) console.log(`\n  La memoria soñó y se quedó con esto: ${nota.texto}`);
if (sueno && sueno.esperando.length > 0) console.log(`\n  ${sueno.esperando.length} nota(s) de afuera esperan tu visto bueno en la vista Memoria.`);

imprimir(cosecha);
if (cosecha.sinEntregar) console.log(`  ⚠  la elegida pasó, pero git no la pudo commitear: ${cosecha.sinEntregar}. El trabajo sigue en su worktree.\n`);
console.log(`  la cosecha quedó en:\n  ${donde}\n`);
if (parte) console.log(`  el parte, para abrir en el navegador:\n  ${parte}\n`);

function imprimir(c: Cosecha): void {
  console.log("\n  ─────────────────────────────────────────────");
  for (const candidato of c.candidatos) {
    const marca = candidato.vivo ? "✓" : "×";
    const angulo = (candidato.enfoque ?? "—").padEnd(16);
    const salteadas = fasesSalteadas(candidato);
    const cola = candidato.vivo
      ? `${candidato.forma?.archivos ?? 0} archivo(s) · +${candidato.forma?.agregadas ?? 0}${salteadas.length > 0 ? ` · ${decirSalteadas(salteadas)}` : ""}`
      : `se cortó en ${candidato.murioEn}: ${candidato.porQue}`;
    console.log(`  ${marca}  ${candidato.universo.id.padEnd(4)} ${angulo} ${cola}`);
  }

  console.log("  ─────────────────────────────────────────────");
  console.log(`  elegida        ${c.ganador?.universo.rama ?? "ninguna: no pasó nadie"}`);
  console.log(`  por qué        ${c.porQueGano ?? ""}`);
  if (c.candidatos.length > 1) console.log(`  cortadas gratis ${c.muertosGratis} de ${c.candidatos.length}`);
  // Con suscripción la plata no se muestra: nadie pagó por uso.
  if (!c.suscripcion) console.log(`  gastado        US$ ${c.gastado.toFixed(2)}`);
  console.log(`  tardó          ${(c.ms / 1000).toFixed(1)} s\n`);

  if (c.ganador) {
    console.log(`  el worktree de la elegida queda en:\n  ${c.ganador.universo.ruta}\n`);
  }
}
