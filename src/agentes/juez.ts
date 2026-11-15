import { argumentosDeLectura, leerConClaude } from "./leer-con-claude.js";
import { objetosJson } from "../nucleo/json.js";

/**
 * El juez de Vision: decide si la rama cumple la tarea mirando SOLO la
 * evidencia de la corrida —las capturas de la app de la rama en dos anchos
 * y lo que encontró el explorador tocándola—, nunca el código ni lo que
 * cuenta el agente. Es el hermano de revisor.ts: aquel lee el diff, este
 * mira la pantalla. Y lo corre otro modelo que el que escribió.
 *
 * Tres reglas que no decide el modelo sino el código (ver decidir):
 * - un criterio sin evidencia no cuenta como cumplido;
 * - con un criterio sin cumplir, se corta;
 * - si el juez duda, no hay nota, y sin nota la rama no pasa.
 */

export interface Captura {
  /** El nombre del archivo, en la carpeta donde corre el juez. */
  readonly archivo: string;
  /** Qué muestra: «/alta en 390 px, recién abierta». */
  readonly que: string;
}

export interface Evidencia {
  readonly capturas: readonly Captura[];
  /** Lo que encontró el explorador, una línea cada uno. */
  readonly hallazgos: readonly string[];
  /** Lo que el explorador probó y anduvo («mandé el formulario vacío y avisó»): evidencia a favor. */
  readonly comprobado?: readonly string[];
}

export interface Criterio {
  readonly criterio: string;
  /** true se cumple, false no, null no se puede saber con esta evidencia. */
  readonly cumple: boolean | null;
  /** La captura o el hallazgo que lo prueba. */
  readonly evidencia: string;
}

export type Decision = "aceptar" | "cortar" | "duda";

export interface Veredicto {
  readonly decision: Decision;
  readonly criterios: readonly Criterio[];
  readonly porQue: string;
  readonly gastado: number;
  readonly modelo: string;
  /**
   * El juez no contestó algo que se pueda leer: es una falla del juez, no de
   * la rama. La fase queda salteada; antes era una duda, que cortaba y ponía
   * al agente a «corregir» código que estaba bien.
   */
  readonly ilegible?: boolean;
}

/** Quien corre al juez: el CLI de Claude por defecto; en los tests, uno de mentira. */
export type CorrerJuez = (prompt: string, carpeta: string, modelo: string) => Promise<{ texto: string; gastado: number }>;

export function pedidoAlJuez(tarea: string, evidencia: Evidencia, rubrica?: readonly string[]): string {
  // Con la rúbrica fijada se juzgan siempre los mismos criterios: la corrección arregla
  // lo que se cortó y la vuelta siguiente mira eso, no un criterio nuevo que inventó el modelo.
  const pasos =
    rubrica && rubrica.length > 0
      ? ["1. Juzgá EXACTAMENTE estos criterios, en este orden, sin sumar ni sacar ninguno:", ...rubrica.map((c, i) => `   ${i + 1}. ${c}`)]
      : ["1. Escribí de 2 a 5 criterios concretos que se tienen que VER en pantalla para que la tarea esté cumplida."];
  return [
    "Sos el juez de una rama de código. No mirás el código: mirás la app andando, como la vería alguien que la usa por primera vez.",
    "",
    `La tarea que se pidió: ${tarea}`,
    "",
    "Las capturas de la app de la rama, en esta carpeta (abrí cada una con tu herramienta Read):",
    ...evidencia.capturas.map((c) => `- ${c.archivo}: ${c.que}`),
    "",
    ...(evidencia.hallazgos.length > 0
      ? ["Lo que encontró el explorador al tocar la app:", ...evidencia.hallazgos.map((h) => `- ${h}`)]
      : ["El explorador tocó la app y no encontró nada roto."]),
    ...(evidencia.comprobado && evidencia.comprobado.length > 0
      ? ["", "Lo que el explorador probó y anduvo (también es evidencia):", ...evidencia.comprobado.map((c) => `- ${c}`)]
      : []),
    "",
    "Hacé esto:",
    ...pasos,
    "2. Para cada uno: true si se cumple, false si no, null si con esta evidencia no se puede saber.",
    "3. Cada criterio cita su evidencia: el nombre de la captura, el hallazgo o lo comprobado que lo prueba. Sin evidencia, es null.",
    "Un hallazgo del explorador que tiene que ver con la tarea es un criterio que no se cumple; uno que no tiene que ver, no cuenta.",
    "No tenés cómo era la app antes: no escribas criterios que comparen con el original («no cambió nada más», «quedó igual»). Juzgá lo que se ve ahora.",
    "",
    "Contestá SOLO con este JSON, sin nada antes ni después:",
    // El ejemplo con una captura que existe: con un nombre inventado, el modelo lo copiaba tal cual.
    `{"criterios":[{"criterio":"…","cumple":true,"evidencia":"${evidencia.capturas[0]?.archivo ?? "el nombre de la captura"}"}],"porQue":"una línea"}`,
  ].join("\n");
}

