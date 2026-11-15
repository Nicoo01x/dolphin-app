import { correrConPrompt, prepararComando } from "./ejecutar.js";
import { conCuentaDeClaude, esLimiteDeUso } from "../nucleo/cuentas.js";
import { oyenteDeClaude } from "../nucleo/voces.js";
import { leerSalida, mensajeDeError } from "./claude.js";
import { SOLO_CONFIG_DEL_USUARIO } from "../nucleo/config-ejecutable.js";

/**
 * Claude en solo lectura: el revisor, el juez, el planificador y el scout.
 * Cuatro lanzadores casi iguales, cada uno con su agujero, se volvieron uno:
 *
 * - Las herramientas se LIMITAN con `--tools`, no se prohíben de a una: la
 *   lista de prohibidos (Edit, Write, Bash) dejaba disponibles PowerShell,
 *   WebFetch y los subagentes, y `--allowedTools` del scout solo aprobaba sin
 *   preguntar, no sacaba nada.
 * - `--permission-mode dontAsk`: sin él, heredaba el modo por defecto de la
 *   persona, y un «acceptEdits» en su configuración dejaba editar.
 * - Solo la configuración del usuario: lo que lee lo escribió otro agente
 *   (ver config-ejecutable.ts).
 * - Los argumentos van adentro de la línea de comandos, no pegados después:
 *   con un `claude.cmd` (instalado por npm) quedaban fuera de las comillas
 *   de cmd.exe y llegaban partidos.
 */

export interface Lectura {
  readonly cmd?: string;
  readonly modelo?: string;
  /** Cuántas vueltas de herramientas puede dar. */
  readonly vueltas: number;
  /** Lo único que puede usar. Nada que escriba ni corra comandos. */
  readonly herramientas: readonly string[];
  readonly cwd: string;
  readonly tope: number;
  readonly entorno?: Readonly<Record<string, string>>;
  /** Si se da, lo que va leyendo sale en vivo con esta clave (ver nucleo/voces.ts). */
  readonly voz?: string;
  /** Si quien lo pidió deja de esperar, se corta el proceso (ver correrConPrompt). */
  readonly senal?: AbortSignal;
  /**
   * Un archivo `--mcp-config` con los servidores que SÍ puede usar (la fase `uso`: un navegador).
   * Sigue valiendo `--strict-mcp-config`: ningún otro servidor del usuario ni del repo entra.
   */
  readonly mcp?: string;
  /** Las herramientas de ese servidor que se aprueban (`mcp__<servidor>__<herramienta>`), además de `herramientas`. */
  readonly herramientasMcp?: readonly string[];
}

export function argumentosDeLectura(lectura: Pick<Lectura, "modelo" | "vueltas" | "herramientas" | "voz" | "mcp" | "herramientasMcp">): string[] {
  return [
    "-p",
    "--output-format",
    ...(lectura.voz ? ["stream-json", "--verbose"] : ["json"]),
    ...(lectura.modelo ? ["--model", lectura.modelo] : []),
    "--max-turns",
    String(lectura.vueltas),
    "--permission-mode",
    "dontAsk",
    ...SOLO_CONFIG_DEL_USUARIO,
    // --tools deja las herramientas a mano pero no las aprueba, y en dontAsk la que pide permiso
    // (WebSearch, WebFetch) se deniega: el scout se quedó sin web y volvía «sin nada nuevo» (23/10).
    // Se aprueban exactamente las mismas que se dejan, ni una más.
    "--allowedTools",
    [...lectura.herramientas, ...(lectura.herramientasMcp ?? [])].join(","),
    // Antes de --tools, que se lleva todos los argumentos que le siguen.
    ...(lectura.mcp ? ["--mcp-config", lectura.mcp] : []),
    // Va al final: --tools se lleva todos los argumentos que le siguen.
    "--tools",
    lectura.herramientas.join(","),
  ];
}

/** Corre y devuelve lo que contestó y cuánto costó. Un error del CLI viene con su motivo, no «devolvió un error». */
export async function leerConClaude(prompt: string, lectura: Lectura): Promise<{ texto: string; gastado: number }> {
  const cmd = lectura.cmd ?? "claude";
  const listo = prepararComando(cmd, argumentosDeLectura(lectura));
  if (!listo) throw new Error(`no encontré «${cmd}» en el PATH: instalá Claude Code (claude.com/claude-code) o sumá su carpeta al PATH`);
  const oyente = lectura.voz ? oyenteDeClaude(lectura.voz) : undefined;
  const salida = await conCuentaDeClaude(
    async (deLaCuenta) => (await correrConPrompt(listo.cmd, listo.args, prompt, lectura.cwd, lectura.tope, { ...lectura.entorno, ...deLaCuenta }, listo.verbatim, oyente, lectura.senal)).salida,
    (crudo) => {
      const leido = leerSalida(crudo);
      return leido.is_error === true && esLimiteDeUso(mensajeDeError(leido));
    },
  );
  const leido = leerSalida(salida);
  if (leido.is_error) throw new Error(mensajeDeError(leido));
  return { texto: leido.result ?? "", gastado: leido.total_cost_usd ?? 0 };
}
