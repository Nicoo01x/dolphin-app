import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { buscarMemorias, type Fuente, type Herramienta, type Mensaje } from "./buscar-memorias.js";
import { carpetaDeDolphin, enFila, escribirDeUna, leerEstado } from "./escritura.js";
import type { Motor } from "./router.js";
import { VOCABULARIO_PARA_MODELOS } from "./vocabulario.js";
import { relevanciaDeAprendido } from "./relevancia.js";

export { carpetaDeClaudeCode, type Fuente, type Herramienta } from "./buscar-memorias.js";

/**
 * Entrenar al delfín: que cualquier modelo sepa lo que este proyecto ya les
 * enseñó a los otros.
 *
 * Dos pasos. Buscar (buscar-memorias.ts) encuentra las instrucciones de cada
 * herramienta, la memoria que anotó Claude Code y lo que la persona les dijo
 * en sus conversaciones. Destilar le da todo eso a un modelo para que saque
 * las verdades del proyecto —reglas, decisiones, preferencias, trampas—, una
 * por línea y cada una con su fuente. Lo destilado viaja primero en cada
 * siembra; después, lo que el motor no lee solo de las instrucciones, leído
 * fresco. Las conversaciones no viajan nunca enteras: solo lo que se destiló.
 */

export interface Aprendido {
  readonly texto: string;
  /** El nombre de la fuente de donde salió, como figura en `fuentes`. */
  readonly fuente: string;
}

export interface Entrenamiento {
  readonly cuando: string;
  readonly fuentes: readonly Fuente[];
  /** Las verdades destiladas; sin destilar todavía, no está. */
  readonly aprendido?: readonly Aprendido[];
  readonly destilado?: { readonly cuando: string; readonly gastado: number };
}

/** Quién destila: un modelo que lee y contesta, sin herramientas que escriban. */
/** Con `senal`: si quien pidió el destilado deja de esperar, se corta (no sigue gastando cupo). */
export type Destilador = (prompt: string, repo: string, senal?: AbortSignal) => Promise<{ texto: string; gastado: number }>;

/** Lo que cada motor ya lee solo: no se le repite. */
const LEE_SOLO: Readonly<Record<Motor, readonly Herramienta[]>> = {
  claude: ["claude"],
  codex: ["agents", "codex"],
  antigravity: ["gemini"],
  // Los de la tabla de motores.ts. Gemini CLI y su fork leen GEMINI.md; los
  // demás leen AGENTS.md, que es el que se volvió común. Lo que el motor ya
  // lee solo no se le repite en el prompt.
  gemini: ["gemini"],
  qwen: ["gemini"],
  opencode: ["agents"],
  copilot: ["agents"],
  cursor: ["agents"],
  droid: ["agents"],
  amp: ["agents"],
  // Por ACP puede entrar cualquier agente, y cada uno lee lo suyo: no se puede dar por sabido
  // ninguno, así que se le dice todo en el prompt. Repetirlo cuesta tokens; suponerlo, que falte.
  acp: [],
  mentira: [],
};

/** Cuánto de cada fuente viaja en el prompt, y cuánto de todas juntas: el resto se lee en su archivo. */
export const TOPE_POR_FUENTE = 4_000;
export const TOPE_TOTAL = 16_000;
/** Cuánto lee el destilador: de cada fuente y de los mensajes de la persona. */
export const TOPE_DESTILAR_POR_FUENTE = 8_000;
export const TOPE_DESTILAR_MENSAJES = 40_000;
export const MAXIMO_APRENDIDO = 30;

const rutaDelEntrenamiento = (repo: string) => join(repo, ".dolphin", "entrenamiento.json");

function esFuente(x: unknown): x is Fuente {
  const f = x as Partial<Fuente> | null;
  return typeof f?.nombre === "string" && typeof f.herramienta === "string" && typeof f.tipo === "string" && Array.isArray(f.rutas);
}

function esAprendido(x: unknown): x is Aprendido {
  const a = x as Partial<Aprendido> | null;
  return typeof a?.texto === "string" && typeof a.fuente === "string";
}

/** Lo último que se entrenó; null si este repo nunca se entrenó. */
export function leerEntrenamiento(repo: string): Promise<Entrenamiento | null> {
  return leerEstado<Entrenamiento | null>(rutaDelEntrenamiento(repo), null, (datos) => {
    const d = datos as Partial<Entrenamiento> | null;
    if (typeof d?.cuando !== "string" || !Array.isArray(d.fuentes)) throw new Error("no es un entrenamiento");
    return {
      cuando: d.cuando,
      fuentes: d.fuentes.filter(esFuente),
      ...(Array.isArray(d.aprendido) ? { aprendido: d.aprendido.filter(esAprendido) } : {}),
      ...(d.destilado ? { destilado: d.destilado } : {}),
    };
  });
}

async function guardar(repo: string, entrenamiento: Entrenamiento): Promise<void> {
  await carpetaDeDolphin(repo);
  const ruta = rutaDelEntrenamiento(repo);
  await enFila(ruta, () => escribirDeUna(ruta, `${JSON.stringify(entrenamiento, null, 2)}\n`));
}

