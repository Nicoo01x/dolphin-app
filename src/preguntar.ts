import { leerSalida } from "./agentes/claude.js";
import { correrConPrompt, prepararComando } from "./agentes/ejecutar.js";
import { argumentosDeLectura } from "./agentes/leer-con-claude.js";

/**
 * Preguntarle algo a una sesión vieja de Claude Code: «¿por qué dejaste el pago único?», «¿qué
 * probaste para el bug del CUIT?». La sesión contesta con todo lo que sabía, en una copia
 * (`--fork-session`) y en solo lectura: no toca la charla original ni escribe nada.
 *
 * Idea de gastown (`gt seance`), que salió de buscar repos nuevos el 28/10. Va de la mano de
 * «¿dónde quedé?»: Nico volvió a pegar la misma visión de Dolphin tres veces porque no había cómo
 * preguntarle a la sesión anterior.
 */

export interface Respuesta {
  readonly texto: string;
  readonly costo?: number;
}

/** Los argumentos: lectura pura (Read, Grep, Glob) sobre la sesión retomada en una copia. */
export function argumentosDePregunta(sesion: string): string[] {
  const lectura = argumentosDeLectura({ vueltas: 6, herramientas: ["Read", "Grep", "Glob"] });
  // Antes de --tools: ese flag se lleva todo lo que le sigue.
  const corte = lectura.indexOf("--allowedTools");
  return [...lectura.slice(0, corte), "--resume", sesion, "--fork-session", ...lectura.slice(corte)];
}

export const PREAMBULO =
  "Contestá esta pregunta sobre lo que hicimos en esta sesión, con lo que sabés de ella. Solo contestá: no escribas archivos ni corras nada. Si no lo sabés, decilo.";

export type PreguntarAClaude = (pedido: { readonly repo: string; readonly args: readonly string[]; readonly prompt: string }) => Promise<Respuesta>;

export const preguntarAClaude: PreguntarAClaude = async ({ repo, args, prompt }) => {
  const listo = prepararComando("claude", args);
  if (!listo) throw new Error("no encontré «claude» en el PATH");
  const corrida = await correrConPrompt(listo.cmd, listo.args, prompt, repo, 5 * 60_000, undefined, listo.verbatim);
  const leido = leerSalida(corrida.salida) as ReturnType<typeof leerSalida> & { subtype?: string };
  if (leido.is_error || leido.subtype?.startsWith("error")) throw new Error(leido.result || corrida.error || "Claude no pudo contestar");
  return { texto: leido.result ?? "", ...(typeof leido.total_cost_usd === "number" ? { costo: leido.total_cost_usd } : {}) };
};

export function preguntar(repo: string, sesion: string, pregunta: string, correr: PreguntarAClaude = preguntarAClaude): Promise<Respuesta> {
  if (!pregunta.trim()) throw new Error("falta la pregunta");
  return correr({ repo, args: argumentosDePregunta(sesion), prompt: `${PREAMBULO}\n\n${pregunta.trim()}` });
}
