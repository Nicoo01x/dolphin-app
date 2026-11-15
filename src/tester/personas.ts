/**
 * Las personas.
 *
 * Un tester que "cliquea todo" encuentra poco y reporta mucho. Lo que
 * encuentra bugs de verdad es gente con una forma concreta de usar la app:
 * la que tiene el pulgar gordo, la que no toca el mouse, la que pega un
 * importe de nueve cifras, la que está en el subte con una barra de señal.
 *
 * Cada persona define CÓMO mira (viewport, red, entrada) y QUÉ la molesta.
 * El resultado se lee como lo diría una persona, no como un stack trace.
 */

export type Entrada = "mouse" | "teclado" | "tacto";

export interface Persona {
  readonly nombre: string;
  /** Una línea en voz humana: aparece en el parte. */
  readonly comoEs: string;
  readonly ancho: number;
  readonly alto: number;
  readonly entrada: Entrada;
  readonly tactil: boolean;
  /** Milisegundos de latencia agregada por request. 0 = sin tocar la red. */
  readonly latencia: number;
  /** Lo más largo que esta persona puede llegar a escribir o pegar. */
  readonly textoLargo?: string;
  /** Qué chequeos le importan. */
  readonly mira: readonly Chequeo[];
}

export type Chequeo =
  | "desborde"
  | "texto-cortado"
  | "target-chico"
  | "foco-visible"
  | "nombre-accesible"
  | "consola"
  | "red"
  | "espera-sin-aviso"
  | "contraste";

export const PULGAR: Persona = {
  nombre: "pulgar",
  comoEs: "en el celular, parada, al sol, con una mano",
  ancho: 390,
  alto: 844,
  entrada: "tacto",
  tactil: true,
  latencia: 0,
  mira: ["desborde", "target-chico", "texto-cortado", "contraste", "consola"],
};

export const TECLADO: Persona = {
  nombre: "teclado",
  comoEs: "no usa el mouse: navega con Tab y Enter",
  ancho: 1440,
  alto: 900,
  entrada: "teclado",
  tactil: false,
  latencia: 0,
  mira: ["foco-visible", "nombre-accesible", "consola"],
};

export const DESCONFIADO: Persona = {
  nombre: "desconfiado",
  comoEs: "pega textos larguísimos e importes de nueve cifras",
  ancho: 1440,
  alto: 900,
  entrada: "mouse",
  tactil: false,
  latencia: 0,
  textoLargo:
    "COOPERATIVA DE TRABAJO PARA LA PRODUCCIÓN Y COMERCIALIZACIÓN AGROPECUARIA LIMITADA $999.999.999,99",
  mira: ["desborde", "texto-cortado", "consola"],
};

export const APURADO: Persona = {
  nombre: "apurado",
  comoEs: "hace doble click en todo y no espera a que cargue",
  ancho: 1440,
  alto: 900,
  entrada: "mouse",
  tactil: false,
  latencia: 0,
  mira: ["consola", "red"],
};

export const SUBTE: Persona = {
  nombre: "subte",
  comoEs: "con una barra de señal",
  ancho: 390,
  alto: 844,
  entrada: "tacto",
  tactil: true,
  latencia: 1200,
  mira: ["espera-sin-aviso", "consola", "red"],
};

export const PERSONAS: readonly Persona[] = [PULGAR, TECLADO, DESCONFIADO, APURADO, SUBTE];

export function personasPorNombre(nombres: readonly string[]): Persona[] {
  if (nombres.length === 0) return [...PERSONAS];
  return nombres
    .map((n) => PERSONAS.find((p) => p.nombre === n.trim()))
    .filter((p): p is Persona => p !== undefined);
}