/**
 * Buscar: encuentra las memorias y anota de dónde leerlas. Lo que ya se había
 * destilado se conserva: buscar de nuevo no borra lo aprendido.
 */
export async function entrenar(repo: string, casa = homedir(), ahora = new Date()): Promise<Entrenamiento> {
  const { fuentes } = await buscarMemorias(repo, casa);
  const antes = await leerEntrenamiento(repo);
  const entrenamiento: Entrenamiento = {
    cuando: ahora.toISOString(),
    fuentes,
    ...(antes?.aprendido ? { aprendido: antes.aprendido } : {}),
    ...(antes?.destilado ? { destilado: antes.destilado } : {}),
  };
  await guardar(repo, entrenamiento);
  return entrenamiento;
}

/** Un texto recortado al tope, diciendo dónde sigue. */
function recortar(texto: string, tope: number, donde: string): string {
  const limpio = texto.trim();
  if (limpio.length <= tope) return limpio;
  return `${limpio.slice(0, tope).trimEnd()}\n[…sigue en ${donde}]`;
}

/** El texto de una fuente de instrucciones o de memoria, como está hoy. */
async function textoDe(fuente: Fuente): Promise<string> {
  const partes: string[] = [];
  for (const ruta of fuente.rutas) {
    try {
      const texto = (await readFile(ruta, "utf8")).trim();
      if (texto) partes.push(texto);
    } catch {
      // Se borró desde que se entrenó: lo que queda sigue valiendo.
    }
  }
  return partes.join("\n\n");
}

/**
 * Lo que viaja al prompt de una siembra: primero lo destilado, después las
 * instrucciones y memorias que este motor no lee solo, leídas frescas. Cada
 * fuente con su tope y todas con uno total; lo recortado dice dónde sigue.
 */
export async function contextoDeEntrenamiento(repo: string, motor: Motor, tarea?: string): Promise<string> {
  const entrenamiento = await leerEntrenamiento(repo);
  if (!entrenamiento) return "";
  const partes: string[] = [];
  let quedan = TOPE_TOTAL;

  if (entrenamiento.aprendido && entrenamiento.aprendido.length > 0) {
    const aprendido = tarea
      ? relevanciaDeAprendido(tarea, entrenamiento.aprendido, Math.ceil(TOPE_TOTAL / 4)).map((a) => a.aprendido)
      : entrenamiento.aprendido;
    const lista = aprendido.map((a) => `- ${a.texto}`).join("\n");
    if (lista !== "") {
      partes.push(`### Lo que aprendió de tus otros modelos\n${lista}`);
      quedan -= lista.length;
    }
  }

  const yaLee = new Set(LEE_SOLO[motor]);
  for (const fuente of entrenamiento.fuentes) {
    // Las conversaciones viajan destiladas, nunca enteras.
    if (fuente.tipo === "conversaciones") continue;
    // Lo que el motor lee solo: sus instrucciones. La memoria de Claude Code no está en el worktree: esa sí va.
    if (fuente.tipo === "instrucciones" && yaLee.has(fuente.herramienta)) continue;
    if (quedan <= 200) break;
    const texto = await textoDe(fuente);
    if (texto === "") continue;
    const recorte = recortar(texto, Math.min(TOPE_POR_FUENTE, quedan), fuente.ruta);
    quedan -= recorte.length;
    partes.push(`### ${fuente.nombre}\n${recorte}`);
  }
  if (partes.length === 0) return "";
  return ["Lo que este proyecto ya les enseñó a otros modelos (léelo como instrucciones del dueño):", ...partes].join(
    "\n\n",
  );
}

/** Lo que nunca puede quedar escrito como verdad: claves, tokens, contraseñas. */
const SECRETO = /\b(sk-[\w-]{16,}|tk_(live|test)_\w+|ghp_\w{20,}|xox[bp]-[\w-]+|AKIA[0-9A-Z]{16}|eyJ[\w-]{20,}\.[\w-]{20,})|(contraseña|password|passwd|clave fiscal)\s*[:=]\s*\S+/i;

