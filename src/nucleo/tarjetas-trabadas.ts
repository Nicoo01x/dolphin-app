import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { carpetaDeDolphin, escribirDeUna } from "./escritura.js";
import { procesoVivo } from "../agentes/ejecutar.js";
import { cambiarTarjeta, leerTablero, type Tarjeta } from "./tarjetas.js";

/**
 * Una tarjeta en Haciendo cuyo proceso murió no queda trabada.
 *
 * El equipo la pasa a Haciendo al arrancar y la saca al terminar (ver equipo/con-tarjeta.ts), pero
 * si el proceso se corta —se cerró la terminal, se apagó la máquina— nadie la sacaba y quedaba ahí
 * para siempre: el «dale» la rechazaba («ya la está haciendo el equipo») y no había cómo retomarla
 * más que moviéndola a mano.
 *
 * Es la misma idea que los asuntos de la bandeja (ver bandeja.ts): mientras trabaja, late. En
 * Windows un pid muerto se le da enseguida a otro programa, así que «el pid existe» no alcanza: se
 * pide también que el latido sea reciente.
 */

export const LATIDO_MS = 60_000;
const SIN_LATIDO_MS = 3 * LATIDO_MS;

const carpetaDeLatidos = (repo: string) => join(repo, ".dolphin", "latidos-tablero");
const rutaLatido = (repo: string, id: string) => join(carpetaDeLatidos(repo), `${id.replace(/[^\w-]/g, "_")}.json`);

/** Late por la tarjeta que está trabajando: «sigo acá». */
export async function latirTarjeta(repo: string, id: string, pid = process.pid, ahora = Date.now()): Promise<void> {
  await carpetaDeDolphin(repo, "latidos-tablero");
  await escribirDeUna(rutaLatido(repo, id), `${JSON.stringify({ pid, latido: ahora })}\n`);
}

/** Deja de latir: la tarjeta ya no la trabaja nadie. */
export async function dejarDeLatir(repo: string, id: string): Promise<void> {
  await rm(rutaLatido(repo, id), { force: true }).catch(() => {});
}

async function leerLatido(repo: string, id: string): Promise<{ pid?: number; latido?: number } | null> {
  try {
    return JSON.parse(await readFile(rutaLatido(repo, id), "utf8")) as { pid?: number; latido?: number };
  } catch {
    return null;
  }
}

/** ¿La sigue trabajando alguien? Sin latido, no: el que trabaja late. */
export async function laTrabajaAlguien(
  repo: string,
  t: Tarjeta,
  vivo: (pid: number) => boolean = procesoVivo,
  ahora = new Date(),
): Promise<boolean> {
  const latido = await leerLatido(repo, t.id);
  if (!latido?.latido) return false;
  const reciente = ahora.getTime() - latido.latido < SIN_LATIDO_MS;
  return reciente && (latido.pid === undefined || vivo(latido.pid));
}

/**
 * Las que estaban en Haciendo sin nadie trabajándolas vuelven a Para hacer, con la constancia del
 * corte. Solo las del equipo: una que tomaste vos y dejaste a medias es tuya, y moverla sería
 * meterse donde no va.
 */
export async function destrabarTarjetas(
  repo: string,
  vivo: (pid: number) => boolean = procesoVivo,
  ahora = new Date(),
): Promise<Tarjeta[]> {
  const tablero = await leerTablero(repo).catch(() => [] as Tarjeta[]);
  const destrabadas: Tarjeta[] = [];
  for (const t of tablero) {
    if (t.columna !== "haciendo" || t.quien?.trim().toLowerCase() !== "agentes") continue;
    if (await laTrabajaAlguien(repo, t, vivo, ahora)) continue;
    const cuando = ahora.toISOString();
    destrabadas.push(
      await cambiarTarjeta(repo, t.id, (actual) => ({
        ...actual,
        columna: "para-hacer",
        movida: cuando,
        historial: [...actual.historial, { columna: "para-hacer", cuando }],
        comentarios: [
          ...actual.comentarios,
          { quien: "dolphin", texto: "El proceso que la estaba haciendo se cortó antes de terminar: vuelve a Para hacer.", cuando },
        ],
      })),
    );
    await dejarDeLatir(repo, t.id);
  }
  return destrabadas;
}
