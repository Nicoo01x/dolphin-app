import { join } from "node:path";
import { leerBandeja, type Asunto } from "./bandeja.js";
import { leerEntrenamiento } from "./entrenar.js";
import { carpetaDeDolphin, enFila, escribirDeUna } from "./escritura.js";
import { leerPerfil } from "./perfil.js";
import { VOCABULARIO_PARA_MODELOS } from "./vocabulario.js";

/**
 * Valorar las ideas: cuál vale más que cuál, para ESTE proyecto.
 *
 * El scout trae ideas de afuera y la bandeja las listaba todas iguales. Un
 * juez las compara entre sí —no una por una: una idea vale más o menos que
 * las otras— mirando lo que el proyecto ya sabe de sí (el perfil y lo que
 * aprendió de otros modelos) y devuelve, para cada una, cuánto vale (1 a 5),
 * cuánto cuesta (1 a 3) y por qué, en una línea. La consola las ordena y las
 * pinta: el color compara, no decora.
 */

export interface Valoracion {
  /** 5: la que más vale para este proyecto ahora; 1: no vale la pena. */
  readonly valor: number;
  /** 1: chica; 3: grande. */
  readonly esfuerzo: number;
  readonly porQue: string;
  readonly cuando: string;
}

/** Quién valora: un modelo que lee y contesta, sin herramientas que escriban. */
export type Valorador = (prompt: string, repo: string) => Promise<{ texto: string; gastado: number }>;

const rutaBandeja = (repo: string) => join(repo, ".dolphin", "bandeja.json");

const abiertas = (asuntos: readonly Asunto[]) => asuntos.filter((a) => a.tipo === "idea" && a.estado === "abierto");

/** El pedido al juez: el proyecto como se conoce a sí mismo y las ideas, para compararlas. */
export async function promptDeValorar(repo: string, ideas: readonly Asunto[]): Promise<string> {
  const [perfil, entrenamiento] = await Promise.all([leerPerfil(repo), leerEntrenamiento(repo)]);
  const sabe = [
    perfil.trim(),
    ...(entrenamiento?.aprendido ?? []).map((a) => `- ${a.texto}`),
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 12_000);
  const lista = ideas
    .map((i) =>
      [`### ${i.id}`, `Título: ${i.titulo}`, `Qué es: ${i.detalle}`, ...(i.propuesta ? [`Cómo se haría: ${i.propuesta}`] : [])].join("\n"),
    )
    .join("\n\n");
  return [
    "Sos el juez de ideas de Dolphin. Compará las ideas de abajo ENTRE SÍ para este proyecto: cuál vale más hacer ahora.",
    "",
    "Para cada una: «valor» de 1 a 5 (5 = la que más le suma a este proyecto ahora; 1 = no vale la pena), «esfuerzo» de 1 a 3 (1 = un rato, 3 = días), y «porQue» en una sola oración en castellano rioplatense que diga por qué vale lo que vale comparada con las otras. Usá toda la escala: no pongas a todas igual.",
    VOCABULARIO_PARA_MODELOS,
    "",
    'Respondé SOLO un JSON, sin texto alrededor: {"ideas":[{"id":"…","valor":4,"esfuerzo":2,"porQue":"…"}]}',
    "",
    "Lo que el proyecto sabe de sí:",
    sabe || "(todavía nada)",
    "",
    "Las ideas:",
    lista,
  ].join("\n");
}

/** Lee las valoraciones de la respuesta: solo ids que existen, números en rango, el porqué recortado. */
export function leerValoraciones(respuesta: string, ids: ReadonlySet<string>, ahora = new Date()): Map<string, Valoracion> {
  const desde = respuesta.indexOf("{");
  const hasta = respuesta.lastIndexOf("}");
  if (desde < 0 || hasta <= desde) throw new Error("el juez no contestó un JSON");
  let datos: { ideas?: unknown };
  try {
    datos = JSON.parse(respuesta.slice(desde, hasta + 1)) as { ideas?: unknown };
  } catch {
    throw new Error("el juez contestó un JSON roto");
  }
  if (!Array.isArray(datos.ideas)) throw new Error("el juez no devolvió ideas");
  const entero = (x: unknown, min: number, max: number) =>
    typeof x === "number" && Number.isFinite(x) ? Math.min(max, Math.max(min, Math.round(x))) : null;
  const salida = new Map<string, Valoracion>();
  for (const v of datos.ideas) {
    const id = typeof v?.id === "string" ? v.id : "";
    const valor = entero(v?.valor, 1, 5);
    const esfuerzo = entero(v?.esfuerzo, 1, 3);
    if (!ids.has(id) || valor === null || esfuerzo === null) continue;
    const porQue = typeof v?.porQue === "string" ? v.porQue.replace(/\s+/g, " ").trim().slice(0, 300) : "";
    salida.set(id, { valor, esfuerzo, porQue, cuando: ahora.toISOString() });
  }
  return salida;
}

/**
 * Valora las ideas abiertas y las deja anotadas en la bandeja. Sin ideas, no
 * gasta. Lo que cambió en la bandeja mientras el juez pensaba no se pisa:
 * se relee y se anota sobre lo que haya.
 */
export async function valorarIdeas(repo: string, valorador: Valorador, ahora = new Date()): Promise<{ valoradas: number; gastado: number }> {
  const ideas = abiertas((await leerBandeja(repo)).asuntos);
  if (ideas.length === 0) return { valoradas: 0, gastado: 0 };
  const { texto, gastado } = await valorador(await promptDeValorar(repo, ideas), repo);
  const valoraciones = leerValoraciones(texto, new Set(ideas.map((i) => i.id)), ahora);
  await enFila(rutaBandeja(repo), async () => {
    const bandeja = await leerBandeja(repo);
    const asuntos = bandeja.asuntos.map((a) => {
      const v = valoraciones.get(a.id);
      return v ? { ...a, valoracion: v } : a;
    });
    await carpetaDeDolphin(repo);
    await escribirDeUna(rutaBandeja(repo), `${JSON.stringify({ asuntos }, null, 2)}\n`);
  });
  return { valoradas: valoraciones.size, gastado };
}
