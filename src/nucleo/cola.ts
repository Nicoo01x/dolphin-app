import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { mensajeDeEntrega, type Entregador } from "./entrega.js";
import { carpetaDeDolphin, enFila, escribirDeUna, leerEstado } from "./escritura.js";
import { firmar, firmaValida, llaveDeFirma, NO_FIRMADO } from "./firma.js";

/**
 * La cola de tareas: el multiplicador.
 *
 * Le das N tareas DISTINTAS y las trabaja a la vez, cada una en su propio
 * worktree, con un tope de concurrencia. Cuando una termina, su rama se
 * commitea y se compara contra las ya entregadas: si se mergean limpio,
 * queda lista; si chocan, la tarea se vuelve a sembrar ENCIMA de la rama
 * con la que chocó, una vez. Lo que te queda son ramas probadas que entran
 * juntas, no N carpetas que hay que reconciliar a mano.
 */

export type EstadoDeTarea = "esperando" | "trabajando" | "lista" | "no-salio" | "en-conflicto";

export interface TareaDeCola {
  readonly id: string;
  readonly tarea: string;
  readonly estado: EstadoDeTarea;
  readonly creada: string;
  readonly empezo?: string;
  readonly termino?: string;
  /** La rama entregada y su commit. */
  readonly rama?: string;
  readonly commit?: string;
  readonly worktree?: string;
  /** Por qué no salió, o con qué chocó. */
  readonly porQue?: string;
  /** Si se volvió a sembrar encima de otra tarea, cuál. */
  readonly sobre?: string;
  /** Si sale de un plan de Thinking: cuál, su título corto, el modelo y el tope de gasto que le tocaron. */
  readonly plan?: string;
  readonly titulo?: string;
  readonly modelo?: string;
  readonly presupuesto?: number;
  /** La tarea de la cola cuyo trabajo necesita: espera a que quede lista y se siembra encima de su commit. */
  readonly dependeDe?: string;
  /** La firma de la consola que la encoló (ver firma.ts): sin ella no corre. */
  readonly firma?: string;
  /** El proceso que la está trabajando: si ya no existe, la tarea se cortó. */
  readonly pid?: number;
}

export interface Cola {
  readonly tareas: readonly TareaDeCola[];
}

/** Una tarea para encolar con lo que trae del plan. */
export interface NuevaTarea {
  readonly tarea: string;
  readonly titulo?: string;
  readonly plan?: string;
  readonly modelo?: string;
  readonly presupuesto?: number;
  /** La posición, en este mismo pedido, de la tarea de la que depende (tiene que ser anterior). */
  readonly despuesDe?: number;
}

const rutaCola = (repo: string) => join(repo, ".dolphin", "cola.json");

/** Sin el proceso anotado (tareas de antes), lo que lleva más de esto «trabajando» ya no está trabajando. */
const HUERFANA_SIN_PID_MS = 6 * 60 * 60 * 1000;

export const SE_CORTO = "se cortó: su proceso ya no está";

