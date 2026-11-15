import { git } from "../nucleo/git.js";
import { recordar, type Recuerdo } from "../nucleo/memoria.js";
import { anotar } from "../nucleo/notas.js";

/**
 * Lo que el equipo enseña, como enseña una siembra (ver aprenderDeCosecha en memoria.ts). La siembra
 * aprende cuando la mayoría de SUS ramas se corta en la misma fase; cada compañero del equipo es una
 * siembra de una sola rama, así que esa regla nunca se cumplía y el equipo no aprendía nada:
 *
 *   varios compañeros cortados en la misma fase → error confirmado del repo
 *   piezas que pasaban solas y juntas no        → error confirmado: no encajan
 *   lo que la persona deshizo con /deshacer     → una corrección suya, al corto plazo de la memoria;
 *                                                 si se repite, el sueño la promueve (ver sueno.ts)
 */

export interface CorteDeCompanero {
  readonly id: string;
  readonly titulo: string;
  /** La fase del portón que lo cortó (typecheck, test…), si se sabe. */
  readonly fase?: string;
  readonly porQue: string;
}

const recortar = (texto: string, tope: number) => (texto.length > tope ? `${texto.slice(0, tope - 1)}…` : texto);

/** Las fases donde se cortaron varios: al menos dos compañeros y al menos la mitad del equipo. */
export function cortesRepetidos(cortes: readonly CorteDeCompanero[], total: number): { fase: string; cuantos: number; ejemplo: string }[] {
  const porFase = new Map<string, CorteDeCompanero[]>();
  // Lo que se cayó antes de escribir (el agente, el taller) no dice nada del repo: un corte de luz no es una lección.
  for (const c of cortes) if (c.fase && c.fase !== "el agente" && c.fase !== "el taller") porFase.set(c.fase, [...(porFase.get(c.fase) ?? []), c]);
  return [...porFase.entries()]
    .filter(([, lista]) => lista.length >= 2 && lista.length >= Math.ceil(total / 2))
    .map(([fase, lista]) => ({ fase, cuantos: lista.length, ejemplo: lista[0]!.porQue }));
}

export async function aprenderDelEquipo(
  repo: string,
  datos: { objetivo: string; total: number; cortes: readonly CorteDeCompanero[]; integracion?: { fase: string; detalle?: string } },
): Promise<Recuerdo[]> {
  const aprendidos: Recuerdo[] = [];
  const tarea = recortar(datos.objetivo, 80);
  for (const r of cortesRepetidos(datos.cortes, datos.total)) {
    const dicho = `En el equipo de «${tarea}», ${r.cuantos} de ${datos.total} compañeros se cortaron en ${r.fase}. El motivo: ${recortar(r.ejemplo, 140)}`;
    aprendidos.push(await recordar(repo, dicho, undefined, "error", { origen: "sistema" }));
  }
  if (datos.integracion) {
    const motivo = datos.integracion.detalle ? `: ${recortar(datos.integracion.detalle.split("\n")[0]!, 140)}` : "";
    const dicho = `En el equipo de «${tarea}», cada parte pasó su portón pero juntas no pasaron ${datos.integracion.fase}${motivo}. Las partes tienen que encajar entre sí, no solo andar solas.`;
    aprendidos.push(await recordar(repo, dicho, undefined, "error", { origen: "sistema" }));
  }
  return aprendidos;
}

/**
 * Lo que la persona deshizo de un compañero: no dijo por qué, así que no es un error confirmado,
 * pero es una corrección suya. Va con los archivos que tocaba, que es de lo que se va a acordar
 * la memoria cuando otra tarea pase por ahí.
 */
export async function aprenderDeLoDeshechoEnElEquipo(repo: string, datos: { ruta: string; commit: string; titulo: string; objetivo?: string }): Promise<void> {
  const archivos = (await git(["diff", "--name-only", `${datos.commit}^1`, datos.commit], datos.ruta).catch(() => ""))
    .split("\n")
    .map((a) => a.trim())
    .filter(Boolean);
  const donde = archivos.length > 0 ? ` (tocaba ${archivos.slice(0, 4).join(", ")}${archivos.length > 4 ? ` y ${archivos.length - 4} más` : ""})` : "";
  const deQue = datos.objetivo ? ` del equipo de «${recortar(datos.objetivo, 80)}»` : "";
  await anotar(repo, [{ texto: `La persona deshizo «${recortar(datos.titulo, 80)}»${deQue}${donde}: ese enfoque no le sirvió.`, origen: "owner", tipo: "correccion" }], {
    cuando: new Date().toISOString(),
    tarea: datos.titulo,
  });
}
