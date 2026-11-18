import { cp, mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { escribirDeUna } from "../nucleo/escritura.js";
import { carpetaDeBots, carpetaDelBot, idValido } from "./almacen-rutas.js";
import { leerBot, type Bot } from "./almacen.js";

/**
 * Llevar un bot de una máquina a otra (la app lo lleva a tu servidor). El bot es su carpeta: se
 * copia entera, y del otro lado se le cambia lo único que no viaja, la carpeta donde trabaja, que es
 * una ruta de la máquina de origen.
 *
 * Por qué acá y no en la app: el formato de la carpeta es del núcleo, y una segunda copia de esa
 * escritura terminaría distinta.
 */

/** Lo que es de esta máquina y no tiene sentido del otro lado: candados y lo que esperaba un «dale». */
const NO_VIAJA = new Set([".correr.lock", "pendiente.json"]);

const existe = (ruta: string): Promise<boolean> =>
  stat(ruta).then(
    () => true,
    () => false,
  );

export interface ImportarBot {
  /** La carpeta del bot, tal como llegó (una copia de `~/.dolphin/bots/<id>/`). */
  readonly origen: string;
  /** Dónde va a trabajar en esta máquina; se crea si no está. */
  readonly carpeta: string;
  /** Pisa un bot que ya está con ese id: llevarlo de nuevo, después de un intento que se cortó. */
  readonly reemplazar?: boolean;
}

export async function importarBot({ origen, carpeta, reemplazar = false }: ImportarBot): Promise<Bot> {
  const datos = JSON.parse(await readFile(join(origen, "bot.json"), "utf8")) as { id?: unknown };
  if (typeof datos.id !== "string" || !idValido(datos.id)) throw new Error("la carpeta no tiene un bot.json válido");
  const destino = carpetaDelBot(datos.id);
  if ((await existe(destino)) && !reemplazar) throw new Error(`ya hay un bot «${datos.id}» en esta máquina`);
  await rm(destino, { recursive: true, force: true });
  await mkdir(carpetaDeBots(), { recursive: true });
  await cp(origen, destino, { recursive: true, filter: (ruta) => !NO_VIAJA.has(basename(ruta)) });
  await mkdir(carpeta, { recursive: true });
  const bot = { ...(JSON.parse(await readFile(join(destino, "bot.json"), "utf8")) as Bot), carpeta };
  await escribirDeUna(join(destino, "bot.json"), `${JSON.stringify(bot, null, 2)}\n`);
  // leerBot valida: un bot.json roto no queda instalado a medias.
  try {
    return await leerBot(datos.id);
  } catch (error) {
    await rm(destino, { recursive: true, force: true });
    throw error;
  }
}

/** Dónde queda guardado un bot que se fue a otra máquina: al lado de los bots, fuera de la manada. */
export const carpetaDeApartados = (): string => join(dirname(carpetaDeBots()), "bots-en-servidor");

/**
 * Saca un bot de la manada de esta máquina sin borrarlo: el servicio de acá deja de correrlo (así no
 * hay dos corriendo el mismo bot) y la carpeta queda guardada por si hay que traerlo de vuelta.
 */
export async function apartarBot(id: string, ahora = new Date()): Promise<string> {
  const origen = carpetaDelBot(id);
  if (!(await existe(join(origen, "bot.json")))) throw new Error(`no hay un bot «${id}» en esta máquina`);
  await mkdir(carpetaDeApartados(), { recursive: true });
  const sello = ahora.toISOString().replace(/[:.]/g, "-");
  const destino = join(carpetaDeApartados(), (await existe(join(carpetaDeApartados(), id))) ? `${id}-${sello}` : id);
  await rename(origen, destino);
  return destino;
}
