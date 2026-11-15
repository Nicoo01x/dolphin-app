import { leerConfig } from "./config.js";
import { gitValor } from "./git.js";
import { leerMemoria, verificadoresDeMemoria } from "./memoria.js";
import { cruzarPorton, ordenarPorCosto } from "./porton.js";
import { leerSpecs, verificadorDeSpecs } from "./spec.js";
import { TallerDeGit } from "./taller.js";
import type { Costo, Pasada, Taller, Verificador } from "./tipos.js";
import { fasesDelPaquete, verificadoresDelPorton, verificadoresDeNpm } from "./verificadores.js";

/**
 * El portón de UNA rama, para quien no usa Dolphin.
 *
 * Es el mismo portón de una siembra —las mismas fases, de la más barata a la
 * más cara, y el mismo corte en la primera que falla— pero pedido desde
 * afuera: un agente que acaba de escribir una rama pregunta si pasa, y recibe
 * el motivo del rebote en las mismas palabras que vería la persona. No hace
 * falta la consola, ni la terminal, ni el escritorio.
 *
 * Dos reglas que lo hacen seguro de llamar:
 *
 * - **No toca el árbol de trabajo de nadie.** Se prueba el commit de la rama
 *   en un worktree propio y descartable, no lo que haya sin commitear.
 * - **No gasta.** Solo las fases gratis (tipos, lint, tests, la memoria, los
 *   comandos del repo). Las que pagan un modelo —vision, la revisión cruzada—
 *   quedan afuera: que una llamada de un agente dispare gasto a espaldas de
 *   quien paga es exactamente lo que no queremos.
 */

/** Por fase. Una colgada no deja esperando para siempre a quien llamó. */
const TOPE_POR_FASE_MS = 10 * 60_000;

export interface FaseDelPorton {
  readonly nombre: string;
  readonly costo: Costo;
}

export interface FaseCruzada extends FaseDelPorton {
  readonly paso: boolean;
  /** En voz humana: «test: ✖ suma con negativos». */
  readonly detalle: string;
  readonly ms: number;
  /** No corrió: faltaba con qué. Deja pasar, pero no cuenta como pasada. */
  readonly salteada?: boolean;
}

export interface RamaProbada {
  readonly rama: string;
  /** El commit que se probó: la rama tal como está commiteada. */
  readonly commit: string;
  /**
   * Contra qué se midió lo que la rama agrega. Importa decirlo: las fases que
   * leen el diff —las que nacieron de correcciones— miran de acá para
   * adelante, y con la base equivocada no ven nada y pasan de taquito.
   */
  readonly base: string;
  readonly paso: boolean;
  readonly fases: readonly FaseCruzada[];
  /** Qué fase la rebotó y por qué. Ausente si pasó. */
  readonly rebote?: { readonly fase: string; readonly porQue: string };
  /** Las que no llegaron a correr porque el rebote las frenó. */
  readonly sinCorrer: readonly string[];
  /** Las fases que existen en este repo pero piden plata, y por eso no corrieron. */
  readonly sinCorrerPorqueCuestan: readonly string[];
}

/** Las fases de este repo, ya ordenadas por costo. Lo que una rama va a cruzar. */
export async function verificadoresDeLaRama(repo: string): Promise<Verificador[]> {
  const config = await leerConfig(repo);
  const [memoria, specs, deNpm] = await Promise.all([
    leerMemoria(repo),
    leerSpecs(repo),
    // Con las que construyen: una rama que se entrega tiene que compilar.
    fasesDelPaquete(repo),
  ]);
  return ordenarPorCosto([
    ...(specs.length > 0 ? [verificadorDeSpecs()] : []),
    ...verificadoresDeMemoria(memoria),
    ...verificadoresDeNpm(deNpm, { tope: TOPE_POR_FASE_MS }),
    ...verificadoresDelPorton(config.porton?.comandos, { tope: TOPE_POR_FASE_MS }),
  ]);
}

