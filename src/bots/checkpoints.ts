import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { enFila, escribirDeUna } from "../nucleo/escritura.js";
import { carpetaDeBots, type Bot } from "./almacen.js";

const ejecutar = promisify(execFile);
const archivo = (id: string) => join(carpetaDeBots(), id, "checkpoint.json");

export interface Checkpoint {
  readonly creado: string;
  readonly repo: string;
  readonly stash?: string;
  readonly cabeza: string;
}

export type EjecutarGit = (repo: string, argumentos: readonly string[]) => Promise<{ readonly salida: string }>;

const gitPorDefecto: EjecutarGit = async (repo, argumentos) => {
  const resultado = await ejecutar("git", ["-C", repo, ...argumentos], { windowsHide: true });
  return { salida: resultado.stdout };
};

export async function crearCheckpoint(bot: Bot, ejecutarGit: EjecutarGit = gitPorDefecto): Promise<Checkpoint | undefined> {
  const repo = bot.carpeta;
  try {
    await ejecutarGit(repo, ["rev-parse", "--is-inside-work-tree"]);
  } catch {
    return undefined;
  }
  const cabeza = (await ejecutarGit(repo, ["rev-parse", "HEAD"])).salida.trim();
  // `stash create` arma una foto sin tocar ni la rama ni el índice de la persona.
  const stash = (await ejecutarGit(repo, ["stash", "create", `dolphin bot ${bot.id}`])).salida.trim();
  const checkpoint: Checkpoint = {
    creado: new Date().toISOString(),
    repo,
    cabeza,
    ...(stash ? { stash } : {}),
  };
  await enFila(archivo(bot.id), async () => escribirDeUna(archivo(bot.id), `${JSON.stringify(checkpoint, null, 2)}\n`));
  return checkpoint;
}

export async function leerCheckpoint(id: string): Promise<Checkpoint | undefined> {
  try {
    const dato = JSON.parse(await readFile(archivo(id), "utf8")) as Partial<Checkpoint>;
    if (typeof dato.creado !== "string" || typeof dato.repo !== "string" || typeof dato.cabeza !== "string") return undefined;
    return { creado: dato.creado, repo: dato.repo, cabeza: dato.cabeza, ...(dato.stash ? { stash: dato.stash } : {}) };
  } catch {
    return undefined;
  }
}

export async function deshacerCheckpoint(id: string, ejecutarGit: EjecutarGit = gitPorDefecto): Promise<Checkpoint> {
  const checkpoint = await leerCheckpoint(id);
  if (!checkpoint) throw new Error("ese bot no tiene un checkpoint para deshacer");
  // Se repone la foto de trabajo directamente: aplicar el stash sobre los cambios nuevos del bot
  // puede producir un conflicto justo cuando la intención de «deshacer» es sacarlos.
  if (checkpoint.stash) await ejecutarGit(checkpoint.repo, ["read-tree", "-u", "--reset", checkpoint.stash]);
  else await ejecutarGit(checkpoint.repo, ["read-tree", "-u", "--reset", checkpoint.cabeza]);
  await rm(archivo(id), { force: true });
  return checkpoint;
}
