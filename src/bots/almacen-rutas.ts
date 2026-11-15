import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const slug = (nombre: string): string => {
  const limpio = nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return limpio || "bot";
};
export const idValido = (id: string): boolean => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id);
export const carpetaDeBots = (): string => resolve(process.env["DOLPHIN_BOTS_DIR"] || join(homedir(), ".dolphin", "bots"));
export const carpetaDelBot = (id: string): string => {
  if (!idValido(id)) throw new Error("el id del bot no es válido");
  return join(carpetaDeBots(), id);
};
export const archivoDelBot = (id: string, nombre: string): string => join(carpetaDelBot(id), nombre);
let secuencia = 0;
/**
 * Id de un archivo de cola: el milisegundo y un número de orden adelante, así ordenar los nombres es
 * ordenar por llegada. Con un UUID solo, un texto partido salía desordenado y los disparos no eran FIFO.
 */
export const idEnOrden = (ahora = new Date()): string => `${String(ahora.getTime()).padStart(15, "0")}-${String(secuencia++ % 1_000_000).padStart(6, "0")}-${randomUUID()}`;
