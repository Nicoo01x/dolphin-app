import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { git, gitDice, gitValor } from "../nucleo/git.js";
import type { Agente, Universo } from "../nucleo/tipos.js";

/**
 * La cola de merge del equipo: las ramas entran a la integración de a una, en el orden del plan.
 * Si una choca, antes se abortaba y ese trabajo —que había pasado su portón— se perdía. Ahora un
 * agente resuelve SOLO los archivos en conflicto, ahí mismo; se comprueba que no quede ninguna
 * marca y recién entonces se cierra el merge. Lo que resolvió lo juzga después el portón final
 * entero sobre la integración, como a todo lo demás: resolver no es aprobar.
 */

/** Quien resuelve un merge que chocó: deja los archivos sin marcas de conflicto. Devuelve lo que gastó. */
export type Resolutor = (pedido: { ruta: string; archivos: readonly string[]; tarea: string; rama: string }) => Promise<{ gastado: number }>;

export interface RamaParaIntegrar {
  readonly id: string;
  readonly rama: string;
  readonly titulo: string;
}

export interface ResultadoDeMerge {
  readonly id: string;
  readonly ok: boolean;
  readonly commit?: string;
  readonly porQue?: string;
  /** Los archivos que tuvo que resolver el agente, si chocó. */
  readonly resuelto?: readonly string[];
  readonly gastado: number;
}

const MARCA = /^(<{7}|={7}|>{7})(\s|$)/m;

/** Los archivos que todavía tienen marcas de conflicto (o que no se pueden leer). */
export async function conMarcas(ruta: string, archivos: readonly string[]): Promise<string[]> {
  const quedan: string[] = [];
  for (const archivo of archivos) {
    const texto = await readFile(join(ruta, archivo), "utf8").catch(() => null);
    // Un archivo que el merge borró de un lado y el agente sacó no tiene marcas: no está.
    if (texto !== null && MARCA.test(texto)) quedan.push(archivo);
  }
  return quedan;
}

export function pedidoDeResolver(archivos: readonly string[], tarea: string, rama: string): string {
  return [
    `Estás en la rama de integración de un equipo de Dolphin, en medio de un git merge de la rama ${rama} que chocó. Esa rama hace: «${tarea}».`,
    `Resolvé los conflictos de estos archivos: ${archivos.join(", ")}.`,
    "Los dos lados son trabajo que ya pasó su portón: conservá lo que hace cada uno y combinalos para que funcionen juntos. Sacá todas las marcas <<<<<<<, ======= y >>>>>>>.",
    "No toques otros archivos, no hagas commit y no abortes el merge: del resto se encarga Dolphin, y después el portón prueba todo junto.",
  ].join("\n");
}

/** El resolutor de siempre: el mismo agente del equipo, sobre el worktree de la integración. */
export function resolutorConAgente(agente: Agente): Resolutor {
  return async ({ ruta, archivos, tarea, rama }) => {
    const universo: Universo = { id: "equipo", rama: await gitValor(["rev-parse", "--abbrev-ref", "HEAD"], ruta).catch(() => ""), ruta, nacido: Date.now() };
    const trabajo = await agente.trabajar(universo, pedidoDeResolver(archivos, tarea, rama));
    return { gastado: trabajo.gastado ?? 0 };
  };
}

const primeraLinea = (error: unknown) => (error instanceof Error ? error.message.split("\n")[0]! : String(error));

/**
 * Mergea una rama en la integración. Si choca y hay quien resuelva, lo intenta una vez; si quedan
 * marcas, si el agente abortó el merge o si algo falla, la integración vuelve a como estaba antes de
 * esta rama y se dice por qué.
 */
export async function integrarUna(ruta: string, r: RamaParaIntegrar, resolver: Resolutor | null): Promise<ResultadoDeMerge> {
  const antes = await gitValor(["rev-parse", "HEAD"], ruta);
  const volver = async () => {
    await git(["merge", "--abort"], ruta).catch(() => "");
    await git(["reset", "--hard", antes], ruta).catch(() => "");
  };
  try {
    await git(["merge", "--no-ff", "--no-edit", "-m", `equipo: ${r.titulo}`, r.rama], ruta);
    return { id: r.id, ok: true, commit: await gitValor(["rev-parse", "HEAD"], ruta), gastado: 0 };
  } catch (error) {
    const archivos = (await git(["diff", "--name-only", "--diff-filter=U"], ruta).catch(() => "")).split("\n").map((a) => a.trim()).filter(Boolean);
    if (archivos.length === 0 || !resolver) {
      await volver();
      return { id: r.id, ok: false, porQue: archivos.length ? `choca en ${archivos.join(", ")}` : primeraLinea(error), gastado: 0 };
    }
    let gastado = 0;
    try {
      gastado = (await resolver({ ruta, archivos, tarea: r.titulo, rama: r.rama })).gastado;
      const quedan = await conMarcas(ruta, archivos);
      if (quedan.length > 0) {
        await volver();
        return { id: r.id, ok: false, porQue: `choca en ${archivos.join(", ")} y la resolución dejó marcas en ${quedan.join(", ")}`, gastado };
      }
      if (await gitDice(["rev-parse", "-q", "--verify", "MERGE_HEAD"], ruta)) {
        // El pedido permite tocar otro archivo si hace falta para que compile: el commit debe
        // contener exactamente lo que el portón final va a juzgar, no solo los conflictos.
        await git(["add", "-A"], ruta);
        await git(["commit", "--no-edit"], ruta);
      } else if (!(await gitDice(["merge-base", "--is-ancestor", r.rama, "HEAD"], ruta))) {
        // El agente cortó el merge en vez de resolverlo: no entró nada de esa rama.
        await volver();
        return { id: r.id, ok: false, porQue: `choca en ${archivos.join(", ")} y el merge se abortó en vez de resolverse`, gastado };
      }
      return { id: r.id, ok: true, commit: await gitValor(["rev-parse", "HEAD"], ruta), resuelto: archivos, gastado };
    } catch (fallo) {
      await volver();
      return { id: r.id, ok: false, porQue: `choca en ${archivos.join(", ")} y no se pudo resolver: ${primeraLinea(fallo)}`, gastado };
    }
  }
}
