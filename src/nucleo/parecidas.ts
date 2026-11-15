import type { Tarjeta } from "./tarjetas.js";

/**
 * Qué tarjeta del tablero se parece a la que estás por anotar.
 *
 * Importa más desde que las tarjetas entran solas: los TODO del código, los documentos, los issues.
 * Sin esto, «el botón de guardar no avisa cuando falla» y «arreglar que guardar no avise si falla»
 * son dos tarjetas, y el tablero se vuelve una lista de variantes de lo mismo que nadie limpia.
 *
 * Se compara texto, sin modelo: no cuesta nada y no hay que esperar a nadie. Dos medidas que se
 * complementan, porque cada una sola se equivoca de un modo distinto:
 * - **Las palabras que comparten** (Jaccard), que agarra lo mismo dicho en otro orden.
 * - **Los pedazos de tres letras**, que agarra «factura» contra «facturación» y los errores de
 *   tipeo, donde la de palabras ve dos cosas sin nada en común.
 *
 * El resultado es una sugerencia, nunca una decisión: lo que entra solo se saltea, y a una persona
 * se le muestra y decide ella. Dos tareas parecidas pueden ser dos tareas.
 */

/** Las que no distinguen nada: están en todas las tarjetas de cualquier tablero. */
const VACIAS = new Set([
  "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "al", "a", "en", "y", "o", "que",
  "se", "le", "lo", "por", "para", "con", "sin", "su", "sus", "es", "no", "si", "ya", "mas", "más",
  "the", "of", "to", "and", "in", "for", "is", "it",
]);

/** El texto como se compara: sin tildes, sin signos y sin las palabras que no distinguen nada. */
export function palabrasDe(texto: string): string[] {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((p) => p.length > 1 && !VACIAS.has(p));
}

/** Cuánto comparten dos conjuntos, de 0 a 1. */
function cuantoComparten(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let juntos = 0;
  for (const x of a) if (b.has(x)) juntos++;
  return juntos / (a.size + b.size - juntos);
}

/** Los pedazos de tres letras de un texto: lo que hace que «factura» y «facturación» se parezcan. */
function pedazos(palabras: readonly string[]): Set<string> {
  const todos = new Set<string>();
  for (const palabra of palabras) {
    const p = ` ${palabra} `;
    for (let i = 0; i + 3 <= p.length; i++) todos.add(p.slice(i, i + 3));
  }
  return todos;
}

/** Cuánto se parecen dos títulos, de 0 (nada) a 1 (lo mismo). */
export function cuantoSeParecen(uno: string, otro: string): number {
  const a = palabrasDe(uno);
  const b = palabrasDe(otro);
  if (a.length === 0 || b.length === 0) return 0;
  const porPalabras = cuantoComparten(new Set(a), new Set(b));
  const porPedazos = cuantoComparten(pedazos(a), pedazos(b));
  // Las palabras pesan más: compartirlas dice más que compartir letras. Pero los pedazos salvan
  // los casos en que la misma idea está escrita con otras formas de las mismas palabras.
  return porPalabras * 0.6 + porPedazos * 0.4;
}

/** Desde acá se parecen lo bastante como para mostrarlas y que decida una persona. */
export const SE_PARECEN = 0.45;
/** Y desde acá es casi seguro la misma: lo que entra solo no vuelve a entrar. */
export const ES_LA_MISMA = 0.72;

export interface Parecida {
  readonly tarjeta: Tarjeta;
  readonly cuanto: number;
}

/**
 * Las del tablero que se parecen al título, de la más parecida a la menos.
 *
 * Las que están en Hecho cuentan igual: que algo ya se haya hecho es justamente lo que querés saber
 * antes de anotarlo de nuevo.
 */
export function parecidasA(tablero: readonly Tarjeta[], titulo: string, desde = SE_PARECEN): Parecida[] {
  return tablero
    .map((tarjeta) => ({ tarjeta, cuanto: cuantoSeParecen(tarjeta.titulo, titulo) }))
    .filter((p) => p.cuanto >= desde)
    .sort((a, b) => b.cuanto - a.cuanto);
}

/** Los números que aparecen en un título: «arreglar el issue 42» → {42}. */
const numerosDe = (texto: string) => new Set(texto.match(/\d+/g) ?? []);

/**
 * ¿Hablan del mismo número? «tarea 1» y «tarea 2» son casi el mismo texto —se llevan una letra— y
 * son dos tareas distintas. Un número cambia poco el texto y mucho lo que dice, así que la
 * comparación por letras sola las tomaba por la misma y la segunda no entraba nunca.
 */
export function mismosNumeros(uno: string, otro: string): boolean {
  const a = numerosDe(uno);
  const b = numerosDe(otro);
  if (a.size !== b.size) return false;
  for (const n of a) if (!b.has(n)) return false;
  return true;
}

/**
 * La que es casi seguro la misma, si hay alguna: lo que entra solo se saltea.
 *
 * Se parecen mucho Y hablan de los mismos números. Las que se parecen pero no son la misma salen
 * igual en `parecidasA`, para mostrárselas a una persona: ahí la decisión es suya.
 */
export function yaEstaAnotada(tablero: readonly Tarjeta[], titulo: string): Tarjeta | undefined {
  return parecidasA(tablero, titulo, ES_LA_MISMA).find((p) => mismosNumeros(p.tarjeta.titulo, titulo))?.tarjeta;
}

/** Cómo se le cuenta a una persona, en una línea. */
export function comoSeDice(parecidas: readonly Parecida[]): string {
  if (parecidas.length === 0) return "";
  const nombres = parecidas.slice(0, 3).map((p) => `«${p.tarjeta.titulo}»`);
  const resto = parecidas.length > 3 ? ` y ${parecidas.length - 3} más` : "";
  return `se parece a ${nombres.join(", ")}${resto}`;
}
