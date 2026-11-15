import { createHash } from "node:crypto";
import { access, mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { git } from "./git.js";
import { escribirDeUna } from "./escritura.js";
import { revisarRepo } from "./repo.js";


/**
 * Los proyectos de esta máquina, como en DOLPHIN: una lista con logo y nombre
 * para pasar de un repo a otro sin reiniciar nada.
 *
 * La lista es de la PERSONA, no de un repo: vive en `~/.dolphin/proyectos.json`
 * (o en `DOLPHIN_HOME`). Lo de cada proyecto —memoria, perfil, cosechas,
 * cifras— sigue en su propio `.dolphin/`: cambiar de proyecto es cambiar de
 * memoria, sin mezclar nada.
 */

export interface Proyecto {
  /** Sale de la ruta: el mismo repo es siempre el mismo proyecto. */
  readonly id: string;
  readonly nombre: string;
  readonly ruta: string;
  readonly agregado: string;
  /** El logo del repo, relativo a su carpeta, si tiene uno (ver logoDe). */
  readonly logo?: string;
  /** De dónde se clonó, si se clonó desde Dolphin. */
  readonly origen?: string;
}

export const hogarDeDolphin = (): string => process.env.DOLPHIN_HOME ?? join(homedir(), ".dolphin");

const archivo = (hogar: string) => join(hogar, "proyectos.json");

export const idDe = (ruta: string): string =>
  createHash("sha1").update(resolve(ruta).replace(/\\/g, "/").toLowerCase()).digest("hex").slice(0, 10);

export async function leerProyectos(hogar = hogarDeDolphin()): Promise<Proyecto[]> {
  try {
    const datos = JSON.parse(await readFile(archivo(hogar), "utf8")) as { proyectos?: unknown };
    return Array.isArray(datos.proyectos) ? (datos.proyectos as Proyecto[]) : [];
  } catch {
    return [];
  }
}

async function guardar(hogar: string, proyectos: readonly Proyecto[]): Promise<void> {
  await mkdir(hogar, { recursive: true });
  await escribirDeUna(archivo(hogar), `${JSON.stringify({ version: 1, proyectos }, null, 2)}\n`);
}

/**
 * Suma un repo que ya está en disco. Tiene que servir para sembrar (ver
 * repo.ts); si ya estaba, devuelve el que había, con el logo al día.
 */
export async function sumarProyecto(ruta: string, hogar = hogarDeDolphin(), extra: { origen?: string } = {}): Promise<Proyecto> {
  const absoluta = resolve(ruta);
  const revision = await revisarRepo(absoluta);
  if (!revision.sirve) throw new Error(revision.porQue ?? "ese repo no sirve para sembrar");

  const proyectos = await leerProyectos(hogar);
  const id = idDe(absoluta);
  const logo = await logoDe(absoluta);
  const anterior = proyectos.find((p) => p.id === id);
  const proyecto: Proyecto = {
    id,
    nombre: anterior?.nombre ?? basename(absoluta),
    ruta: absoluta,
    agregado: anterior?.agregado ?? new Date().toISOString(),
    ...(logo ? { logo } : {}),
    ...((extra.origen ?? anterior?.origen) ? { origen: (extra.origen ?? anterior?.origen)! } : {}),
  };
  await guardar(hogar, [...proyectos.filter((p) => p.id !== id), proyecto]);
  return proyecto;
}

/**
 * Clona un repo de una URL dentro de `base` y lo suma. Solo URLs de git
 * (https, ssh o git@): nada de rutas locales disfrazadas ni opciones
 * colándose en los argumentos de git.
 */
export async function clonarProyecto(url: string, base: string, hogar = hogarDeDolphin()): Promise<Proyecto> {
  const limpia = url.trim();
  if (!/^(https:\/\/|ssh:\/\/|git@)[^\s]+$/.test(limpia)) {
    throw new Error("Esa no parece la URL de un repo: tiene que empezar con https://, ssh:// o git@.");
  }
  const nombre = basename(limpia.replace(/\/+$/, "")).replace(/\.git$/, "").replace(/[^\w.-]/g, "-") || "repo";
  const destino = join(base, nombre);
  if (await existe(destino)) throw new Error(`Ya hay una carpeta «${destino}». Sumala como proyecto o elegí otro lugar.`);
  await mkdir(base, { recursive: true });
  // «--» corta las opciones: la URL nunca se lee como un flag de git.
  await git(["clone", "--", limpia, destino], base, { tope: 10 * 60_000 });
  return sumarProyecto(destino, hogar, { origen: limpia });
}

export async function quitarProyecto(id: string, hogar = hogarDeDolphin()): Promise<boolean> {
  const proyectos = await leerProyectos(hogar);
  const quedan = proyectos.filter((p) => p.id !== id);
  if (quedan.length === proyectos.length) return false;
  // Sacarlo de la lista no borra nada del disco: el repo es de quien lo tiene.
  await guardar(hogar, quedan);
  return true;
}

/** Dónde suelen vivir los logos de un repo, del más específico al más genérico. */
const CANDIDATOS_DE_LOGO = [
  "logo.svg",
  "logo.png",
  "public/logo.svg",
  "public/logo.png",
  "assets/logo.svg",
  "assets/logo.png",
  ".github/logo.svg",
  ".github/logo.png",
  "public/favicon.svg",
  "static/favicon.svg",
  "app/icon.svg",
  "src/app/icon.svg",
  "public/favicon.png",
  "public/apple-touch-icon.png",
  "public/favicon.ico",
  "static/favicon.ico",
  "favicon.ico",
];

/** El logo del repo si tiene uno a la vista; si no, la consola dibuja la inicial. */
export async function logoDe(ruta: string): Promise<string | undefined> {
  for (const candidato of CANDIDATOS_DE_LOGO) {
    if (await existe(join(ruta, candidato))) return candidato;
  }
  return undefined;
}

async function existe(ruta: string): Promise<boolean> {
  return access(ruta).then(
    () => true,
    () => false,
  );
}

/** Un proyecto que entró clonando una URL: su configuración es de afuera (ver config-ejecutable.ts). */
export async function esClonado(ruta: string, hogar = hogarDeDolphin()): Promise<boolean> {
  const id = idDe(ruta);
  return (await leerProyectos(hogar).catch(() => [])).some((proyecto) => proyecto.id === id && Boolean(proyecto.origen));
}
