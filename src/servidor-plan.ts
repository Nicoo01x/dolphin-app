import type { IncomingMessage, ServerResponse } from "node:http";
import { planificadorConClaude } from "./agentes/planificador.js";
import { encolar, type NuevaTarea } from "./nucleo/cola.js";
import { leerConfig } from "./nucleo/config.js";
import { costoMaximo, guardarPlan, limpiarTareas, LIMITES, planificar, type Plan, type Planificador } from "./nucleo/plan.js";
import { modeloDelEscalon, modeloDelPlanificador, motorDe, type Motor } from "./nucleo/router.js";
import { cuerpoDeLaConsola, json } from "./servidor-comun.js";

/**
 * Los pedidos de Thinking desde la consola: pensar un plan y aprobarlo.
 *
 * Pensar no gasta en escribir código: el planificador lee el repo y propone.
 * Aprobar es lo que gasta, y por eso recibe el plan TAL COMO QUEDÓ en la
 * consola (con lo que la persona haya editado) y lo vuelve a validar entero
 * antes de encolar: lo que llega del navegador no es de fiar.
 */

/** Quién corre un plan aprobado: la cola, con lo que quedó esperando. */
/** Con los ids: la cola corre ESAS tareas y no cualquiera que esté esperando. */
export type CorredorDePlan = (repo: string, pedido: { readonly agente: Motor; readonly ids: readonly string[] }) => void;

/** POST /api/plan {objetivo}: el planificador lee el repo y propone; el plan queda guardado. */
export async function planPedido(
  repo: string,
  pedido: IncomingMessage,
  respuesta: ServerResponse,
  token: string,
  planificador?: Planificador,
) {
  const datos = await cuerpoDeLaConsola(pedido, respuesta, token, LIMITES.objetivo * 4);
  if (!datos) return;
  const objetivo = typeof datos.objetivo === "string" ? datos.objetivo.trim() : "";
  if (objetivo === "") return json(respuesta, 400, { ok: false, porQue: "falta el objetivo" });

  const config = await leerConfig(repo);
  const pensar = planificador ?? planificadorConClaude(modeloDelPlanificador(config.modelos));
  let plan: Plan | { porQue: string };
  try {
    plan = await planificar(objetivo, repo, pensar);
  } catch (error) {
    return json(respuesta, 502, { ok: false, porQue: `el planificador no contestó: ${error instanceof Error ? error.message : String(error)}` });
  }
  if ("porQue" in plan) return json(respuesta, 422, { ok: false, porQue: plan.porQue });
  await guardarPlan(repo, plan);
  // Con suscripción la consola no muestra montos: no se los paga por uso.
  return json(respuesta, 200, {
    ok: true,
    plan,
    costoMaximo: costoMaximo(plan),
    ...(config.suscripcion ? { suscripcion: true } : {}),
  });
}

/**
 * POST /api/plan/aprobar {plan, agente}: el plan editado se valida de nuevo,
 * cada tarea se encola con su modelo (el del escalón), su tope y de cuál
 * depende, y la cola arranca.
 */
export async function aprobarPlanPedido(
  repo: string,
  pedido: IncomingMessage,
  respuesta: ServerResponse,
  token: string,
  correr: CorredorDePlan,
) {
  const datos = await cuerpoDeLaConsola(pedido, respuesta, token, 80_000);
  if (!datos) return;
  const plan = datos.plan as Partial<Plan> | undefined;
  if (!plan || typeof plan.id !== "string" || !/^[\w-]+$/.test(plan.id) || !Array.isArray(plan.tareas)) {
    return json(respuesta, 400, { ok: false, porQue: "falta el plan" });
  }
  const tareas = limpiarTareas(plan.tareas);
  if (tareas.length === 0) return json(respuesta, 400, { ok: false, porQue: "el plan quedó sin tareas" });

  const agente = motorDe(datos.agente);
  const posicion = new Map(tareas.map((t, i) => [t.id, i] as const));
  const nuevas: NuevaTarea[] = tareas.map((t) => {
    const modelo = modeloDelEscalon(agente, t.escalon);
    const despuesDe = t.dependeDe !== undefined ? posicion.get(t.dependeDe) : undefined;
    return {
      tarea: t.tarea,
      titulo: t.titulo,
      plan: plan.id!,
      presupuesto: t.presupuesto,
      ...(modelo ? { modelo } : {}),
      ...(despuesDe !== undefined ? { despuesDe } : {}),
    };
  });
  const encoladas = await encolar(repo, nuevas);
  // Queda guardado como se aprobó, con lo que se haya editado.
  await guardarPlan(repo, {
    id: plan.id,
    objetivo: typeof plan.objetivo === "string" ? plan.objetivo : "",
    creado: typeof plan.creado === "string" ? plan.creado : new Date().toISOString(),
    resumen: typeof plan.resumen === "string" ? plan.resumen : "",
    tareas,
    costoDelPlan: typeof plan.costoDelPlan === "number" ? plan.costoDelPlan : 0,
    aprobado: new Date().toISOString(),
  });
  correr(repo, { agente, ids: encoladas.map((t) => t.id) });
  return json(respuesta, 202, { ok: true, tareas: encoladas.map((t) => t.id), costoMaximo: costoMaximo({ tareas }) });
}
