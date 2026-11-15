/**
 * Los enfoques.
 *
 * Sembrar ocho universos con el mismo prompt y el mismo modelo es pagar
 * ocho veces por una sola idea: los modelos son consistentes, así que
 * devuelven casi lo mismo. La diversidad no sale de la temperatura — sale
 * de pedirles cosas distintas.
 *
 * Cada universo recibe un ángulo: uno busca el cambio más chico, otro la
 * causa de raíz, otro escribe el test primero. Después el portón los mata
 * a todos por igual y gana el que además de pasar sea el más simple.
 *
 * El orden importa: los primeros son los que más seguido ganan, así que
 * una siembra de 3 universos prueba los tres ángulos más útiles.
 */

export interface Enfoque {
  readonly nombre: string;
  /** Se le pega a la tarea. En segunda persona, como se le habla a alguien. */
  readonly instruccion: string;
  /** Si se define, este universo corre con otro modelo. */
  readonly modelo?: string;
}

export const ENFOQUES: readonly Enfoque[] = [
  {
    nombre: "mínimo",
    instruccion:
      "Hacé el cambio más chico que resuelva el problema. Nada de refactors, " +
      "nada de mejoras de paso: la menor cantidad de líneas posible.",
  },
  {
    nombre: "raíz",
    instruccion:
      "No arregles el síntoma. Averiguá por qué pasa y arreglá la causa, " +
      "aunque esté en otro archivo del que te señalaron.",
  },
  {
    nombre: "test primero",
    instruccion:
      "Escribí primero un test que falle y reproduzca el problema. Recién " +
      "después tocá el código, hasta que ese test pase.",
  },
  {
    nombre: "defensivo",
    instruccion:
      "Además de arreglarlo, cubrí los casos borde: entradas vacías, nulas, " +
      "fuera de rango, y los errores que hoy pasan en silencio.",
  },
  {
    nombre: "sin agregar nada",
    instruccion:
      "Resolvelo con lo que el repo ya tiene. No agregues dependencias, " +
      "archivos nuevos ni abstracciones: usá lo que está.",
  },
  {
    nombre: "legible",
    instruccion:
      "Resolvelo dejando el código más fácil de leer que como lo encontraste: " +
      "nombres que digan lo que hacen y menos pasos intermedios.",
  },
  {
    nombre: "completo",
    instruccion:
      "Resolvelo y dejá también actualizado lo que quede inconsistente: tests, " +
      "tipos, documentación y los usos del código que tocaste.",
  },
  {
    nombre: "al revés",
    instruccion:
      "Pensá la solución que NO sería la primera que se te ocurre. Si el " +
      "camino obvio es tocar esa función, buscá si no conviene resolverlo " +
      "un nivel más arriba o más abajo.",
  },
];

/**
 * Un enfoque por universo. Si se piden más universos que enfoques, se
 * repiten en orden: dos universos con el mismo ángulo igual dan resultados
 * distintos, pero rinde menos que un ángulo nuevo.
 */
export function repartirEnfoques(cantidad: number, enfoques: readonly Enfoque[] = ENFOQUES): Enfoque[] {
  if (cantidad <= 0) return [];
  if (enfoques.length === 0) return [];

  return Array.from({ length: cantidad }, (_, i) => enfoques[i % enfoques.length]!);
}

/** Cuántos ángulos distintos se están probando de verdad. */
export function angulosDistintos(repartidos: readonly Enfoque[]): number {
  return new Set(repartidos.map((e) => e.nombre)).size;
}
