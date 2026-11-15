import { rm } from "node:fs/promises";
import { join } from "node:path";
import { git, gitDice } from "./git.js";
import { archivosTocados, globARegex } from "./politica.js";
import type { Verificador } from "./tipos.js";

/**
 * La configuración que se ejecuta sola.
 *
 * `claude -p` carga la configuración del repo sin preguntar: corre los
 * hooks de `.claude/settings.json` y conecta los servidores de `.mcp.json`,
 * aunque la carpeta no sea de confianza (lo dice su documentación). Para
 * Dolphin eso abre dos agujeros:
 * - un repo clonado o una tarea de afuera traen su configuración, y el
 *   agente la ejecuta;
 * - lo que el agente escribe ahí en una vuelta se ejecuta en la siguiente,
 *   y también cuando el revisor lee su rama: un hook se saltea
 *   `--disallowedTools`, así que un `git push` prohibido por la política
 *   pasaría por un hook.
 *
 * Tres tapas, una por agujero: el que revisa y el que planifica cargan
 * solo la configuración del usuario; el que escribe también, si el repo o
 * la tarea son de afuera; y en un repo propio, lo que el agente cambie acá
 * se deshace antes de cada vuelta y el portón no lo deja salir, salvo que
 * la tarea lo haya pedido.
 */

export const CONFIG_QUE_EJECUTA: readonly string[] = [
  ".claude/settings.json",
  ".claude/settings.local.json",
  ".claude/hooks/**",
  // Una skill o un subagente pueden declarar `hooks:` en su encabezado: se ejecutan igual.
  ".claude/skills/**",
  ".claude/agents/**",
  ".mcp.json",
];

/** Para `claude -p`: solo la configuración del usuario, y ningún servidor MCP que no se le pase a mano. */
export const SOLO_CONFIG_DEL_USUARIO: readonly string[] = ["--setting-sources", "user", "--strict-mcp-config"];

const reglas = CONFIG_QUE_EJECUTA.map((g) => globARegex(g));

/** Cuáles de estos archivos son configuración que se ejecuta. */
export function tocaConfigQueEjecuta(archivos: readonly string[]): string[] {
  return archivos.map((a) => a.replace(/\\/g, "/")).filter((a) => reglas.some((r) => r.test(a)));
}

/**
 * La persona lo pidió: la tarea nombra esa configuración. Un «hook» a secas
 * no alcanza: los de React también se llaman así, y «arreglá el hook del
 * carrito» dejaría pasar un hook de Claude plantado de contrabando. Lo mismo
 * «mcp» suelto: «arreglá el endpoint /mcp» no es conectar un servidor.
 */
export function pidioConfig(tarea: string): boolean {
  return /\.claude[\\/]|\.mcp\.json|servidor(?:es)?\s+(?:de\s+)?mcp(?!\p{L})|mcp\s+servers?|hooks?\s+de\s+claude|claude\s+code\s+hooks?/iu.test(tarea);
}

/**
 * Deja esa configuración como estaba en el commit del worktree: lo
 * versionado vuelve a su contenido y lo que el agente creó se borra.
 * Devuelve lo que deshizo.
 */
export async function restaurarConfigEjecutable(worktree: string): Promise<string[]> {
  const tocados = tocaConfigQueEjecuta(await archivosTocados(worktree).catch(() => []));
  for (const archivo of tocados) {
    const versionado = await gitDice(["cat-file", "-e", `HEAD:${archivo}`], worktree);
    if (versionado) await git(["checkout", "HEAD", "--", archivo], worktree).catch(() => {});
    else await rm(join(worktree, archivo), { force: true }).catch(() => {});
  }
  // Lo que estaba en el índice (una foto vuelta atrás lo deja ahí) sale también: si no, el commit se lo lleva.
  if (tocados.length > 0) await git(["reset", "-q", "--", ...tocados], worktree).catch(() => {});
  return tocados;
}

/** Una fase del portón, gratis y siempre: una rama no sale con configuración que se ejecuta, salvo que se pida. */
export function verificadorDeConfigEjecutable(tarea: string): Verificador {
  return {
    nombre: "configuración",
    costo: "gratis",
    async correr(universo) {
      const tocados = tocaConfigQueEjecuta(await archivosTocados(universo.ruta));
      if (tocados.length === 0 || pidioConfig(tarea)) {
        return { paso: true, detalle: "configuración: no tocó nada que se ejecute solo", gastado: 0 };
      }
      return {
        paso: false,
        detalle: `configuración: tocó ${tocados[0]}${tocados.length > 1 ? ` (y ${tocados.length - 1} más)` : ""} — eso lo ejecuta Claude sin preguntar, y la tarea no lo pidió`,
        evidencia: tocados.join("\n"),
        gastado: 0,
      };
    },
  };
}
