import { argumentosDeLectura, leerConClaude } from "./leer-con-claude.js";
import type { Planificador } from "../nucleo/plan.js";

/** Lo que puede hacer el planificador: leer el repo. Leer para entenderlo lleva vueltas; escribir el plan, una. */
const LECTURA_DEL_PLANIFICADOR = { vueltas: 16, herramientas: ["Read", "Grep", "Glob"] } as const;

/** Los argumentos del planificador, sin el prompt (va por stdin). */
export function argumentosDelPlanificador(modelo: string): string[] {
  return argumentosDeLectura({ modelo, ...LECTURA_DEL_PLANIFICADOR });
}

/**
 * Quién piensa el plan de Thinking por defecto: el CLI de Claude, sin poder
 * escribir. Lee el repo lo que haga falta para entender el objetivo y
 * contesta el plan en JSON (ver promptDePlan). Corre en el repo de verdad,
 * así que no toca nada: solo lee (ver leer-con-claude.ts), y el plan se
 * aprueba en la consola antes de que alguien escriba una línea.
 */
export function planificadorConClaude(modelo: string, cmd = "claude", tope = 300_000): Planificador {
  // Lo que lee mientras arma el plan sale en vivo: es la terminal del líder (ver nucleo/voces.ts).
  return (prompt, repo) => leerConClaude(prompt, { cmd, modelo, ...LECTURA_DEL_PLANIFICADOR, cwd: repo, tope, voz: vozDelLider(repo) });
}

/** La clave de las voces del líder de un repo: la usan el planificador y quien lo mira. */
export const vozDelLider = (repo: string): string => `lider:${repo}`;
