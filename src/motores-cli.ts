import { MOTORES_DE_CLI, type Probado } from "./agentes/motores.js";
import { prepararComando } from "./agentes/ejecutar.js";

/**
 * `dolphin motores`: con qué agentes puede trabajar Dolphin en esta máquina.
 *
 * Dice tres cosas por motor: si el CLI está en el PATH, cómo se lo llama y
 * hasta dónde se verificaron sus banderas. Lo último importa: las banderas de
 * estos CLI cambian seguido, y es más útil decir «esta la leí en la
 * documentación pero no la corrí» que hacer como que todas valen lo mismo.
 */

const PROPIOS = [
  { nombre: "claude", cmd: "claude", queEs: "Claude Code, de Anthropic" },
  { nombre: "codex", cmd: "codex", queEs: "Codex, de OpenAI" },
  { nombre: "antigravity", cmd: "agy", queEs: "Antigravity, de Google" },
] as const;

const COMO_SE_PROBO: Record<Probado, string> = {
  "acá": "corrido acá",
  "documentación": "según su documentación",
  no: "sin verificar",
};

export function lineasDeMotores(hay: (cmd: string) => boolean): string[] {
  const lineas: string[] = [];
  const fila = (nombre: string, cmd: string, queEs: string, probado: string) =>
    `  ${hay(cmd) ? "✓" : "·"} ${nombre.padEnd(12)} ${cmd.padEnd(14)} ${queEs}${probado ? ` · ${probado}` : ""}`;

  lineas.push("", "  con lectura de costo y tokens:");
  for (const m of PROPIOS) lineas.push(fila(m.nombre, m.cmd, m.queEs, ""));
  lineas.push("", "  de la tabla de motores (no informan cuánto cuestan):");
  for (const m of MOTORES_DE_CLI) lineas.push(fila(m.nombre, m.cmd, m.queEs, COMO_SE_PROBO[m.probado]));
  lineas.push(
    "",
    "  ✓ está en el PATH · · no lo encontré",
    "  se elige con --agente <nombre>; «mentira» es el de prueba, que no gasta nada",
    "",
  );
  return lineas;
}

console.log(lineasDeMotores((cmd) => prepararComando(cmd, []) !== undefined).join("\n"));
