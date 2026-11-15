import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { carpetaDeDolphin, escribirDeUna, leerEstado } from "./escritura.js";
import { leerMemoria, recordarCandidato } from "./memoria.js";

/**
 * Lo que el repo ya les dice a los agentes (CLAUDE.md, AGENTS.md) entra a la memoria de Dolphin sin
 * gastar un token: cada viñeta es una regla candidata que espera tu ok, con de dónde salió. Se
 * importa una vez por versión del archivo (se recuerda su hash), y lo repetido no entra dos veces.
 *
 * No reemplaza al entrenador (que destila con un modelo); es lo que se puede hacer al abrir el repo,
 * al instante y gratis.
 */

export const ARCHIVOS_DE_INSTRUCCIONES = ["CLAUDE.md", ".claude/CLAUDE.md", "AGENTS.md"] as const;

/** Cuántas reglas trae como mucho de un archivo: un CLAUDE.md de mil viñetas no puede inundar la memoria. */
export const TOPE_POR_ARCHIVO = 40;

/** Una viñeta en texto plano: sin negritas, código en línea ni links (queda el texto del link). */
function limpiar(linea: string): string {
  return linea
    .replace(/^\[[ xX]\]\s+/, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*|__|`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Las reglas de un archivo de instrucciones: sus viñetas, fuera de los bloques de código. */
export function reglasDeInstrucciones(texto: string, tope = TOPE_POR_ARCHIVO): { dicho: string; linea: number }[] {
  const reglas: { dicho: string; linea: number }[] = [];
  const vistas = new Set<string>();
  let enCodigo = false;
  for (const [i, crudo] of texto.split(/\r?\n/).entries()) {
    if (/^\s*(```|~~~)/.test(crudo)) {
      enCodigo = !enCodigo;
      continue;
    }
    if (enCodigo) continue;
    const vineta = /^\s*(?:[-*+]|\d+[.)])\s+(.+)$/.exec(crudo);
    if (!vineta) continue;
    const dicho = limpiar(vineta[1]!);
    // Ni un título de lista («Comandos:»), ni una ruta suelta, ni una oración kilométrica.
    if (dicho.length < 12 || dicho.length > 280 || dicho.endsWith(":") || !/\s/.test(dicho)) continue;
    const clave = dicho.toLowerCase();
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    reglas.push({ dicho, linea: i + 1 });
    if (reglas.length >= tope) break;
  }
  return reglas;
}

export interface Importado {
  readonly archivo: string;
  /** Cuántas reglas nuevas quedaron esperando tu ok. */
  readonly nuevas: number;
}

const rutaDeLoImportado = (repo: string) => join(repo, ".dolphin", "instrucciones-importadas.json");

/** Importa lo que cambió desde la última vez. Devuelve lo que sumó por archivo (vacío si no había nada nuevo). */
export async function importarInstrucciones(repo: string): Promise<Importado[]> {
  const hechos = await leerEstado(rutaDeLoImportado(repo), {} as Record<string, string>, (d) => (d && typeof d === "object" ? (d as Record<string, string>) : {}));
  const importados: Importado[] = [];
  const nuevosHechos = { ...hechos };
  for (const archivo of ARCHIVOS_DE_INSTRUCCIONES) {
    const texto = await readFile(join(repo, archivo), "utf8").catch(() => null);
    if (texto === null) continue;
    const hash = createHash("sha256").update(texto).digest("hex").slice(0, 16);
    if (hechos[archivo] === hash) continue;
    const antes = (await leerMemoria(repo)).recuerdos.length;
    let fallaron = 0;
    for (const { dicho, linea } of reglasDeInstrucciones(texto)) {
      await recordarCandidato(repo, dicho, `Lo dice ${archivo} (línea ${linea}).`).catch(() => {
        fallaron++;
        return null;
      });
    }
    const despues = (await leerMemoria(repo)).recuerdos.length;
    if (fallaron === 0) nuevosHechos[archivo] = hash;
    if (despues > antes) importados.push({ archivo, nuevas: despues - antes });
  }
  if (JSON.stringify(nuevosHechos) !== JSON.stringify(hechos)) {
    await carpetaDeDolphin(repo);
    await escribirDeUna(rutaDeLoImportado(repo), `${JSON.stringify(nuevosHechos, null, 2)}\n`);
  }
  return importados;
}
