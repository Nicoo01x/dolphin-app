// Primero: saca ELECTRON_RUN_AS_NODE del entorno antes de que nadie lance nada (ver electron.ts).
import "./nucleo/electron.js";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { correrCola, encolar, leerCola } from "./nucleo/cola.js";
import { entregadorDeGit } from "./nucleo/entrega.js";
import { soltarEnlacesAlCortar } from "./nucleo/entorno.js";
import { revisarRepo } from "./nucleo/repo.js";
import { motorDe } from "./nucleo/router.js";
import { prepararSiembra, sembrarTarea } from "./siembra.js";

/**
 * npm run cola -- --repo <ruta> --tarea "una" --tarea "otra" [--archivo tareas.txt]
 *
 * Varias tareas DISTINTAS a la vez, cada una en su rama, y al final ramas
 * que entran juntas. Lo que choca se vuelve a sembrar encima.
 */

const { values } = parseArgs({
  options: {
    repo: { type: "string", default: process.cwd() },
    tarea: { type: "string", multiple: true, default: [] },
    archivo: { type: "string", default: "" },
    concurrencia: { type: "string", default: "3" },
    agente: { type: "string", default: "mentira" },
    modelo: { type: "string", default: "" },
    verificar: { type: "string", default: "" },
    automatico: { type: "boolean", default: false },
    reintentos: { type: "string", default: "1" },
    // Correr lo que ya está esperando en la cola (un plan aprobado en la consola), sin encolar nada.
    pendientes: { type: "boolean", default: false },
    // Con --pendientes: cuáles, separadas por coma. Sin esto, todas las que esperan.
    ids: { type: "string", default: "" },
  },
});

// Absoluta desde acá: con «../mi-app», el enlace a node_modules de cada worktree apuntaba a la nada.
const repo = resolve(values.repo ?? process.cwd());
// Un Ctrl+C a mitad de la cola no deja worktrees con el enlace puesto ni agentes vivos.
soltarEnlacesAlCortar();
const delArchivo = values.archivo
  ? (await readFile(values.archivo, "utf8")).split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "" && !l.startsWith("#"))
  : [];
const tareas = [...(values.tarea ?? []), ...delArchivo];
const soloPendientes = values.pendientes ?? false;

if (tareas.length === 0 && !soloPendientes) {
  console.error(`
  dolphin cola · varias tareas a la vez, cada una en su rama, que entran juntas

  npm run cola -- --repo "D:/mi-proyecto" --tarea "una cosa" --tarea "otra cosa"
  npm run cola -- --repo "D:/mi-proyecto" --archivo tareas.txt   (una por línea)

  --concurrencia  cuántas a la vez (default 3)
  --agente        claude | antigravity | codex | acp | mentira, y los de «dolphin motores»
  --verificar     scripts de npm que forman el portón, separados por coma
  --automatico    corren solas: sin pedir permisos, con la política encima
  --pendientes    correr lo que ya espera en la cola (un plan aprobado), sin encolar nada
  --ids           con --pendientes, cuáles (separadas por coma)
`);
  process.exit(1);
}

const agente = motorDe(values.agente, "mentira");
const verificar = (values.verificar ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const revision = await revisarRepo(repo);
if (!revision.sirve) {
  console.error(`\n  ${revision.porQue}\n`);
  process.exit(1);
}

const nuevas = tareas.length > 0 ? await encolar(repo, tareas) : [];
const pedidas = new Set((values.ids ?? "").split(",").map((s) => s.trim()).filter(Boolean));
const enEspera = soloPendientes
  ? (await leerCola(repo)).tareas.filter((t) => t.estado === "esperando" && (pedidas.size === 0 || pedidas.has(t.id)))
  : nuevas;
const concurrencia = Math.max(1, Number.parseInt(values.concurrencia ?? "3", 10) || 3);
console.log(`\n  dolphin cola · ${enEspera.length} tarea(s), ${concurrencia} a la vez, con ${agente}\n`);

const inicio = Date.now();
const cola = await correrCola(repo, {
  concurrencia,
  ids: enEspera.map((t) => t.id),
  entregar: entregadorDeGit(repo),
  // Cada tarea se siembra igual que una sola: misma memoria, misma política, mismo portón.
  // Si vino de un plan, con el modelo y el tope de gasto que le tocaron.
  async sembrar(tarea, base, extra) {
    const modelo = extra?.modelo ?? (values.modelo || undefined);
    const pedido = { repo, tarea, agente, ...(modelo ? { modelo } : {}), verificar, automatico: values.automatico ?? false };
    const preparada = await prepararSiembra(pedido);
    const { cosecha } = await sembrarTarea(pedido, preparada, {
      base,
      reintentos: Number.parseInt(values.reintentos ?? "1", 10) || 0,
      ...(extra?.presupuesto !== undefined ? { presupuesto: extra.presupuesto } : {}),
    });
    if (!cosecha.ganador) return { porQue: cosecha.porQueGano ?? "ninguna rama pasó el portón" };
    return { rama: cosecha.ganador.universo.rama, worktree: cosecha.ganador.universo.ruta };
  },
  alCambiar(t) {
    if (t.estado === "trabajando" && !t.sobre) console.log(`  ·  arranca: ${t.tarea}`);
    if (t.estado === "trabajando" && t.sobre) console.log(`  ↻  ${t.tarea}: ${t.porQue}`);
    if (t.estado === "lista") console.log(`  ✓  lista: ${t.tarea}  (${t.rama})`);
    if (t.estado === "no-salio") console.log(`  ×  no salió: ${t.tarea} — ${t.porQue}`);
    if (t.estado === "en-conflicto") console.log(`  !  en conflicto: ${t.tarea} — ${t.porQue}`);
  },
});

const ids = new Set(enEspera.map((t) => t.id));
const estas = cola.tareas.filter((t) => ids.has(t.id));
const listas = estas.filter((t) => t.estado === "lista");
const segundos = ((Date.now() - inicio) / 1000).toFixed(1);

console.log(`\n  ─────────────────────────────────────────────`);
console.log(`  ${listas.length} de ${estas.length} listas en ${segundos} s.`);
if (listas.length > 0) {
  console.log(`  Se mergean juntas${listas.some((t) => t.sobre) ? ", en este orden" : ""}:`);
  for (const t of listas) console.log(`    git merge ${t.rama}${t.sobre ? "   (va después de la que tiene adentro)" : ""}`);
}
console.log("");
