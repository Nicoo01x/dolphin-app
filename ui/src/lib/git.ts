import { conProyecto, RespuestaMala } from "./api";

/** Lo que el servidor cuenta de un repo de git: el espejo de src/nucleo/vista-git.ts. */

export interface Persona {
  readonly nombre: string;
  readonly login?: string;
  readonly avatar?: string;
}

export interface Rama {
  readonly nombre: string;
  readonly actual: boolean;
  readonly deDolphin: boolean;
  readonly hash: string;
  readonly mensaje: string;
  readonly fecha: string;
  readonly autores: readonly Persona[];
  readonly adelante: number;
  readonly atras: number;
  readonly mergeada: boolean;
  readonly pr?: { readonly numero: number; readonly estado: string; readonly url: string };
}

export interface Commit {
  readonly hash: string;
  readonly hashCorto: string;
  readonly mensaje: string;
  readonly fecha: string;
  readonly autor: Persona;
  readonly refs: readonly string[];
}

export interface Issue {
  readonly numero: number;
  readonly titulo: string;
  readonly abierto: boolean;
  readonly etiquetas: readonly string[];
  readonly asignados: readonly Persona[];
  readonly autor?: Persona;
  /** Cuándo lo abrieron. */
  readonly fecha: string;
  /** Cuándo se movió por última vez: es la fecha que mira una lista de issues. */
  readonly actualizado: string;
  readonly url: string;
}

export type RespuestaGit<T> = { readonly esGit: false } | ({ readonly esGit: true } & T);

/** Una tabla mientras carga, cuando salió bien, cuando no hay nada que mostrar y cuando se rompió. */
export type EstadoDeTabla<T> =
  | { readonly que: "cargando" }
  | { readonly que: "listo"; readonly filas: T[] }
  | { readonly que: "nada"; readonly porQue: string }
  | { readonly que: "error"; readonly porQue: string };

export interface CambioDeArchivo {
  readonly archivo: string;
  readonly agregadas: number;
  readonly quitadas: number;
}

/** Lo que cambió un commit: el mensaje entero, sus archivos y el diff (contra el primer padre si es un merge). */
export interface DetalleDeCommit {
  readonly mensaje: string;
  readonly archivos: readonly CambioDeArchivo[];
  readonly diff: string;
  readonly recortado: boolean;
}

async function traerGit<T>(que: "ramas" | "commits" | "issues" | "issue" | "rama" | "commit", extra = ""): Promise<RespuestaGit<T>> {
  const respuesta = await fetch(conProyecto(`/api/git?que=${que}${extra}`));
  const datos = (await respuesta.json().catch(() => ({}))) as RespuestaGit<T> & { porQue?: string };
  if (!respuesta.ok) throw new RespuestaMala(respuesta.status, datos.porQue ?? `el servidor contestó ${respuesta.status}`);
  return datos;
}

export const traerRamas = () => traerGit<{ ramas: Rama[] }>("ramas");
export const traerCommits = (rama?: string) => traerGit<{ commits: Commit[] }>("commits", rama ? `&rama=${encodeURIComponent(rama)}` : "");
/** Los commits de una rama: `propios` son los de arriba que la base no tiene (sin él, la rama es la base). */
export const traerRama = (rama: string) => traerGit<{ commits: Commit[]; propios?: number }>("rama", `&rama=${encodeURIComponent(rama)}`);
export const traerCommit = (hash: string) => traerGit<DetalleDeCommit>("commit", `&hash=${encodeURIComponent(hash)}`);
export const traerIssues = () =>
  traerGit<{ disponible: true; issues: Issue[]; repo?: string; nuevoIssue?: string; yo?: string } | { disponible: false; porQue: string }>("issues");

/** Un issue como tarea para un agente: título, cuerpo y link. No siembra nada. */
export const traerTareaDeIssue = (numero: number) => traerGit<{ tarea: string }>("issue", `&numero=${numero}`);
