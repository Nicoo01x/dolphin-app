import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { leerConfig } from "./config.js";

/** El portón por defecto: los scripts de npm del repo que existan, en este orden. */
export async function verificarPorDefecto(repo: string): Promise<string[]> {
  try {
    const paquete = JSON.parse(await readFile(join(repo, "package.json"), "utf8")) as { scripts?: Record<string, string> };
    return ["typecheck", "lint", "test"].filter((s) => paquete.scripts?.[s]);
  } catch {
    return [];
  }
}

/**
 * Las fases con las que se prueba lo que hace un equipo cuando nadie las dijo: las del proyecto
 * (dolphin.config.json → terminal.verificar) y, si no hay, las de su package.json. Lo usan la
 * terminal y el equipo que arranca desde el tablero, así las dos puertas prueban igual.
 */
export async function portonDelProyecto(repo: string): Promise<string[]> {
  const delProyecto = (await leerConfig(repo)).terminal?.verificar;
  return delProyecto?.length ? [...delProyecto] : verificarPorDefecto(repo);
}
