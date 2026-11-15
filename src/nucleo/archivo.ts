import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { carpetaDeDolphin, enFila, escribirDeUna } from "./escritura.js";
import type { Cosecha } from "./tipos.js";

/**
 * Las cosechas quedan en disco.
 *
 * No es un detalle de implementación: es lo que separa a Dolphin de un
 * comando que escupe texto y se olvida. La pantalla lee de acá, el parte
 * de la mañana se arma de acá, y comparar dos turnos es comparar dos
 * archivos.
 *
 * Viven en `.dolphin/cosechas/` dentro del repo que se está trabajando,
 * porque pertenecen a ese repo y no a la máquina.
 */

export const CARPETA = ".dolphin";

export interface CosechaGuardada extends Cosecha {
  readonly cuando: string;
  readonly repo: string;
}

/**
 * El `entorno` del universo lleva la DATABASE_URL con su contraseña, y la
 * cosecha se escribe a disco y se sirve por HTTP. La pantalla no lo usa
 * para nada: se va antes de guardar.
 */
function sinSecretos<T extends { universo: { entorno?: unknown } }>(candidato: T): T {
  const { entorno: _afuera, ...universo } = candidato.universo as Record<string, unknown>;
  return { ...candidato, universo } as T;
}

// La carpeta que se ignora a sí misma vive con la escritura: la usa todo el que escribe en `.dolphin/`.
export { carpetaDeDolphin };

export async function guardarCosecha(cosecha: Cosecha, repo: string): Promise<string> {
  const carpeta = await carpetaDeDolphin(repo, "cosechas");

  const guardada: CosechaGuardada = {
    ...cosecha,
    candidatos: cosecha.candidatos.map(sinSecretos),
    ...(cosecha.ganador ? { ganador: sinSecretos(cosecha.ganador) } : {}),
    cuando: new Date().toISOString(),
    repo,
  };

  // El nombre ordena por fecha al listar, sin tener que abrir los archivos.
  const nombre = `${guardada.cuando.replace(/[:.]/g, "-")}.json`;
  const texto = JSON.stringify(guardada, null, 2);

  // De una sola vez (ver escritura.ts): la pantalla las relee cada pocos segundos.
  await escribirDeUna(join(carpeta, nombre), texto);
  // `ultima.json` es lo que abre la pantalla al arrancar: así no tiene que
  // saber nada del formato de los nombres.
  await escribirDeUna(join(repo, CARPETA, "ultima.json"), texto);

  return join(carpeta, nombre);
}

export async function leerUltimaCosecha(repo: string): Promise<CosechaGuardada | undefined> {
  try {
    const texto = await readFile(join(repo, CARPETA, "ultima.json"), "utf8");
    return JSON.parse(texto) as CosechaGuardada;
  } catch {
    // No hay cosecha todavía: es el estado vacío, no un error.
    return undefined;
  }
}

export async function listarCosechas(repo: string, cuantas = 20): Promise<string[]> {
  try {
    const carpeta = join(repo, CARPETA, "cosechas");
    const archivos = await readdir(carpeta);
    return archivos
      .filter((a) => a.endsWith(".json"))
      .sort()
      .reverse()
      .slice(0, cuantas)
      .map((a) => join(carpeta, a));
  } catch {
    return [];
  }
}

export async function leerCosecha(ruta: string): Promise<CosechaGuardada> {
  return JSON.parse(await readFile(ruta, "utf8")) as CosechaGuardada;
}

/**
 * Le anota algo a una cosecha ya guardada —el PR que se abrió—, en su
 * archivo y en ultima.json si es la última. Sin esto, el link del PR se
 * perdería con el próximo refresco.
 */
export function anotarCosecha(repo: string, cuando: string, cambios: Partial<Cosecha>): Promise<void> {
  const ruta = join(repo, CARPETA, "cosechas", `${cuando.replace(/[:.]/g, "-")}.json`);
  return enFila(ruta, async () => {
    const texto = JSON.stringify({ ...(await leerCosecha(ruta)), ...cambios }, null, 2);
    await escribirDeUna(ruta, texto);
    if ((await leerUltimaCosecha(repo))?.cuando === cuando) {
      await escribirDeUna(join(repo, CARPETA, "ultima.json"), texto);
    }
  });
}
