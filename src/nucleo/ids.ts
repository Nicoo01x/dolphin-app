import { randomUUID } from "node:crypto";

/**
 * El id de lo que se guarda en `.dolphin/`: asuntos (`a`), recuerdos (`m`),
 * notas (`n`) y planes (`p`). La letra dice de qué es, la hora en base 36
 * los ordena y el resto no se repite. Antes cada archivo armaba el suyo con
 * cuatro letras de Math.random: dos del mismo milisegundo podían chocar, y
 * un id repetido es un «descartar» que se lleva el asunto equivocado.
 */
export function nuevoId(prefijo: string, cuando = Date.now()): string {
  return `${prefijo}${cuando.toString(36)}${randomUUID().replace(/-/g, "").slice(0, 8)}`;
}
