import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { carpetaDeDolphin, enFila, escribirDeUna } from "./escritura.js";
import { contextoDeMemoria, leerMemoria, leerUsos, memoriasRelevantes, registrarUsos } from "./memoria.js";
import { contextoDeEntrenamiento } from "./entrenar.js";
import type { Motor } from "./router.js";

/**
 * El perfil del proyecto: las verdades del dominio que NINGUNA tarea
 * puede olvidar. «Acá hay monotributistas Y responsables inscriptos:
 * todo lo nuevo cubre ambos» — ese tipo de cosa, que un agente sin
 * contexto se olvida y el dueño del repo se cansa de repetir.
 *
 * Es un Markdown plano en `.dolphin/PERFIL.md`, editable a mano y
 * versionable: sin estado oculto. A diferencia de los recuerdos (que
 * vuelven por afinidad con la tarea), el perfil viaja ENTERO en el
 * prompt de todos los agentes, siempre, sea cual sea el modelo: es lo
 * que hace que uno barato encare el trabajo igual que uno caro.
 */

const rutaPerfil = (repo: string) => join(repo, ".dolphin", "PERFIL.md");

export async function leerPerfil(repo: string): Promise<string> {
  try {
    return (await readFile(rutaPerfil(repo), "utf8")).trim();
  } catch {
    return "";
  }
}

async function escribirPerfil(repo: string, texto: string): Promise<void> {
  await carpetaDeDolphin(repo);
  await escribirDeUna(rutaPerfil(repo), texto.trim() === "" ? "" : `${texto.trim()}\n`);
}

/** El perfil entero, como lo dejó la persona. En fila con lo que se le suma (ver sumarAlPerfil). */
export function guardarPerfil(repo: string, texto: string): Promise<void> {
  return enFila(rutaPerfil(repo), () => escribirPerfil(repo, texto));
}

/**
 * Una verdad nueva se suma como viñeta, sin pisar lo que ya está. Lo ya
 * sabido no se repite: la MISMA línea, no una que la contenga —«usa pnpm»
 * se descartaba porque ya decía «usa pnpm para todo»—.
 */
export function sumarAlPerfil(repo: string, linea: string): Promise<void> {
  const limpia = linea.trim();
  if (limpia === "") return Promise.reject(new Error("una línea vacía no le enseña nada a nadie"));
  const sinVinieta = (l: string) => l.replace(/^\s*[-*]\s*/, "").trim().toLowerCase();
  return enFila(rutaPerfil(repo), async () => {
    const actual = await leerPerfil(repo);
    if (actual.split("\n").some((l) => sinVinieta(l) === sinVinieta(limpia))) return;
    const vinieta = limpia.startsWith("-") ? limpia : `- ${limpia}`;
    await escribirPerfil(repo, actual === "" ? vinieta : `${actual}\n${vinieta}`);
  });
}

/** Lo que viaja al prompt: el perfil entero, con su encabezado. */
export function contextoDePerfil(perfil: string): string {
  if (perfil.trim() === "") return "";
  return [
    "El perfil de este proyecto — lo que ninguna función nueva puede olvidar:",
    perfil.trim(),
  ].join("\n");
}

/**
 * Todo lo que un agente recibe antes de escribir una línea, sea cual sea
 * el modelo: el perfil entero primero, después lo que haya pedido quien
 * siembra, las reglas de la casa y lo aprendido que se parezca a esta
 * tarea, y al final lo que el proyecto ya les enseñó a otros modelos (lo
 * que este motor no lee solo; ver entrenar.ts). Es lo que hace que no haya
 * que repetirle las cosas.
 */
export async function contextoDeSiembra(
  repo: string,
  tarea: string,
  extra = "",
  motor: Motor = "mentira",
  rutas: readonly string[] = [],
): Promise<string> {
  const [perfil, memoria, entrenamiento, usos] = await Promise.all([
    leerPerfil(repo),
    leerMemoria(repo),
    contextoDeEntrenamiento(repo, motor, tarea),
    leerUsos(repo),
  ]);
  const relevantes = memoriasRelevantes(memoria, { texto: tarea, rutas }, { usos });
  await registrarUsos(repo, relevantes.map((r) => r.recuerdo.id));
  return [contextoDePerfil(perfil), extra.trim(), contextoDeMemoria(memoria, { texto: tarea, rutas }, { usos }), entrenamiento]
    .filter((parte) => parte !== "")
    .join("\n\n");
}
