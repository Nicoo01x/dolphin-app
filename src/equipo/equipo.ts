import { randomUUID } from "node:crypto";
import { correrCola, encolar, leerCola, type NuevaTarea, type TareaDeCola } from "../nucleo/cola.js";
import { leerDesempeno } from "../nucleo/desempeno.js";
import { entregadorDeGit, ramaActual } from "../nucleo/entrega.js";
import { estimarPlan, type Estimacion } from "../nucleo/estimar.js";
import { reducirEvento, type EventoEnVivo } from "../nucleo/en-vivo.js";
import { git, gitValor } from "../nucleo/git.js";
import { esperaA, planificar, type Planificador, type TareaDelPlan } from "../nucleo/plan.js";
import { modeloDelEscalon, type Motor } from "../nucleo/router.js";
import type { Universo, Verificador } from "../nucleo/tipos.js";
import { prepararSiembra, sembrarTarea, tallerDeLaSiembra, type PedidoDeTarea } from "../siembra.js";
import { vigilarChoques } from "./choques.js";
import { integrarUna, resolutorConAgente, type Resolutor } from "./integrar.js";
import { aprenderDeLoDeshechoEnElEquipo, aprenderDelEquipo, type CorteDeCompanero } from "./aprender.js";
import { volverAlTurno } from "../nucleo/turnos.js";
import {
  actualizarEstadoCompanero,
  inicializarEquipo,
  leerMensajes,
  registrarCompaneros,
  reservarRetoma,
  type EstadoDeCompanero,
} from "./buzon.js";

/**
 * Dolphin en modo equipo: una tarea grande, un líder que la parte y compañeros que la hacen a la
 * vez, cada uno en su rama. Arma lo que ya existe en vez de duplicarlo:
 *   plan    → `planificar` (Dolphin Thinking): tareas con escalón, presupuesto y dependencias.
 *   spawn/claim/work → la cola: las independientes en paralelo, cada dependiente encima del commit
 *           de la que necesita, y al entregar se comprueba que entren juntas (si chocan, se
 *           vuelve a sembrar encima).
 *   merge   → una rama de integración con todas las listas, en el orden en que entraron.
 *   review  → otro modelo lee el diff ENTERO del equipo contra el punto de partida.
 *   ship    → el portón corre sobre la integración; si pasa, la rama queda lista para mergear.
 * Todo lo cuenta por `alPasar` (EventoEquipo): es lo que dibuja el tablero de la terminal.
 */

export type EtapaDeEquipo = "plan" | "spawn" | "work" | "merge" | "review" | "ship";

export type EventoEquipo =
  | { tipo: "arranca"; objetivo: string; agente: string; lider?: string; revisor?: string; fases: string[] }
  | { tipo: "etapa"; etapa: EtapaDeEquipo }
  | { tipo: "plan"; resumen: string; costo: number; tareas: { id: string; titulo: string; modelo?: string; dependeDe?: string }[]; corregido?: boolean }
  | { tipo: "plan-fallo"; porQue: string }
  | { tipo: "tarea"; id: string; estado: TareaDeCola["estado"]; rama?: string; porQue?: string }
  | { tipo: "companero"; id: string; evento: EventoEnVivo }
  | { tipo: "estado-companero"; id: string; estado: EstadoDeCompanero }
  | { tipo: "worktree"; id: string; ruta: string }
  | { tipo: "choque"; ids: readonly [string, string]; archivos: readonly string[] }
  | { tipo: "merge"; id: string; ok: boolean; porQue?: string; commit?: string; resuelto?: readonly string[] }
  | { tipo: "deshecha"; id: string; ok: boolean; porQue: string }
  | { tipo: "fase-final"; verificador: string; estado: "corre" | "paso" | "fallo" | "salteada"; ms?: number; detalle?: string }
  | { tipo: "fin"; rama?: string; ruta?: string; porQue: string; ms: number; gastado: number; base?: string; ramaBase?: string };

