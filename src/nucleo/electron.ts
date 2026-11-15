/**
 * Adentro de la app de escritorio, Dolphin corre sobre el Electron de la app
 * haciendo de Node: lo lanza con `ELECTRON_RUN_AS_NODE=1` (ver el fork,
 * dolphin-console.ts). Esa variable no puede seguir de largo. La heredaban
 * los agentes, cada fase del portón y la app de la persona, y un Electron
 * que la recibe arranca como Node y no como app: las pruebas de una app de
 * Electron fallaban por culpa de Dolphin. Al importarse se saca del entorno,
 * y vuelve solo en los procesos de Dolphin que se lanzan con este mismo
 * ejecutable (la siembra, la cola, el guion del bisect).
 *
 * Va primero en cada punto de entrada que la app puede lanzar. Corriendo con
 * el Node de la terminal no hace nada.
 */
const comoNode = process.env["ELECTRON_RUN_AS_NODE"];
delete process.env["ELECTRON_RUN_AS_NODE"];

/** El entorno de un proceso de Dolphin lanzado con `process.execPath`. */
export function entornoDeDolphin(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return { ...process.env, ...extra, ...(comoNode ? { ELECTRON_RUN_AS_NODE: comoNode } : {}) };
}
