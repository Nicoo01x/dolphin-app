import type { Memoria, Recuerdo } from "./memoria.js";

/** Una tarea y, cuando ya se conocen, los archivos que va a tocar. */
export interface TareaParaRelevancia {
  readonly texto: string;
  readonly rutas?: readonly string[];
}

export interface UsoDeMemoria {
  readonly usos: number;
  readonly ultimoUso?: string;
}

export type UsosDeMemoria = Readonly<Record<string, UsoDeMemoria>>;

export interface AprendidoParaRelevancia {
  readonly texto: string;
  readonly fuente?: string;
}

export interface MemoriaRelevante {
  readonly recuerdo: Recuerdo;
  readonly puntaje: number;
  readonly tokens: number;
  readonly forzada: boolean;
}

export interface AprendidoRelevante {
  readonly aprendido: AprendidoParaRelevancia;
  readonly puntaje: number;
  readonly tokens: number;
}

export interface RelevanciaDeContexto {
  readonly recuerdos: readonly MemoriaRelevante[];
  readonly aprendido: readonly AprendidoRelevante[];
  readonly tokens: number;
}

export interface OpcionesDeRelevancia {
  readonly topeTokens?: number;
  readonly usos?: UsosDeMemoria;
  readonly aprendido?: readonly AprendidoParaRelevancia[];
}

/** El tope de la memoria en el prompt. Las reglas con patrón no consumen este presupuesto. */
export const TOPE_TOKENS_MEMORIA = 4_000;

const PARADAS = new Set([
  "a", "al", "and", "ante", "and", "con", "como", "de", "del", "e", "el", "en", "es", "for", "from", "in",
  "la", "las", "lo", "los", "no", "of", "on", "o", "para", "por", "que", "se", "su", "the", "to", "un", "una",
  "y", "you",
]);

/** Palabras comparables: sin tildes, mayúsculas, puntuación ni stopwords ES/EN. */
export function palabrasNormalizadas(texto: string): readonly string[] {
  return [...new Set(texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((palabra) => palabra.length > 2 && !PARADAS.has(palabra)))];
}

/** Texto normalizado para recordar descartes y detectar ecos. */
export function normalizarTexto(texto: string): string {
  return palabrasNormalizadas(texto).join(" ");
}

/** Coincidencia de palabras, usada también por la higiene de la memoria. */
export function jaccardDePalabras(a: string, b: string): number {
  const izquierda = new Set(palabrasNormalizadas(a));
  const derecha = new Set(palabrasNormalizadas(b));
  if (izquierda.size === 0 && derecha.size === 0) return normalizarTexto(a) === normalizarTexto(b) ? 1 : 0;
  if (izquierda.size === 0 || derecha.size === 0) return 0;
  const interseccion = [...izquierda].filter((palabra) => derecha.has(palabra)).length;
  return interseccion / new Set([...izquierda, ...derecha]).size;
}

function tareaDe(tarea: string | TareaParaRelevancia): TareaParaRelevancia {
  return typeof tarea === "string" ? { texto: tarea } : tarea;
}

function tokensDe(texto: string): number {
  return Math.max(1, Math.ceil(texto.length / 4));
}

function pesoDePalabras(tarea: TareaParaRelevancia): ReadonlyMap<string, number> {
  const pesos = new Map<string, number>();
  for (const palabra of palabrasNormalizadas(tarea.texto)) pesos.set(palabra, 1);
  for (const ruta of tarea.rutas ?? []) {
    for (const palabra of palabrasNormalizadas(ruta)) pesos.set(palabra, Math.max(pesos.get(palabra) ?? 0, 2.5));
  }
  return pesos;
}

function puntajeDe(texto: string, tarea: TareaParaRelevancia, tipo: Recuerdo["tipo"] | undefined, usos: UsoDeMemoria | undefined): number {
  const consulta = pesoDePalabras(tarea);
  const palabras = new Set(palabrasNormalizadas(texto));
  const total = [...consulta.values()].reduce((suma, peso) => suma + peso, 0);
  const compartidas = [...palabras].reduce((suma, palabra) => suma + (consulta.get(palabra) ?? 0), 0);
  const afinidad = total === 0 ? 0 : compartidas / total;
  const tipoBonus = afinidad > 0 && tipo === "error" ? 0.18 : 0;
  const frecuencia = afinidad > 0 && usos && usos.usos > 0 ? Math.min(0.16, Math.log1p(usos.usos) * 0.035) : 0;
  return afinidad + tipoBonus + frecuencia;
}