export interface PedidoDeEquipo {
  readonly repo: string;
  readonly objetivo: string;
  readonly agente: Motor;
  readonly verificar: readonly string[];
  /** Cuántos compañeros trabajan a la vez. */
  readonly concurrencia?: number;
  readonly automatico?: boolean;
  /** Quién parte la tarea. */
  readonly pensar: Planificador;
  /** Quién revisa el diff del equipo; null para no revisar. */
  readonly revisor: Verificador | null;
  readonly nombres?: { lider?: string; revisor?: string };
  /**
   * Entre el plan y el arranque: ve el plan con lo que va a costar y decide. true arranca; un texto
   * corta con ese motivo. Sin esto arranca solo (lo que corre en automático).
   */
  readonly aprobar?: (plan: { resumen: string; tareas: readonly TareaDelPlan[]; estimacion: Estimacion }) => Promise<Aprobacion>;
  /** Cada cuánto se miran los worktrees buscando choques (ver choques.ts). */
  readonly vigilarCadaMs?: number;
  /** Quién resuelve una rama que choca al integrarse; null para no intentarlo. Sin esto, el agente del equipo. */
  readonly resolver?: Resolutor | null;
  /** Identificador compartido por el buzón y el estado; si falta, se crea uno. */
  readonly equipo?: string;
}

/**
 * El pedido que recibe el compañero: el de su tarea y, si el líder dijo qué archivos le tocan, esa
 * lista y el aviso de que hay otros trabajando al lado.
 */
export function pedidoDelCompanero(t: Pick<TareaDelPlan, "tarea" | "archivos">, buzon?: { equipo: string; companero: string }): string {
  return [
    t.tarea,
    ...(t.archivos?.length
      ? [
          "",
          `Archivos de esta tarea: ${t.archivos.join(", ")}.`,
          "Hay otros compañeros trabajando al mismo tiempo en otras partes del repo: no toques archivos fuera de esta lista salvo que sea imprescindible para que funcione.",
        ]
      : []),
    ...(buzon
      ? [
          "",
          `Este equipo tiene un buzón compartido (${buzon.equipo}); sos ${buzon.companero}.`,
          'Para hablar con otro compañero, usá `dolphin buzon enviar @compañero "texto"`; para leer o esperar, `dolphin buzon leer` y `dolphin buzon esperar @compañero --hasta libre|terminado`.',
        ]
      : []),
  ].join("\n");
}

/** Qué contesta quien aprueba: arrancar, cortar con un motivo, o arrancar con el plan que corrigió. */
export type Aprobacion = true | string | { readonly tareas: readonly TareaDelPlan[] };

export interface ResultadoDeEquipo {
  readonly rama?: string;
  readonly ruta?: string;
  /** De qué commit y de qué rama salió el equipo: a dónde se integra lo que hizo. */
  readonly base?: string;
  readonly ramaBase?: string;
  readonly porQue: string;
  readonly ms: number;
  readonly gastado: number;
}

/** Los nombres que ve la persona: cortos y por rol, como en un equipo de verdad. */
const NOMBRES = ["ux", "backend", "tests", "docs", "datos", "infra", "api", "ui"];

export function nombreDeCompanero(indice: number, titulo: string): string {
  const t = titulo.toLowerCase();
  if (/\b(test|prueba)/.test(t)) return "tests";
  if (/\b(doc|readme|changelog)/.test(t)) return "docs";
  if (/\b(ui|pantalla|vista|bot[oó]n|css|estilo|interfaz)/.test(t)) return "ux";
  if (/\b(api|endpoint|ruta|servidor|l[oó]gica|modelo|servicio)/.test(t)) return "backend";
  return NOMBRES[indice % NOMBRES.length] ?? `t${indice + 1}`;
}

