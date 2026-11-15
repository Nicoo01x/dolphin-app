import { appendFile, mkdir, open, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { procesoVivo } from "../agentes/ejecutar.js";
import { enFila } from "../nucleo/escritura.js";
import { archivoDelBot, carpetaDeBots } from "./almacen-rutas.js";

export type QuienDelHistorial = "vos" | "bot" | "rutina" | "sistema";
export interface EntradaDeHistorial {
  readonly cuando: string;
  readonly quien: QuienDelHistorial;
  readonly texto: string;
}
const leerTexto = async (ruta: string): Promise<string> => readFile(ruta, "utf8").catch(() => "");

export async function anotarHistorial(id: string, quien: QuienDelHistorial, texto: string, cuando = new Date()): Promise<void> {
  if (!["vos", "bot", "rutina", "sistema"].includes(quien)) throw new Error("quién inválido");
  const entrada: EntradaDeHistorial = { cuando: cuando.toISOString(), quien, texto };
  await enFila(archivoDelBot(id, "historial.jsonl"), () => appendFile(archivoDelBot(id, "historial.jsonl"), `${JSON.stringify(entrada)}\n`, "utf8"));
}
export async function tomarLockDeBots(): Promise<(() => Promise<void>) | undefined> {
  const ruta = join(carpetaDeBots(), ".correr.lock");
  await mkdir(carpetaDeBots(), { recursive: true });
  for (;;) {
    try {
      const descriptor = await open(ruta, "wx");
      await descriptor.writeFile(`${process.pid}\n`, "utf8");
      await descriptor.close();
      return async () => rm(ruta, { force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const pid = Number.parseInt(await readFile(ruta, "utf8").catch(() => ""), 10);
      if (!Number.isInteger(pid)) return undefined;
      if (procesoVivo(pid)) return undefined;
      await rm(ruta, { force: true });
    }
  }
}
export async function leerHistorial(id: string, ultimos = 50): Promise<EntradaDeHistorial[]> {
  const salidas: EntradaDeHistorial[] = [];
  for (const linea of (await leerTexto(archivoDelBot(id, "historial.jsonl"))).split(/\r?\n/).filter(Boolean)) {
    try {
      const d = JSON.parse(linea) as Record<string, unknown>;
      if (typeof d.cuando === "string" && typeof d.quien === "string" && ["vos", "bot", "rutina", "sistema"].includes(d.quien) && typeof d.texto === "string") salidas.push(d as unknown as EntradaDeHistorial);
    } catch {
      /* una línea rota no tumba la charla */
    }
  }
  return salidas.slice(-Math.max(0, ultimos));
}