/**
 * El JSON del juez, aunque venga envuelto en ```json o con texto alrededor.
 * Se buscan los objetos de verdad: de la primera llave a la última, una
 * llave en la prosa rompía la lectura entera.
 */
export function leerVeredicto(texto: string): { criterios: Criterio[]; porQue: string } | undefined {
  const datos = objetosJson(texto).find((o): o is { criterios: unknown[]; porQue?: unknown } =>
    typeof o === "object" && o !== null && Array.isArray((o as { criterios?: unknown }).criterios),
  );
  if (!datos) return undefined;
  const criterios = datos.criterios
    .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null && typeof (c as { criterio?: unknown }).criterio === "string")
    .map((c) => ({
      criterio: String(c.criterio).trim(),
      cumple: c.cumple === true ? true : c.cumple === false ? false : null,
      evidencia: typeof c.evidencia === "string" ? c.evidencia.trim() : "",
    }));
  return { criterios, porQue: typeof datos.porQue === "string" ? datos.porQue.trim() : "" };
}

const normal = (texto: string) => texto.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Si lo que el juez cita como evidencia existe: el nombre de una captura que
 * se le mostró, o una línea de lo que encontró o comprobó el explorador.
 * «no-existe.png» o «-» no prueban nada.
 */
export function evidenciaReal(cita: string, evidencia: Evidencia): boolean {
  const dicho = normal(cita);
  if (dicho.length < 3) return false;
  if (evidencia.capturas.some((c) => dicho.includes(normal(c.archivo)))) return true;
  const lineas = [...evidencia.hallazgos, ...(evidencia.comprobado ?? [])].map(normal).filter((l) => l.length >= 8);
  return lineas.some((l) => l.includes(dicho) || dicho.includes(l));
}

/**
 * La decisión es del código, no del modelo: lo que se dice cumplido sin una
 * evidencia que exista vale como duda, cualquier criterio sin cumplir corta,
 * y con una duda —o sin criterios— no hay nota. Con la rúbrica fijada, se
 * juzgan TODOS sus criterios: omitir justo el que falla ya no da «aceptar».
 */
export function decidir(criterios: readonly Criterio[], evidencia?: Evidencia, rubrica?: readonly string[]): Decision {
  const faltan = (rubrica ?? []).filter((r) => !criterios.some((c) => normal(c.criterio) === normal(r)));
  const todos = [...criterios, ...faltan.map((criterio) => ({ criterio, cumple: null, evidencia: "" }))];
  if (todos.length === 0) return "duda";
  const conEvidencia = todos.map((c) =>
    c.cumple === true && (c.evidencia === "" || (evidencia !== undefined && !evidenciaReal(c.evidencia, evidencia))) ? { ...c, cumple: null } : c,
  );
  if (conEvidencia.some((c) => c.cumple === false)) return "cortar";
  if (conEvidencia.some((c) => c.cumple === null)) return "duda";
  return "aceptar";
}

/** Lo que puede hacer el juez: abrir las capturas. Una vuelta por captura, más la respuesta. */
const LECTURA_DEL_JUEZ = { vueltas: 14, herramientas: ["Read", "Glob"] } as const;

/** Los argumentos del juez: lee las capturas y nada más. */
export function argumentosDelJuez(modelo: string): string[] {
  return argumentosDeLectura({ modelo, ...LECTURA_DEL_JUEZ });
}

/** Corre en la carpeta de la evidencia, fuera del repo: no carga la configuración de nadie (ver config-ejecutable.ts). */
export function juezConClaude(cmd = "claude", tope = 300_000): CorrerJuez {
  return (prompt, carpeta, modelo) => leerConClaude(prompt, { cmd, modelo, ...LECTURA_DEL_JUEZ, cwd: carpeta, tope });
}

/** Pide, lee y decide. Un juez que no contesta algo legible no juzgó: la fase queda salteada (ver Veredicto.ilegible). */
export async function juzgar(
  correr: CorrerJuez,
  tarea: string,
  evidencia: Evidencia,
  carpeta: string,
  modelo: string,
  rubrica?: readonly string[],
): Promise<Veredicto> {
  const { texto, gastado } = await correr(pedidoAlJuez(tarea, evidencia, rubrica), carpeta, modelo);
  const leido = leerVeredicto(texto);
  if (!leido) {
    return { decision: "duda", ilegible: true, criterios: [], porQue: `el juez no contestó algo legible: ${texto.replace(/\s+/g, " ").slice(0, 160)}`, gastado, modelo };
  }
  return { decision: decidir(leido.criterios, evidencia, rubrica), ...leido, gastado, modelo };
}