export async function correrEquipo(pedido: PedidoDeEquipo, alPasar: (evento: EventoEquipo) => void): Promise<ResultadoDeEquipo> {
  const desde = Date.now();
  let gastado = 0;
  const equipo = pedido.equipo ?? `equipo-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`;
  const estadosPendientes: Promise<void>[] = [];
  let nombresEquipo: string[] = [];
  let nombrePorTarea = new Map<string, string>();
  const cambiarEstado = (id: string, estado: EstadoDeCompanero): void => {
    const nombre = nombrePorTarea.get(id);
    if (!nombre) return;
    estadosPendientes.push(actualizarEstadoCompanero(pedido.repo, equipo, nombre, estado).catch(() => {}));
    alPasar({ tipo: "estado-companero", id, estado });
  };
  const pedidoBase: PedidoDeTarea = {
    repo: pedido.repo,
    tarea: pedido.objetivo,
    agente: pedido.agente,
    verificar: pedido.verificar,
    automatico: pedido.automatico ?? false,
  };
  const preparada = await prepararSiembra(pedidoBase);
  alPasar({
    tipo: "arranca",
    objetivo: pedido.objetivo,
    agente: pedido.agente,
    ...(pedido.nombres?.lider ? { lider: pedido.nombres.lider } : {}),
    ...(pedido.nombres?.revisor ? { revisor: pedido.nombres.revisor } : {}),
    fases: [...preparada.verificadores.map((v) => v.nombre), ...(pedido.revisor ? [pedido.revisor.nombre] : [])],
  });
  await inicializarEquipo(pedido.repo, equipo);
  // De dónde sale el equipo: la rama donde estabas, para integrar ahí lo que haga.
  const ramaBase = await ramaActual(pedido.repo).catch(() => undefined);
  let base: string | undefined;
  const terminar = (porQue: string, rama?: string, ruta?: string): ResultadoDeEquipo => {
    const resultado = {
      porQue,
      ms: Date.now() - desde,
      gastado,
      ...(rama ? { rama } : {}),
      ...(ruta ? { ruta } : {}),
      ...(base ? { base } : {}),
      ...(ramaBase ? { ramaBase } : {}),
    };
    alPasar({ tipo: "fin", ...resultado });
    return resultado;
  };

  // plan: el líder lee el repo y parte la tarea.
  alPasar({ tipo: "etapa", etapa: "plan" });
  const plan = await planificar(pedido.objetivo, pedido.repo, pedido.pensar);
  if ("porQue" in plan) {
    alPasar({ tipo: "plan-fallo", porQue: plan.porQue });
    return terminar(`el líder no pudo armar el plan: ${plan.porQue}`);
  }
  gastado += plan.costoDelPlan;
  let tareas: readonly TareaDelPlan[] = plan.tareas;
  const contarPlan = (corregido = false) =>
    alPasar({
      tipo: "plan",
      ...(corregido ? { corregido } : {}),
      resumen: plan.resumen,
      costo: plan.costoDelPlan,
      tareas: tareas.map((t) => {
        const modelo = modeloDelEscalon(pedido.agente, t.escalon);
        return { id: t.id, titulo: t.titulo, ...(modelo ? { modelo } : {}), ...(t.dependeDe ? { dependeDe: t.dependeDe } : {}) };
      }),
    });
  contarPlan();

  // Antes de gastar: cuánto va a costar, con lo que costó de verdad en este repo, y alguien lo aprueba.
  if (pedido.aprobar) {
    const registros = await leerDesempeno(pedido.repo).catch(() => []);
    const estimacion = estimarPlan(
      tareas.map((t) => {
        const modelo = modeloDelEscalon(pedido.agente, t.escalon);
        return { id: t.id, titulo: t.titulo, tipo: t.tipo, presupuesto: t.presupuesto, ...(modelo ? { modelo } : {}) };
      }),
      registros,
      plan.costoDelPlan,
    );
    const respuesta = await pedido.aprobar({ resumen: plan.resumen, tareas, estimacion });
    if (typeof respuesta === "string") return terminar(respuesta);
    if (respuesta !== true) {
      // La persona lo corrigió antes del «dale»: arranca con el suyo, y el tablero lo muestra así.
      if (respuesta.tareas.length === 0) return terminar("el plan quedó sin tareas");
      tareas = respuesta.tareas;
      contarPlan(true);
    }
  }

  const usados = new Map<string, number>();
  const nombres = tareas.map((t, i) => {
    const base = nombreDeCompanero(i, t.titulo);
    const veces = (usados.get(base) ?? 0) + 1;
    usados.set(base, veces);
    return veces === 1 ? base : `${base}${veces}`;
  });
  nombresEquipo = nombres;
  nombrePorTarea = new Map(tareas.map((t, i) => [t.id, nombres[i]!]));
  await registrarCompaneros(pedido.repo, equipo, nombresEquipo);
  const terminarYContar = async (porQue: string, rama?: string, ruta?: string): Promise<ResultadoDeEquipo> => {
    await Promise.all(estadosPendientes);
    await Promise.all(nombresEquipo.map((nombre) => actualizarEstadoCompanero(pedido.repo, equipo, nombre, "terminado").catch(() => {})));
    for (const tarea of tareas) alPasar({ tipo: "estado-companero", id: tarea.id, estado: "terminado" });
    const resultado = terminar(porQue, rama, ruta);
    return resultado;
  };

  // spawn/claim/work: cada tarea entra a la cola; la cola reparte entre los compañeros.
  alPasar({ tipo: "etapa", etapa: "spawn" });
  const posicion = new Map(tareas.map((t, i) => [t.id, i] as const));
  const nuevas: NuevaTarea[] = tareas.map((t) => {
    const modelo = modeloDelEscalon(pedido.agente, t.escalon);
    const despuesDe = t.dependeDe !== undefined ? posicion.get(t.dependeDe) : undefined;
    const companero = nombrePorTarea.get(t.id)!;
    return {
      tarea: pedidoDelCompanero(t, { equipo, companero }),
      titulo: t.titulo,
      plan: plan.id,
      presupuesto: t.presupuesto,
      ...(modelo ? { modelo } : {}),
      ...(despuesDe !== undefined ? { despuesDe } : {}),
    };
  });
  const encoladas = await encolar(pedido.repo, nuevas);
  // La cola habla con sus ids; el tablero, con los del plan.
  const idDelPlan = new Map(encoladas.map((c, i) => [c.id, tareas[i]?.id ?? c.id] as const));
  const entregador = entregadorDeGit(pedido.repo);
  base = await entregador.head();
  alPasar({ tipo: "etapa", etapa: "work" });
  // Dónde se cortó cada compañero que no salió: con eso aprende el equipo al terminar (ver aprender.ts).
  const cortes: CorteDeCompanero[] = [];
  const aprender = (integracion?: { fase: string; detalle?: string }) =>
    aprenderDelEquipo(pedido.repo, { objetivo: pedido.objetivo, total: tareas.length, cortes, ...(integracion ? { integracion } : {}) }).catch(() => []);
  // Mientras trabajan: quién está escribiendo y dónde, para avisar si dos se pisan antes de integrar.
  const trabajando = new Map<string, string>();
  const vigilancia = vigilarChoques({
    base,
    worktrees: () => trabajando,
    encadenadas: (a, b) => esperaA(tareas, a, b) || esperaA(tareas, b, a),
    alChocar: (choque) => alPasar({ tipo: "choque", ids: choque.ids, archivos: choque.archivos }),
    ...(pedido.vigilarCadaMs !== undefined ? { cadaMs: pedido.vigilarCadaMs } : {}),
  });
  const cola = await correrCola(pedido.repo, {
    concurrencia: pedido.concurrencia ?? 3,
    ids: encoladas.map((t) => t.id),
    entregar: entregador,
    async sembrar(tarea, desdeCommit, extra) {
      const cual = encoladas.find((c) => c.tarea === tarea && idDelPlan.has(c.id));
      const id = cual ? idDelPlan.get(cual.id)! : "?";
      const pedidoDeTarea: PedidoDeTarea = {
        ...pedidoBase,
        tarea,
        herramientasAdicionales: ["Bash(dolphin buzon:*)"],
        ...(extra?.modelo ? { modelo: extra.modelo } : {}),
      };
      const lista = await prepararSiembra(pedidoDeTarea);
      const { cosecha } = await sembrarTarea(pedidoDeTarea, lista, {
        base: desdeCommit,
        reintentos: 1,
        ...(extra?.presupuesto !== undefined ? { presupuesto: extra.presupuesto } : {}),
        entorno: {
          DOLPHIN_EQUIPO: equipo,
          DOLPHIN_COMPANERO: nombrePorTarea.get(id) ?? id,
          DOLPHIN_REPO: pedido.repo,
        },
        antesDelPorton: async (universo, agente) => {
          const companero = nombrePorTarea.get(id) ?? id;
          cambiarEstado(id, "libre");
          if (!agente.retomar) return undefined;
          const pendientes = await leerMensajes(pedido.repo, equipo, companero, false);
          const deCompaneros = pendientes.filter((mensaje) => mensaje.de !== "líder");
          if (deCompaneros.length === 0 || !(await reservarRetoma(pedido.repo, equipo, companero))) return undefined;
          const entregados = await leerMensajes(pedido.repo, equipo, companero, true);
          const texto = entregados
            .filter((mensaje) => mensaje.de !== "líder")
            .map((mensaje) => `de tu compañero ${mensaje.de}: ${mensaje.texto}`)
            .join("\n");
          if (!texto) return undefined;
          cambiarEstado(id, "trabajando");
          return agente.retomar(universo, `Hay mensajes nuevos en el buzón del equipo.\n${texto}\nAtendelos si afectan tu trabajo y seguí con la tarea.`);
        },
        alPasar(evento) {
          // Dónde trabaja cada compañero: con eso se cruza su terminal en vivo (ver nucleo/voces.ts).
          if (evento.tipo === "nace") {
            alPasar({ tipo: "worktree", id, ruta: evento.universo.ruta });
            trabajando.set(id, evento.universo.ruta);
          }
          const reducido = reducirEvento(evento);
          if (reducido) alPasar({ tipo: "companero", id, evento: reducido });
        },
      });
      gastado += cosecha.gastado;
      if (!cosecha.ganador) {
        const candidato = cosecha.candidatos[0];
        const porQue = candidato?.porQue ?? cosecha.porQueGano ?? "no pasó el portón";
        cortes.push({ id, titulo: tareas.find((x) => x.id === id)?.titulo ?? id, ...(candidato?.murioEn ? { fase: candidato.murioEn } : {}), porQue });
        return { porQue: cosecha.porQueGano ?? "no pasó el portón" };
      }
      return { rama: cosecha.ganador.universo.rama, worktree: cosecha.ganador.universo.ruta };
    },
    alCambiar(t) {
      const id = idDelPlan.get(t.id) ?? t.id;
      cambiarEstado(id, t.estado === "trabajando" ? "trabajando" : t.estado === "esperando" ? "esperando" : "libre");
      // El que terminó ya no cambia: se mira una última vez (su choque cuenta) y sale de la vigilancia.
      if (t.estado !== "trabajando" && trabajando.has(id)) void vigilancia.mirar().catch(() => {}).finally(() => trabajando.delete(id));
      alPasar({ tipo: "tarea", id, estado: t.estado, ...(t.rama ? { rama: t.rama } : {}), ...(t.porQue ? { porQue: t.porQue } : {}) });
    },
  }).finally(() => vigilancia.parar());
  const nuestras = cola.tareas.filter((t) => idDelPlan.has(t.id));
  // Las que pasaron su portón, también las que la cola dejó «en conflicto»: su trabajo vale y la
  // integración intenta resolverlo en vez de tirarlo. En el orden del plan.
  const listas = nuestras
    .filter((t) => (t.estado === "lista" || t.estado === "en-conflicto") && t.rama)
    .sort((a, b) => (posicion.get(idDelPlan.get(a.id) ?? "") ?? 0) - (posicion.get(idDelPlan.get(b.id) ?? "") ?? 0));
  if (listas.length === 0) {
    // El porqué de cada una: es lo que lee quien persigue el objetivo para no repetir el mismo camino.
    const motivos = nuestras.map((t) => `${idDelPlan.get(t.id) ?? t.id}: ${t.porQue ?? t.estado}`).join("; ");
    await aprender();
    return terminarYContar(`ninguna tarea del equipo pasó su portón (${motivos})`);
  }

  // merge: una rama de integración, sobre el punto de partida, con todas las listas.
  alPasar({ tipo: "etapa", etapa: "merge" });
  const taller = await tallerDeLaSiembra(pedidoBase, preparada, base);
  const ramaDeEquipo = `dolphin-equipo/${Date.now().toString(36)}${randomUUID().slice(0, 4)}`;
  const integracion: Universo = await taller.abrir("equipo", ramaDeEquipo);
  // De a una: si choca, el agente resuelve solo esos archivos (ver integrar.ts); el portón final juzga todo.
  const resolver = pedido.resolver === undefined ? resolutorConAgente(preparada.agente) : pedido.resolver;
  let entraron = 0;
  for (const t of listas) {
    const id = idDelPlan.get(t.id) ?? t.id;
    const r = await integrarUna(integracion.ruta, { id, rama: t.rama!, titulo: t.titulo ?? t.tarea }, resolver);
    gastado += r.gastado;
    if (r.ok) entraron++;
    // El commit del merge: con él se deshace solo esta tarea más tarde (ver deshacerDelEquipo).
    alPasar({ tipo: "merge", id, ok: r.ok, ...(r.commit ? { commit: r.commit } : {}), ...(r.porQue ? { porQue: r.porQue } : {}), ...(r.resuelto ? { resuelto: r.resuelto } : {}) });
  }
  if (entraron === 0) {
    await aprender();
    await taller.cerrar(integracion).catch(() => {});
    return terminarYContar("ninguna rama del equipo entró a la integración");
  }

  // review + ship: el portón entero sobre lo integrado, con la revisión al final.
  alPasar({ tipo: "etapa", etapa: "review" });
  const fases = [...preparada.verificadores, ...(pedido.revisor ? [pedido.revisor] : [])];
  for (const v of fases) {
    alPasar({ tipo: "fase-final", verificador: v.nombre, estado: "corre" });
    const inicio = Date.now();
    const veredicto = await v.correr(integracion).catch((error: unknown) => ({
      paso: false,
      detalle: error instanceof Error ? error.message : String(error),
      gastado: 0,
    }));
    gastado += veredicto.gastado ?? 0;
    const estado = "salteada" in veredicto && veredicto.salteada ? "salteada" : veredicto.paso ? "paso" : "fallo";
    alPasar({ tipo: "fase-final", verificador: v.nombre, estado, ms: Date.now() - inicio, ...(veredicto.detalle ? { detalle: veredicto.detalle } : {}) });
    if (!veredicto.paso) {
      // Que la revisión no lo acepte es la opinión de un modelo, no un hecho medido: de eso no se aprende solo.
      await aprender(v === pedido.revisor ? undefined : { fase: v.nombre, ...(veredicto.detalle ? { detalle: veredicto.detalle } : {}) });
      await taller.soltar(integracion).catch(() => {});
      return terminarYContar(`la integración no pasó ${v.nombre}${veredicto.detalle ? `: ${veredicto.detalle}` : ""}`, undefined, integracion.ruta);
    }
  }
  alPasar({ tipo: "etapa", etapa: "ship" });
  await aprender();
  await taller.soltar(integracion).catch(() => {});
  const commit = await gitValor(["rev-parse", "HEAD"], integracion.ruta).catch(() => "");
  return terminarYContar(
    `entraron ${entraron} de ${tareas.length} tareas y la integración pasó el portón${commit ? ` (${commit.slice(0, 7)})` : ""}`,
    integracion.rama,
    integracion.ruta,
  );
}