/**
 * Ordena recuerdos para el prompt. Las reglas con patrón son parte del
 * portón: entran siempre y no se dejan afuera por presupuesto.
 */
export function relevanciaDeMemoria(
  tarea: string | TareaParaRelevancia,
  memoria: Memoria,
  opciones: OpcionesDeRelevancia = {},
): readonly MemoriaRelevante[] {
  const topeTokens = opciones.topeTokens ?? TOPE_TOKENS_MEMORIA;
  const contexto = tareaDe(tarea);
  const candidatos = memoria.recuerdos.filter((r) => r.activo && !r.candidato);
  const ordenados = candidatos
    .map((recuerdo, indice) => ({
      recuerdo,
      indice,
      forzada: recuerdo.patron !== undefined,
      puntaje: recuerdo.patron !== undefined ? Number.POSITIVE_INFINITY : puntajeDe(recuerdo.dicho, contexto, recuerdo.tipo, opciones.usos?.[recuerdo.id]),
      tokens: tokensDe(recuerdo.dicho),
    }))
    .sort((a, b) => b.puntaje - a.puntaje || a.indice - b.indice);

  const elegidos: MemoriaRelevante[] = [];
  let usados = 0;
  for (const candidato of ordenados) {
    const esRegla = (candidato.recuerdo.tipo ?? "regla") === "regla";
    if (!candidato.forzada && !esRegla && candidato.puntaje <= 0) continue;
    if (!candidato.forzada && usados + candidato.tokens > topeTokens) continue;
    if (!candidato.forzada) usados += candidato.tokens;
    elegidos.push({ recuerdo: candidato.recuerdo, puntaje: candidato.puntaje, tokens: candidato.tokens, forzada: candidato.forzada });
  }
  return elegidos;
}

/** Selección equivalente para el destilado de otros modelos. */
export function relevanciaDeAprendido(
  tarea: string | TareaParaRelevancia,
  aprendido: readonly AprendidoParaRelevancia[],
  topeTokens = TOPE_TOKENS_MEMORIA,
): readonly AprendidoRelevante[] {
  const contexto = tareaDe(tarea);
  const resultados = aprendido
    .map((a, indice) => ({ aprendido: a, indice, puntaje: puntajeDe(a.texto, contexto, undefined, undefined), tokens: tokensDe(a.texto) }))
    .sort((a, b) => b.puntaje - a.puntaje || a.indice - b.indice);
  const todosEntran = resultados.reduce((suma, r) => suma + r.tokens, 0) <= topeTokens;
  const elegidos: AprendidoRelevante[] = [];
  let usados = 0;
  for (const resultado of resultados) {
    if (!todosEntran && resultado.puntaje <= 0) continue;
    if (usados + resultado.tokens > topeTokens) continue;
    usados += resultado.tokens;
    elegidos.push({ aprendido: resultado.aprendido, puntaje: resultado.puntaje, tokens: resultado.tokens });
  }
  return elegidos;
}

/** Devuelve memoria y destilado juntos, con el mismo presupuesto. */
export function relevanciaDeContexto(
  tarea: string | TareaParaRelevancia,
  memoria: Memoria,
  opciones: OpcionesDeRelevancia = {},
): RelevanciaDeContexto {
  const recuerdos = relevanciaDeMemoria(tarea, memoria, opciones);
  const aprendido = relevanciaDeAprendido(tarea, opciones.aprendido ?? [], opciones.topeTokens ?? TOPE_TOKENS_MEMORIA);
  return { recuerdos, aprendido, tokens: recuerdos.reduce((suma, r) => suma + r.tokens, 0) + aprendido.reduce((suma, a) => suma + a.tokens, 0) };
}

// Nombres explícitos para quienes consumen el módulo desde la app de escritorio.
export const seleccionarMemorias = relevanciaDeMemoria;
export const puntuarMemorias = relevanciaDeMemoria;
export const relevancia = relevanciaDeMemoria;
