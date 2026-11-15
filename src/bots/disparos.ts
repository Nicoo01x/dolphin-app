import { mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { escribirDeUna } from "../nucleo/escritura.js";
import { carpetaDelBot, idEnOrden } from "./almacen-rutas.js";
import type { Bot } from "./almacen.js";

export type EstadoDeDisparo = "pendiente" | "corriendo" | "hecho" | "fallido";
export interface DisparoGuardado {
  readonly id: string;
  readonly mensaje: string;
  readonly creado: string;
  readonly estado: EstadoDeDisparo;
  readonly vueltas?: number;
  readonly modelo?: string;
  readonly herramientas?: readonly string[];
  readonly iniciado?: string;
  readonly terminado?: string;
  readonly error?: string;
}

const LIMITE_POR_HORA = 20;
const carpeta = (bot: Bot): string => join(carpetaDelBot(bot.id), "disparos");
// Alcanza con la memoria: los disparos los toma solo el servicio, y «bots correr» corre de a un
// proceso por máquina (tomarLockDeBots).
const reclamados = new Set<string>();
const llave = (bot: Bot, id: string): string => `${carpeta(bot)}:${id}`;

export async function encolarDisparo(
  bot: Bot,
  mensaje: string,
  opciones: { readonly vueltas?: number; readonly modelo?: string; readonly herramientas?: readonly string[] } = {},
  ahora = new Date(),
): Promise<DisparoGuardado> {
  const texto = mensaje.trim();
  if (!texto) throw new Error("el disparo necesita un mensaje");
  if (opciones.vueltas !== undefined && (!Number.isInteger(opciones.vueltas) || opciones.vueltas < 1)) throw new Error("las vueltas del disparo deben ser positivas");
  const dato: DisparoGuardado = {
    id: idEnOrden(ahora),
    mensaje: texto,
    creado: ahora.toISOString(),
    estado: "pendiente",
    ...(opciones.vueltas === undefined ? {} : { vueltas: opciones.vueltas }),
    ...(opciones.modelo?.trim() ? { modelo: opciones.modelo.trim() } : {}),
    ...(opciones.herramientas?.length ? { herramientas: [...opciones.herramientas] } : {}),
  };
  await mkdir(carpeta(bot), { recursive: true });
  await escribirDeUna(join(carpeta(bot), `${dato.id}.json`), `${JSON.stringify(dato, null, 2)}\n`);
  return dato;
}

async function guardar(bot: Bot, dato: DisparoGuardado): Promise<void> {
  await escribirDeUna(join(carpeta(bot), `${dato.id}.json`), `${JSON.stringify(dato, null, 2)}\n`);
}

export async function listarDisparos(bot: Bot): Promise<DisparoGuardado[]> {
  const nombres = (await readdir(carpeta(bot)).catch(() => [] as string[])).filter((x) => x.endsWith(".json")).sort();
  const salidas: DisparoGuardado[] = [];
  for (const nombre of nombres) {
    try {
      const d = JSON.parse(await readFile(join(carpeta(bot), nombre), "utf8")) as Partial<DisparoGuardado>;
      if (typeof d.id !== "string" || typeof d.mensaje !== "string" || typeof d.creado !== "string" || !["pendiente", "corriendo", "hecho", "fallido"].includes(String(d.estado))) continue;
      salidas.push({
        id: d.id,
        mensaje: d.mensaje,
        creado: d.creado,
        estado: d.estado as EstadoDeDisparo,
        ...(typeof d.vueltas === "number" ? { vueltas: d.vueltas } : {}),
        ...(typeof d.modelo === "string" ? { modelo: d.modelo } : {}),
        ...(Array.isArray(d.herramientas) ? { herramientas: d.herramientas.filter((x): x is string => typeof x === "string") } : {}),
        ...(typeof d.iniciado === "string" ? { iniciado: d.iniciado } : {}),
        ...(typeof d.terminado === "string" ? { terminado: d.terminado } : {}),
        ...(typeof d.error === "string" ? { error: d.error } : {}),
      });
    } catch {
      /* Un disparo roto queda visible como archivo, pero no frena la cola. */
    }
  }
  return salidas;
}

export async function tomarDisparo(bot: Bot, ahora = new Date()): Promise<DisparoGuardado | undefined> {
  let salidas = await listarDisparos(bot);
  // Después de un corte de servicio, un «corriendo» no tiene dueño: se vuelve a intentar una vez.
  for (const salida of salidas.filter((x) => x.estado === "corriendo" && !reclamados.has(llave(bot, x.id)))) {
    const { iniciado: _iniciado, ...recuperado } = salida;
    await guardar(bot, { ...recuperado, estado: "pendiente" });
  }
  if (salidas.some((x) => x.estado === "corriendo" && !reclamados.has(llave(bot, x.id)))) salidas = await listarDisparos(bot);
  const hora = ahora.getTime() - 60 * 60_000;
  // El tope cuenta por cuándo arrancaron: con `creado`, una cola atrasada de disparos viejos corría entera de golpe.
  const usados = salidas.filter((x) => x.estado !== "pendiente" && x.iniciado !== undefined && Date.parse(x.iniciado) >= hora).length;
  if (usados >= LIMITE_POR_HORA) return undefined;
  const siguiente = salidas.find((x) => x.estado === "pendiente");
  if (!siguiente) return undefined;
  const corriendo: DisparoGuardado = { ...siguiente, estado: "corriendo", iniciado: ahora.toISOString() };
  await guardar(bot, corriendo);
  reclamados.add(llave(bot, corriendo.id));
  return corriendo;
}

export async function terminarDisparo(bot: Bot, disparo: DisparoGuardado, ahora = new Date(), error?: string): Promise<void> {
  reclamados.delete(llave(bot, disparo.id));
  await guardar(bot, {
    ...disparo,
    estado: error ? "fallido" : "hecho",
    terminado: ahora.toISOString(),
    ...(error ? { error: error.slice(0, 500) } : {}),
  });
}

/** Uno que no llegó a correr (el presupuesto lo pausó) vuelve a la cola sin contar para el tope. */
export async function devolverDisparo(bot: Bot, disparo: DisparoGuardado): Promise<void> {
  reclamados.delete(llave(bot, disparo.id));
  const { iniciado: _iniciado, ...pendiente } = disparo;
  await guardar(bot, { ...pendiente, estado: "pendiente" });
}

export const limiteDeDisparos = LIMITE_POR_HORA;