/** Lo que tocó un compañero en la integración: los archivos de su merge, con lo que sumó y sacó. */
export interface CambiosDeCompanero {
  readonly id: string;
  readonly archivos: readonly { ruta: string; agregadas: number; quitadas: number }[];
  readonly agregadas: number;
  readonly quitadas: number;
}

/** Los cambios de cada compañero, del diff de su merge contra lo que había antes: revisar por partes. */
export async function cambiosPorCompanero(ruta: string, merges: readonly { id: string; commit: string }[]): Promise<CambiosDeCompanero[]> {
  return Promise.all(
    merges.map(async ({ id, commit }) => {
      const crudo = await git(["diff", "--numstat", `${commit}^1`, commit], ruta).catch(() => "");
      const archivos = crudo
        .split("\n")
        .filter(Boolean)
        .map((linea) => {
          const [mas, menos, ...resto] = linea.split("\t");
          return { ruta: resto.join("\t"), agregadas: Number(mas) || 0, quitadas: Number(menos) || 0 };
        });
      return { id, archivos, agregadas: archivos.reduce((s, a) => s + a.agregadas, 0), quitadas: archivos.reduce((s, a) => s + a.quitadas, 0) };
    }),
  );
}

export interface PedidoDeDeshacer {
  readonly repo: string;
  /** El worktree de la rama de integración. */
  readonly ruta: string;
  /** El id de la tarea (para los eventos) y el commit de su merge. */
  readonly id: string;
  readonly commit: string;
  readonly agente: Motor;
  readonly verificar: readonly string[];
  readonly automatico?: boolean;
  /** Para que la memoria sepa qué se deshizo: el título de la tarea y el objetivo del equipo. */
  readonly titulo?: string;
  readonly objetivo?: string;
}