function procesoVivo(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: existe, pero es de otro usuario.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Una tarea «trabajando» cuyo proceso murió (se cerró la consola, se cortó la
 * luz) quedaba trabajando para siempre: el tablero la mostraba con el punto
 * latiendo días después. Se lee como lo que es: no salió.
 */
export function sinHuerfanas(
  tareas: readonly TareaDeCola[],
  vive: (pid: number) => boolean = procesoVivo,
  ahora = Date.now(),
): TareaDeCola[] {
  return tareas.map((t) => {
    if (t.estado !== "trabajando") return t;
    const huerfana =
      t.pid !== undefined ? !vive(t.pid) : ahora - Date.parse(t.empezo ?? t.creada) > HUERFANA_SIN_PID_MS;
    return huerfana ? { ...t, estado: "no-salio", termino: t.termino ?? new Date(ahora).toISOString(), porQue: SE_CORTO } : t;
  });
}

export function leerCola(repo: string): Promise<Cola> {
  return leerEstado(rutaCola(repo), { tareas: [] }, (datos) => {
    const tareas = (datos as Partial<Cola> | null)?.tareas;
    return { tareas: Array.isArray(tareas) ? sinHuerfanas(tareas) : [] };
  });
}

// De una sola vez y en fila (ver escritura.ts): la consola la relee mientras la cola la cambia.
async function guardarCola(repo: string, cola: Cola): Promise<void> {
  await carpetaDeDolphin(repo);
  await escribirDeUna(rutaCola(repo), `${JSON.stringify(cola, null, 2)}\n`);
}

/** Cambia UNA tarea sobre lo que hay en disco: reescribir la lista que se leyó al arrancar pisaba lo encolado después. */
function guardarTarea(repo: string, tarea: TareaDeCola): Promise<void> {
  return enFila(rutaCola(repo), async () => {
    const cola = await leerCola(repo);
    await guardarCola(repo, { tareas: cola.tareas.map((t) => (t.id === tarea.id ? tarea : t)) });
  });
}

export async function encolar(repo: string, tareas: readonly (string | NuevaTarea)[]): Promise<TareaDeCola[]> {
  const llave = await llaveDeFirma();
  return enFila(rutaCola(repo), () => encolarAhora(repo, tareas, llave));
}

/** Lo que se firma de una tarea: qué hace, con qué y encima de qué. El estado no, que cambia. */
const firmable = (t: TareaDeCola) => ({
  id: t.id,
  tarea: t.tarea,
  titulo: t.titulo,
  plan: t.plan,
  modelo: t.modelo,
  presupuesto: t.presupuesto,
  dependeDe: t.dependeDe,
});

async function encolarAhora(repo: string, tareas: readonly (string | NuevaTarea)[], llave: Buffer): Promise<TareaDeCola[]> {
  const cola = await leerCola(repo);
  const pedidas = tareas.map((t) => (typeof t === "string" ? { tarea: t } : t)).filter((t) => t.tarea.trim() !== "");
  const ids = pedidas.map(() => `t${randomUUID().replace(/-/g, "").slice(0, 16)}`);
  const nuevas: TareaDeCola[] = pedidas.map((t, i) => {
    const tarea: TareaDeCola = {
      id: ids[i]!,
      tarea: t.tarea.trim(),
      estado: "esperando" as const,
      creada: new Date().toISOString(),
      ...(t.titulo ? { titulo: t.titulo } : {}),
      ...(t.plan ? { plan: t.plan } : {}),
      ...(t.modelo ? { modelo: t.modelo } : {}),
      ...(t.presupuesto !== undefined ? { presupuesto: t.presupuesto } : {}),
      // Solo hacia atrás: una dependencia hacia adelante dejaría a las dos esperándose.
      ...(t.despuesDe !== undefined && t.despuesDe >= 0 && t.despuesDe < i ? { dependeDe: ids[t.despuesDe]! } : {}),
    };
    return { ...tarea, firma: firmar(llave, firmable(tarea)) };
  });
  await guardarCola(repo, { tareas: [...cola.tareas, ...nuevas] });
  return nuevas;
}

/**
 * Toma una tarea para sembrarla, mirando el disco: si otra cola ya la tomó
 * (dos corridas sobre el mismo repo), no es de esta. Sin esto, aprobar un
 * plan y encolar algo desde Nueva sembraba lo mismo dos veces.
 */
function reclamar(repo: string, id: string): Promise<TareaDeCola | null> {
  return enFila(rutaCola(repo), async () => {
    const cola = await leerCola(repo);
    const tarea = cola.tareas.find((t) => t.id === id);
    if (tarea?.estado !== "esperando") return null;
    const tomada: TareaDeCola = { ...tarea, estado: "trabajando", empezo: new Date().toISOString(), pid: process.pid };
    await guardarCola(repo, { tareas: cola.tareas.map((t) => (t.id === id ? tomada : t)) });
    return tomada;
  });
}

export interface ResultadoDeSembrar {
  /** La rama elegida y su worktree; sin esto, la tarea no salió. */
  readonly rama?: string;
  readonly worktree?: string;
  readonly porQue?: string;
}

/**
 * Siembra UNA tarea sobre un commit base. La cola no sabe cómo: se lo pasan.
 * Con el modelo y el tope de gasto que le tocaron, si vino de un plan.
 */
export type Sembrador = (
  tarea: string,
  base: string,
  extra?: { readonly modelo?: string; readonly presupuesto?: number },
) => Promise<ResultadoDeSembrar>;

export interface OpcionesDeCola {
  readonly concurrencia?: number;
  readonly sembrar: Sembrador;
  readonly entregar: Entregador;
  readonly alCambiar?: (tarea: TareaDeCola) => void;
  /**
   * Las tareas que le tocan a ESTA corrida. Sin esto, todas las que esperan:
   * así una cola corría tareas que nadie le pidió (las de otro plan, o las
   * que dejó otra corrida a medias).
   */
  readonly ids?: readonly string[];
}

export async function correrCola(repo: string, opciones: OpcionesDeCola): Promise<Cola> {
  const concurrencia = Math.max(1, opciones.concurrencia ?? 3);
  const llave = await llaveDeFirma();
  const tareas = [...(await leerCola(repo)).tareas];
  const base = await opciones.entregar.head();
  const pedidas = opciones.ids ? new Set(opciones.ids) : undefined;
  // Contra qué se compara al entregar: las de esta corrida. Una «lista» de la
  // semana pasada ya pudo mergearse o descartarse, y sembrar encima de ella la arrastraba.
  const deEstaCorrida = new Set<string>();

  // Un cambio por vez a la cola en disco, aunque terminen dos tareas juntas.
  // Un disco que falla no tira la corrida: lo hecho vuelve igual en el resumen.
  let guardando: Promise<void> = Promise.resolve();
  const actualizar = (id: string, cambio: Partial<TareaDeCola>) => {
    const i = tareas.findIndex((t) => t.id === id);
    if (i < 0) return;
    const tarea = { ...tareas[i]!, ...cambio };
    tareas[i] = tarea;
    opciones.alCambiar?.(tarea);
    guardando = guardando.then(() => guardarTarea(repo, tarea)).catch(() => {});
  };

  // La entrega va de a una: comparar contra «las ya entregadas» tiene que
  // ver siempre la misma lista, o dos tareas que chocan entre sí pasarían
  // las dos porque cada una se comparó antes de que la otra quedara lista.
  // Una que falla al entregar no traba a las que vienen detrás.
  let entregando: Promise<void> = Promise.resolve();
  const entregar = (id: string, resultado: ResultadoDeSembrar) => {
    entregando = entregando.catch(() => {}).then(async () => {
      try {
        await entregarUna(id, resultado);
      } catch (error) {
        actualizar(id, {
          estado: "no-salio",
          termino: new Date().toISOString(),
          ...(resultado.rama ? { rama: resultado.rama } : {}),
          ...(resultado.worktree ? { worktree: resultado.worktree } : {}),
          porQue: `pasó el portón, pero no se pudo entregar: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    });
    return entregando;
  };

  /** Lo que la tarea trae del plan: con eso se siembra, también cuando se vuelve a sembrar encima de otra. */
  const extraDe = (tarea: TareaDeCola) => ({
    ...(tarea.modelo ? { modelo: tarea.modelo } : {}),
    ...(tarea.presupuesto !== undefined ? { presupuesto: tarea.presupuesto } : {}),
  });

  const entregarUna = async (id: string, resultado: ResultadoDeSembrar, yaReintentada = false): Promise<void> => {
    const tarea = tareas.find((t) => t.id === id)!;
    if (!resultado.rama || !resultado.worktree) {
      actualizar(id, { estado: "no-salio", termino: new Date().toISOString(), porQue: resultado.porQue ?? "ninguna rama pasó el portón" });
      return;
    }

    const commit = await opciones.entregar.commitear(resultado.worktree, mensajeDeEntrega(tarea.tarea));
    const listas = tareas.filter((t) => t.estado === "lista" && t.commit && deEstaCorrida.has(t.id));

    for (const otra of listas) {
      const archivos = await opciones.entregar.chocan(otra.commit!, commit);
      if (archivos.length === 0) continue;

      if (!yaReintentada) {
        // Se vuelve a sembrar ENCIMA de la que ya estaba: el agente ve su
        // trabajo y escribe el suyo sin pisarlo. Una vez; si vuelve a chocar,
        // lo decide una persona.
        actualizar(id, { estado: "trabajando", sobre: otra.id, porQue: `chocaba con «${otra.tarea}» en ${archivos.join(", ")}: se vuelve a sembrar encima` });
        const segunda = await opciones.sembrar(tarea.tarea, otra.commit!, extraDe(tarea)).catch(
          (error: unknown): ResultadoDeSembrar => ({ porQue: error instanceof Error ? error.message : String(error) }),
        );
        await entregarUna(id, segunda, true);
        return;
      }
      actualizar(id, {
        estado: "en-conflicto",
        termino: new Date().toISOString(),
        rama: resultado.rama,
        commit,
        porQue: `choca con «${otra.tarea}» en ${archivos.join(", ")}, aun sembrada encima`,
      });
      return;
    }

    const sobre = yaReintentada ? tareas.find((t) => t.id === tarea.sobre) : undefined;
    actualizar(id, {
      estado: "lista",
      termino: new Date().toISOString(),
      rama: resultado.rama,
      commit,
      worktree: resultado.worktree,
      ...(sobre ? { porQue: `se sembró encima de «${sobre.tarea}» para no chocar: mergeala después de esa` } : {}),
    });
  };

  // El tope de concurrencia: N sembradores tomando de la misma fila. Una
  // tarea que depende de otra espera a que esa termine: si quedó lista, se
  // siembra ENCIMA de su commit (ve su trabajo); si no salió, esta tampoco.
  const pendientes: string[] = [];
  for (const t of tareas) {
    if (t.estado !== "esperando" || (pedidas && !pedidas.has(t.id))) continue;
    // Lo que no firmó esta máquina no corre: pudo venir escrito en el repo (ver firma.ts).
    if (!firmaValida(llave, firmable(t), t.firma)) {
      actualizar(t.id, { estado: "no-salio", termino: new Date().toISOString(), porQue: NO_FIRMADO });
      continue;
    }
    pendientes.push(t.id);
    deEstaCorrida.add(t.id);
  }
  let sembrando = 0;
  const dormidos: (() => void)[] = [];
  const despertar = () => dormidos.splice(0).forEach((seguir) => seguir());
  const nombre = (t: TareaDeCola) => t.titulo ?? t.tarea;

  const proxima = (): { id: string; base: string } | "esperar" | null => {
    for (let k = 0; k < pendientes.length; k++) {
      const tarea = tareas.find((t) => t.id === pendientes[k])!;
      const previa = tarea.dependeDe ? tareas.find((t) => t.id === tarea.dependeDe) : undefined;
      if (!tarea.dependeDe || (previa?.estado === "lista" && previa.commit)) {
        pendientes.splice(k, 1);
        return { id: tarea.id, base: previa?.commit ?? base };
      }
      // Una que no salió, o que ya no está, no va a estar nunca: esta no espera más.
      // Y si nadie está sembrando, lo que falta no va a terminar en esta corrida.
      const rota = !previa || previa.estado === "no-salio" || previa.estado === "en-conflicto";
      if (rota || (sembrando === 0 && !pendientes.includes(previa.id))) {
        pendientes.splice(k--, 1);
        actualizar(tarea.id, {
          estado: "no-salio",
          termino: new Date().toISOString(),
          porQue: previa ? `dependía de «${nombre(previa)}», que no salió` : "dependía de una tarea que ya no está en la cola",
        });
      }
    }
    return pendientes.length > 0 ? "esperar" : null;
  };

  const trabajador = async () => {
    for (;;) {
      const siguiente = proxima();
      if (siguiente === null) return;
      if (siguiente === "esperar") {
        await new Promise<void>((seguir) => dormidos.push(seguir));
        continue;
      }
      sembrando++;
      try {
        const tomada = await reclamar(repo, siguiente.id).catch(() => null);
        if (!tomada) {
          // La tomó otra corrida: es suya, y acá se deja de esperar por ella.
          const i = tareas.findIndex((t) => t.id === siguiente.id);
          if (i >= 0) tareas[i] = { ...tareas[i]!, estado: "trabajando" };
          deEstaCorrida.delete(siguiente.id);
          continue;
        }
        const tarea = tomada;
        const i = tareas.findIndex((t) => t.id === tarea.id);
        tareas[i] = tarea;
        opciones.alCambiar?.(tarea);
        let resultado: ResultadoDeSembrar;
        try {
          resultado = await opciones.sembrar(tarea.tarea, siguiente.base, extraDe(tarea));
        } catch (error) {
          resultado = { porQue: error instanceof Error ? error.message : String(error) };
        }
        await entregar(tarea.id, resultado);
      } finally {
        sembrando--;
        despertar();
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrencia, pendientes.length) }, () => trabajador()));
  await entregando;
  await guardando;
  return { tareas };
}