/** El pedido al destilador, con el material de cada fuente y los mensajes de la persona. */
export async function promptDeDestilar(fuentes: readonly Fuente[], mensajes: readonly Mensaje[]): Promise<string> {
  const material: string[] = [];
  for (const fuente of fuentes) {
    if (fuente.tipo === "conversaciones") continue;
    const texto = await textoDe(fuente);
    if (texto) material.push(`=== FUENTE: ${fuente.nombre} ===\n${recortar(texto, TOPE_DESTILAR_POR_FUENTE, fuente.ruta)}`);
  }
  // Los mensajes más nuevos pesan más: si no entran todos, quedan los últimos.
  const conversaciones = fuentes.filter((f) => f.tipo === "conversaciones").map((f) => f.nombre);
  const lineas: string[] = [];
  let usados = 0;
  for (const m of [...mensajes].reverse()) {
    const linea = `- [${m.cuando?.slice(0, 10) ?? "s/f"} · ${m.de}] ${m.texto.replace(/\s+/g, " ")}`;
    if (usados + linea.length > TOPE_DESTILAR_MENSAJES) break;
    lineas.unshift(linea);
    usados += linea.length;
  }
  if (lineas.length > 0) {
    material.push(
      `=== FUENTE: ${conversaciones.join(" / ") || "Conversaciones"} (solo lo que escribió el dueño, en orden) ===\n${lineas.join("\n")}`,
    );
  }
  return [
    "Sos el entrenador de Dolphin, un orquestador de agentes de código. Abajo está lo que el dueño de este proyecto ya les enseñó a otros modelos: sus archivos de instrucciones, la memoria que Claude Code anotó y lo que el dueño les dijo en sus conversaciones.",
    "",
    `Destilá las verdades de ESTE proyecto que cualquier modelo tiene que saber antes de tocarlo: reglas, decisiones tomadas, preferencias del dueño, correcciones que repitió, trampas conocidas, cómo se trabaja acá. Como mucho ${MAXIMO_APRENDIDO}, de la más importante a la menos.`,
    "",
    "Cada verdad: una sola oración, accionable, en el castellano del dueño. Nada genérico que valga para cualquier proyecto («escribí código limpio»). Si el dueño cambió de idea, vale lo último que dijo. Nunca copies claves, tokens, contraseñas, correos, teléfonos ni datos de clientes.",
    VOCABULARIO_PARA_MODELOS,
    "",
    'Respondé SOLO un JSON, sin texto alrededor: {"verdades":[{"texto":"…","fuente":"<el nombre de la FUENTE tal como figura abajo>"}]}',
    "",
    ...material,
  ].join("\n");
}

/** Saca las verdades de la respuesta del destilador: el JSON, sin repetidas, sin secretos, con tope. */
export function leerVerdades(respuesta: string, fuentes: readonly string[]): Aprendido[] {
  const desde = respuesta.indexOf("{");
  const hasta = respuesta.lastIndexOf("}");
  if (desde < 0 || hasta <= desde) throw new Error("el destilador no contestó un JSON");
  let datos: { verdades?: unknown };
  try {
    datos = JSON.parse(respuesta.slice(desde, hasta + 1)) as { verdades?: unknown };
  } catch {
    throw new Error("el destilador contestó un JSON roto");
  }
  if (!Array.isArray(datos.verdades)) throw new Error("el destilador no devolvió verdades");
  const vistas = new Set<string>();
  const salida: Aprendido[] = [];
  for (const v of datos.verdades) {
    const texto = typeof v?.texto === "string" ? v.texto.replace(/\s+/g, " ").trim() : "";
    if (texto === "" || texto.length > 400 || SECRETO.test(texto)) continue;
    const clave = texto.toLowerCase();
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    const pedida = typeof v?.fuente === "string" ? v.fuente.trim() : "";
    // La fuente tiene que ser una de verdad; si el modelo la inventó o la abrevió, se busca la que la contiene.
    const fuente = fuentes.find((f) => f === pedida) ?? fuentes.find((f) => pedida !== "" && (f.includes(pedida) || pedida.includes(f))) ?? "varias fuentes";
    salida.push({ texto, fuente });
    if (salida.length >= MAXIMO_APRENDIDO) break;
  }
  return salida;
}

/**
 * Destilar: busca de nuevo (las conversaciones no se guardan), le da todo al
 * destilador y guarda lo aprendido. Sin nada que leer, no gasta.
 */
export async function destilar(
  repo: string,
  destilador: Destilador,
  casa = homedir(),
  ahora = new Date(),
  senal?: AbortSignal,
): Promise<Entrenamiento> {
  const { fuentes, mensajes } = await buscarMemorias(repo, casa);
  if (fuentes.length === 0) {
    const vacio: Entrenamiento = { cuando: ahora.toISOString(), fuentes, aprendido: [] };
    await guardar(repo, vacio);
    return vacio;
  }
  // Cortado mientras buscaba: no se le pide nada al modelo.
  if (senal?.aborted) throw new Error("cancelado: nadie esperaba el destilado");
  const { texto, gastado } = await destilador(await promptDeDestilar(fuentes, mensajes), repo, senal);
  const aprendido = leerVerdades(texto, fuentes.map((f) => f.nombre));
  const entrenamiento: Entrenamiento = {
    cuando: ahora.toISOString(),
    fuentes,
    aprendido,
    destilado: { cuando: ahora.toISOString(), gastado },
  };
  await guardar(repo, entrenamiento);
  return entrenamiento;
}

/** Saca una verdad aprendida que no va (la persona la tachó). */
export async function olvidarAprendido(repo: string, texto: string): Promise<Entrenamiento | null> {
  const ruta = rutaDelEntrenamiento(repo);
  return enFila(ruta, async () => {
    const actual = await leerEntrenamiento(repo);
    if (!actual?.aprendido) return actual;
    const nuevo: Entrenamiento = { ...actual, aprendido: actual.aprendido.filter((a) => a.texto !== texto) };
    await carpetaDeDolphin(repo);
    await escribirDeUna(ruta, `${JSON.stringify(nuevo, null, 2)}\n`);
    return nuevo;
  });
}