/**
 * Deshace el trabajo de UN compañero en la rama de integración sin perder el de los otros: revierte
 * el commit de su merge (un revert también se revierte, nada se borra) y vuelve a correr el portón
 * entero sobre lo que queda. Si el portón no pasa sin esa tarea, lo dice y la rama queda como quedó.
 */
export async function deshacerDelEquipo(pedido: PedidoDeDeshacer, alPasar: (evento: EventoEquipo) => void): Promise<{ ok: boolean; porQue: string }> {
  const listo = (ok: boolean, porQue: string) => {
    alPasar({ tipo: "deshecha", id: pedido.id, ok, porQue });
    return { ok, porQue };
  };
  try {
    await git(["revert", "-m", "1", "--no-edit", pedido.commit], pedido.ruta);
  } catch (error) {
    await git(["revert", "--abort"], pedido.ruta).catch(() => "");
    return listo(false, `no se pudo deshacer: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
  }
  const fallo = await portonSobre(pedido, `deshacer ${pedido.id}`, alPasar);
  if (fallo) {
    // Sin esa tarea no pasa: se vuelve atrás el revert (el worktree es del equipo, no tuyo) y la rama queda como estaba.
    await git(["reset", "--hard", "HEAD~1"], pedido.ruta).catch(() => "");
    return listo(false, `sin esa tarea no pasa ${fallo}; lo dejé como estaba`);
  }
  // Lo que la persona deshizo es una corrección suya: queda en la memoria de corto plazo (ver aprender.ts).
  await aprenderDeLoDeshechoEnElEquipo(pedido.repo, { ruta: pedido.ruta, commit: pedido.commit, titulo: pedido.titulo ?? pedido.id, ...(pedido.objetivo ? { objetivo: pedido.objetivo } : {}) }).catch(() => {});
  return listo(true, "se deshizo y lo que queda pasa el portón");
}

/** El portón entero sobre la integración, contado fase por fase. Devuelve la que no pasó (con su porqué), o nada. */
async function portonSobre(pedido: Pick<PedidoDeDeshacer, "repo" | "ruta" | "agente" | "verificar" | "automatico">, tarea: string, alPasar: (evento: EventoEquipo) => void): Promise<string | undefined> {
  const preparada = await prepararSiembra({ repo: pedido.repo, tarea, agente: pedido.agente, verificar: pedido.verificar, automatico: pedido.automatico ?? false });
  const universo: Universo = { id: "equipo", rama: await gitValor(["rev-parse", "--abbrev-ref", "HEAD"], pedido.ruta).catch(() => ""), ruta: pedido.ruta, nacido: Date.now() };
  for (const v of preparada.verificadores) {
    alPasar({ tipo: "fase-final", verificador: v.nombre, estado: "corre" });
    const inicio = Date.now();
    const veredicto = await v.correr(universo).catch((error: unknown) => ({ paso: false, detalle: error instanceof Error ? error.message : String(error) }));
    const estado = "salteada" in veredicto && veredicto.salteada ? "salteada" : veredicto.paso ? "paso" : "fallo";
    alPasar({ tipo: "fase-final", verificador: v.nombre, estado, ms: Date.now() - inicio, ...(veredicto.detalle ? { detalle: veredicto.detalle } : {}) });
    if (!veredicto.paso) return `${v.nombre}${veredicto.detalle ? `: ${veredicto.detalle.split("\n")[0]}` : ""}`;
  }
  return undefined;
}

/**
 * Lleva a UN compañero a un turno anterior (ver nucleo/turnos.ts) dentro de la integración, sin tocar
 * lo de los demás: su rama suma un commit «vuelve al turno n» y ese commit se integra encima. Como la
 * integración ya tenía la punta de su rama, ese merge aplica justo lo que hay que deshacer de los
 * turnos de después. El portón vuelve a correr sobre todo; si no pasa, la integración queda como estaba.
 */
export async function volverAlTurnoEnElEquipo(
  pedido: Pick<PedidoDeDeshacer, "repo" | "ruta" | "id" | "agente" | "verificar" | "automatico"> & { readonly rama: string; readonly n: number },
  alPasar: (evento: EventoEquipo) => void,
): Promise<{ ok: boolean; porQue: string }> {
  const antes = await gitValor(["rev-parse", "HEAD"], pedido.ruta);
  const vuelta = await volverAlTurno(pedido.repo, pedido.rama, pedido.n);
  if (!vuelta.ok) return { ok: false, porQue: vuelta.porQue };
  const r = await integrarUna(pedido.ruta, { id: pedido.id, rama: pedido.rama, titulo: `${pedido.id} vuelve al turno ${pedido.n}` }, null);
  if (!r.ok) return { ok: false, porQue: `no se pudo integrar la vuelta: ${r.porQue ?? "chocó"}` };
  alPasar({ tipo: "merge", id: pedido.id, ok: true, ...(r.commit ? { commit: r.commit } : {}) });
  const fallo = await portonSobre(pedido, `${pedido.id} vuelve al turno ${pedido.n}`, alPasar);
  if (fallo) {
    await git(["reset", "--hard", antes], pedido.ruta).catch(() => "");
    return { ok: false, porQue: `en el turno ${pedido.n} no pasa ${fallo}; la integración quedó como estaba` };
  }
  return { ok: true, porQue: `${vuelta.porQue}, y lo integrado pasa el portón` };
}

/** Para `--pendientes` y la consola: qué dejó la última corrida del equipo en la cola. */
export async function tareasDelPlan(repo: string, plan: string): Promise<TareaDeCola[]> {
  return (await leerCola(repo)).tareas.filter((t) => t.plan === plan);
}
