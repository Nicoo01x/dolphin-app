// Primero: saca ELECTRON_RUN_AS_NODE del entorno antes de que nadie lance nada (ver electron.ts).
import "./nucleo/electron.js";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { planificadorConClaude } from "./agentes/planificador.js";
import { verificadorRevisor } from "./agentes/revisor.js";
import { soltarEnlacesAlCortar } from "./nucleo/entorno.js";
import { leerPlanGuardado, type Planificador } from "./nucleo/plan.js";
import { portonDelProyecto } from "./nucleo/porton-del-proyecto.js";
import { revisarRepo } from "./nucleo/repo.js";
import { modeloDelEscalon, motorDe } from "./nucleo/router.js";
import { correrEquipo, type EventoEquipo } from "./equipo/equipo.js";
import { objetivoDeTarjeta, seguirConTarjeta } from "./equipo/con-tarjeta.js";
import { buscarTarjeta, NOMBRE_DE_COLUMNA, type Tarjeta } from "./nucleo/tarjetas.js";

/**
 * dolphin equipo --repo <ruta> --tarea "algo grande" [--verificar test] [--agente claude]
 * dolphin equipo --tarjeta <id>   la tarea es esa tarjeta del tablero, y el equipo la va moviendo
 *
 * Un líder parte la tarea, los compañeros la hacen a la vez (cada uno en su rama), se juntan en una
 * rama de integración, otro modelo revisa el diff entero y el portón decide. En una terminal de
 * verdad se ve en vivo; con --agente mentira corre de punta a punta sin gastar nada.
 */

const { values } = parseArgs({
  options: {
    repo: { type: "string", default: process.cwd() },
    tarea: { type: "string", default: "" },
    tarjeta: { type: "string", default: "" },
    plan: { type: "string", default: "" },
    verificar: { type: "string", default: "" },
    agente: { type: "string", default: "mentira" },
    concurrencia: { type: "string", default: "3" },
    automatico: { type: "boolean", default: false },
    "sin-tablero": { type: "boolean", default: false },
  },
});

const repo = resolve(values.repo ?? process.cwd());
// Con una tarjeta, el pedido es lo que dice la tarjeta (salvo que --tarea diga otra cosa).
let tarjeta: Tarjeta | undefined;
if (values.tarjeta?.trim()) {
  try {
    tarjeta = await buscarTarjeta(repo, values.tarjeta);
  } catch (e) {
    console.error(`\n  ${(e as Error).message}\n`);
    process.exit(1);
  }
}
const objetivo = (values.tarea ?? "").trim() || (tarjeta ? objetivoDeTarjeta(tarjeta) : "");
if (!objetivo) {
  console.error(`
  dolphin equipo · un líder parte la tarea y un equipo la hace a la vez

  npm run equipo -- --repo "D:/mi-proyecto" --tarea "exportar los pedidos a CSV" --verificar test --agente claude

  --agente       claude | mentira (de mentira no gasta nada: sirve para ver el circuito)
  --verificar    scripts de npm que forman el portón, separados por coma
  --concurrencia cuántos compañeros a la vez (default 3)
  --automatico   sin pedir permisos, con la política encima
  --sin-tablero  renglones de texto en vez del tablero en vivo
  --tarjeta      una tarjeta del tablero (dolphin tarea): pasa a Haciendo y, si sale, a Para revisar
  --plan         un plan ya aprobado (.dolphin/planes): el equipo lo corre sin volver a pensarlo
`);
  process.exit(1);
}

const revision = await revisarRepo(repo);
if (!revision.sirve) {
  console.error(`\n  ${revision.porQue}\n`);
  process.exit(1);
}
soltarEnlacesAlCortar();

const agente = motorDe(values.agente, "mentira");
const pedidas = (values.verificar ?? "").split(",").map((s) => s.trim()).filter(Boolean);
// Sin --verificar, el portón del proyecto: el mismo con el que prueba la terminal.
const verificar = pedidas.length > 0 ? pedidas : await portonDelProyecto(repo);
const deMentira = agente === "mentira";
// Un plan que ya aprobaste (desde la consola): se corre tal cual, sin pagar otro líder.
const aprobado = values.plan?.trim() ? await leerPlanGuardado(repo, values.plan.trim()) : null;
if (values.plan?.trim() && !aprobado) {
  console.error(`\n  no encuentro el plan «${values.plan}» en .dolphin/planes\n`);
  process.exit(1);
}