/** Las que este repo tiene configuradas pero no se corren de afuera porque pagan un modelo. */
export async function fasesQueCuestan(repo: string): Promise<string[]> {
  const config = await leerConfig(repo);
  return [...(config.pantalla && config.vision ? ["vision"] : []), ...(config.uso ? ["uso"] : []), "revisión"];
}

/** Qué va a cruzar una rama, sin correr nada: el agente sabe a qué se enfrenta antes de escribir. */
export async function fasesDeUnaRama(repo: string): Promise<FaseDelPorton[]> {
  return (await verificadoresDeLaRama(repo)).map((v) => ({ nombre: v.nombre, costo: v.costo }));
}

export interface OpcionesDeProbarRama {
  /** Contra qué se mide lo que la rama agrega. Por defecto, de dónde salió (ver baseDeLaRama). */
  readonly base?: string;
  /** Se inyecta en los tests; por defecto, worktrees de git de verdad. */
  readonly taller?: Taller;
  /** Se inyectan en los tests; por defecto, las fases del repo. */
  readonly verificadores?: readonly Verificador[];
}

/**
 * De dónde salió la rama: el ancestro común con lo que hay en HEAD. Es contra
 * eso que se mide lo que agrega.
 *
 * Si el ancestro ES la punta de la rama —pasa cuando el repo está parado en la
 * rama que se prueba—, no hay nada que comparar; en ese caso se usa el commit
 * anterior, así las fases que leen el diff ven al menos la última entrega.
 */
export async function baseDeLaRama(repo: string, rama: string, commit: string): Promise<string> {
  const comun = await gitValor(["merge-base", rama, "HEAD"], repo).catch(() => "");
  if (comun && comun !== commit) return comun;
  return (await gitValor(["rev-parse", "--verify", `${commit}^`], repo).catch(() => "")) || commit;
}

export async function probarRama(repo: string, rama: string, opciones: OpcionesDeProbarRama = {}): Promise<RamaProbada> {
  const commit = await gitValor(["rev-parse", "--verify", `${rama}^{commit}`], repo).catch(() => "");
  if (!commit) throw new Error(`no existe la rama «${rama}» en ${repo}`);
  const base = opciones.base ?? (await baseDeLaRama(repo, rama, commit));

  const verificadores = opciones.verificadores ?? (await verificadoresDeLaRama(repo));
  const config = await leerConfig(repo);
  const taller =
    opciones.taller ??
    new TallerDeGit(repo, undefined, commit, { ...(config.entorno ? { config: config.entorno } : {}) });

  // La rama de trabajo lleva el nombre de la que se prueba: si algo queda
  // colgado en disco, se sabe de dónde salió.
  const universo = await taller.abrir("porton", `dolphin/porton/${rama.replace(/[^\w.-]+/g, "-")}`);
  try {
    // El worktree se abre en la punta de la rama, pero el diff se mide desde
    // la base: el taller deja las dos cosas en el mismo commit, y así una
    // fase de la memoria vería un diff vacío.
    const { candidatos } = await cruzarPorton([{ ...universo, base }], verificadores);
    const candidato = candidatos[0]!;
    const fases = candidato.pasadas.map(aFase);
    const corridas = new Set(fases.map((f) => f.nombre));
    return {
      rama,
      commit,
      base,
      paso: candidato.vivo,
      fases,
      ...(candidato.murioEn ? { rebote: { fase: candidato.murioEn, porQue: candidato.porQue ?? "sin motivo" } } : {}),
      sinCorrer: verificadores.filter((v) => !corridas.has(v.nombre)).map((v) => v.nombre),
      sinCorrerPorqueCuestan: await fasesQueCuestan(repo),
    };
  } finally {
    // Que el worktree quede colgado no puede ser el resultado de una consulta.
    await taller.cerrar(universo).catch(() => {});
  }
}

function aFase(pasada: Pasada): FaseCruzada {
  return {
    nombre: pasada.verificador,
    costo: pasada.costo,
    paso: pasada.paso,
    detalle: pasada.detalle,
    ms: pasada.ms,
    ...(pasada.salteada ? { salteada: true } : {}),
  };
}