/** El líder de mentira: un plan fijo de tres tareas, una que depende de otra. No gasta nada. */
const liderDeMentira: Planificador = async () => ({
  texto: JSON.stringify({
    resumen: `partir «${objetivo}» en la lógica, la pantalla y sus tests`,
    tareas: [
      { id: "t1", titulo: "la lógica", tarea: `${objetivo}: la lógica de fondo`, escalon: "medio" },
      { id: "t2", titulo: "la pantalla", tarea: `${objetivo}: lo que se ve en la interfaz`, escalon: "barato" },
      { id: "t3", titulo: "los tests", tarea: `${objetivo}: tests de la lógica`, escalon: "barato", dependeDe: "t1" },
    ],
  }),
  gastado: 0,
});

const lider = deMentira ? "demo" : (modeloDelEscalon(agente, "caro") ?? "opus");
const modeloRevisor = deMentira ? "demo" : (modeloDelEscalon(agente, "medio") ?? "sonnet");
const pensar: Planificador = aprobado
  ? async () => ({ texto: JSON.stringify({ resumen: aprobado.resumen, tareas: aprobado.tareas }), gastado: 0 })
  : deMentira
    ? liderDeMentira
    : planificadorConClaude(lider);
const revisor = verificadorRevisor({
  tarea: objetivo,
  modelo: modeloRevisor,
  ...(deMentira ? { correr: async () => ({ texto: '{"decision": "aceptar", "porque": "las tres piezas encajan"}', gastado: 0 }) } : {}),
});

const enTexto = (e: EventoEquipo): void => {
  if (e.tipo === "etapa") console.log(`\n  ── ${e.etapa}`);
  if (e.tipo === "plan") for (const t of e.tareas) console.log(`  ·  ${t.id} ${t.titulo}${t.modelo ? ` (${t.modelo})` : ""}${t.dependeDe ? ` · después de ${t.dependeDe}` : ""}`);
  if (e.tipo === "plan-fallo") console.log(`  ×  ${e.porQue}`);
  if (e.tipo === "tarea") console.log(`  ·  ${e.id} ${e.estado}${e.porQue ? `: ${e.porQue}` : ""}`);
  if (e.tipo === "merge") console.log(`  ${e.ok ? "✓" : "×"}  merge ${e.id}${e.porQue ? `: ${e.porQue}` : ""}`);
  if (e.tipo === "fase-final" && e.estado !== "corre") console.log(`  ${e.estado === "paso" ? "✓" : e.estado === "salteada" ? "-" : "×"}  ${e.verificador}`);
};

const seguimiento = tarjeta ? seguirConTarjeta(repo, tarjeta.id) : undefined;
const resultado = await correrEquipo(
  {
    repo,
    objetivo,
    agente,
    verificar,
    concurrencia: Math.max(1, Number.parseInt(values.concurrencia ?? "3", 10) || 3),
    automatico: values.automatico ?? false,
    pensar,
    revisor,
    nombres: { lider, revisor: modeloRevisor },
  },
  (e) => {
    enTexto(e);
    seguimiento?.alPasar(e);
  },
);
await seguimiento?.listo().catch((e: Error) => console.error(`  ×  no pude mover la tarjeta: ${e.message}`));

console.log(`\n  ${resultado.rama ? "✓" : "×"}  ${resultado.porQue}`);
if (resultado.rama) console.log(`  rama del equipo: ${resultado.rama}\n  worktree: ${resultado.ruta}`);
console.log(`  tardó ${(resultado.ms / 1000).toFixed(1)} s${resultado.gastado > 0 ? ` · gastado US$ ${resultado.gastado.toFixed(2)}` : ""}`);
if (tarjeta) {
  const ahora = await buscarTarjeta(repo, tarjeta.id).catch(() => undefined);
  if (ahora) console.log(`  la tarjeta quedó en ${NOMBRE_DE_COLUMNA[ahora.columna]}`);
}
console.log("");
