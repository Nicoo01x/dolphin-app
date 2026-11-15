import type { IncomingMessage, ServerResponse } from "node:http";
import { planificadorConClaude } from "./agentes/planificador.js";
import { objetivoDeTarjeta } from "./equipo/con-tarjeta.js";
import { leerConfig } from "./nucleo/config.js";
import { leerDesempeno } from "./nucleo/desempeno.js";
import { estimarPlan } from "./nucleo/estimar.js";
import { costoMaximo, guardarPlan, limpiarTareas, planificar, type Plan, type Planificador } from "./nucleo/plan.js";
import { modeloDelEscalon, modeloDelPlanificador, motorDe, type Motor } from "./nucleo/router.js";
import { laFrenan } from "./nucleo/tarjetas-espera.js";
import { buscarTarjeta, leerTablero, moverTarjeta, type Tarjeta } from "./nucleo/tarjetas.js";
import { destrabarTarjetas } from "./nucleo/tarjetas-trabadas.js";
import { cuerpoDeLaConsola, json } from "./servidor-comun.js";

/**
 * El «dale» desde la consola (ver docs/idea.md): soltar una tarjeta en Haciendo pide el plan, y
 * aprobarlo arranca el equipo con esa tarjeta.
 *   POST /api/tablero/<id>/plan   {agente}: el líder la parte y dice cuánto cuesta. No escribe código.
 *   POST /api/tablero/<id>/dale   {plan, agente}: el plan como quedó en la consola; arranca el equipo.
 *
 * El equipo corre en su proceso (`dolphin equipo --tarjeta <id> --plan <plan>`), con el plan que se
 * aprobó y sin volver a pensarlo: la tarjeta la mueve el mismo seguimiento que en la terminal.
 */

/** Quién corre el equipo de una tarjeta. Se inyecta en los tests; por defecto, un proceso aparte. */
export type CorredorDeTarjeta = (repo: string, pedido: { readonly tarjeta: string; readonly plan: string; readonly agente: Motor }) => void;

export interface OpcionesDelEquipoDeTarjeta {
  readonly planificador?: Planificador;
  /** En la demo piensa un líder de mentira y trabaja el agente de mentira: probar la pantalla no gasta. */
  readonly demo?: boolean;
  readonly correr: CorredorDeTarjeta;
}

/** El líder de la demo: la lógica, la pantalla y sus tests, sin gastar nada. */
const liderDeDemo = (titulo: string): Planificador => async () => ({
  texto: JSON.stringify({
    resumen: `partir «${titulo}» en la lógica, la pantalla y sus tests`,
    tareas: [
      { id: "t1", titulo: "la lógica", tarea: `${titulo}: la lógica de fondo`, escalon: "medio" },
      { id: "t2", titulo: "la pantalla", tarea: `${titulo}: lo que se ve en la interfaz`, escalon: "barato" },
      { id: "t3", titulo: "los tests", tarea: `${titulo}: tests de la lógica`, escalon: "barato", dependeDe: "t1" },
    ],
  }),
  gastado: 0,
});

/** Por qué no se le puede dar «dale» a esta tarjeta ahora; nada si se puede. */
function porQueNo(t: Tarjeta, tablero: readonly Tarjeta[]): string | undefined {
  if (t.columna === "hecho") return "ya está en Hecho";
  if (t.columna === "haciendo" && t.quien === "agentes") return "ya la está haciendo el equipo";
  if (t.columna === "para-revisar") return "ya está en Para revisar: revisala o devolvela con un comentario";
  const frenan = laFrenan(t, tablero);
  if (frenan.length > 0) return `espera a ${frenan.map((x) => `«${x.titulo}»`).join(" y ")}: primero eso`;
  return undefined;
}

export async function rutaDelEquipoDeTarjeta(
  ruta: string,
  pedido: IncomingMessage,
  respuesta: ServerResponse,
  repo: string,
  token: string,
  opciones: OpcionesDelEquipoDeTarjeta,
): Promise<boolean> {
  const [, idCrudo = "", accion = ""] = /^\/api\/tablero\/([^/]+)\/(plan|dale)$/.exec(ruta) ?? [];
  if (!accion || pedido.method !== "POST") return false;
  const datos = await cuerpoDeLaConsola(pedido, respuesta, token, 80_000);
  if (!datos) return true;
  let tarjeta: Tarjeta;
  try {
    tarjeta = await buscarTarjeta(repo, decodeURIComponent(idCrudo));
  } catch (error) {
    json(respuesta, 404, { ok: false, porQue: error instanceof Error ? error.message : String(error) });
    return true;
  }
  // Antes de decir «ya la está haciendo el equipo», se revisa que sea verdad: una tarjeta cuyo
  // proceso murió vuelve sola a Para hacer (ver nucleo/tarjetas-trabadas.ts). Sin esto, el «dale»
  // la rechazaba para siempre.
  if (tarjeta.columna === "haciendo") {
    const destrabadas = await destrabarTarjetas(repo).catch(() => [] as Tarjeta[]);
    const destrabada = destrabadas.find((t) => t.id === tarjeta.id);
    if (destrabada) tarjeta = destrabada;
  }
  const no = porQueNo(tarjeta, await leerTablero(repo));
  if (no) {
    json(respuesta, 409, { ok: false, porQue: no });
    return true;
  }
  const agente: Motor = opciones.demo ? "mentira" : motorDe(datos.agente);
  const config = await leerConfig(repo);

  if (accion === "plan") {
    const pensar = opciones.planificador ?? (opciones.demo ? liderDeDemo(tarjeta.titulo) : planificadorConClaude(modeloDelPlanificador(config.modelos)));
    let plan: Plan | { porQue: string };
    try {
      plan = await planificar(objetivoDeTarjeta(tarjeta), repo, pensar);
    } catch (error) {
      json(respuesta, 502, { ok: false, porQue: `el líder no contestó: ${error instanceof Error ? error.message : String(error)}` });
      return true;
    }
    if ("porQue" in plan) {
      json(respuesta, 422, { ok: false, porQue: plan.porQue });
      return true;
    }
    await guardarPlan(repo, plan);
    // Lo que costó de verdad en este repo, como lo muestra la terminal antes del «dale».
    const registros = await leerDesempeno(repo).catch(() => []);
    const estimacion = estimarPlan(
      plan.tareas.map((t) => {
        const modelo = modeloDelEscalon(agente, t.escalon);
        return { id: t.id, titulo: t.titulo, tipo: t.tipo, presupuesto: t.presupuesto, ...(modelo ? { modelo } : {}) };
      }),
      registros,
      plan.costoDelPlan,
    );
    json(respuesta, 200, { ok: true, plan, costoMaximo: costoMaximo(plan), estimacion, ...(config.suscripcion ? { suscripcion: true } : {}) });
    return true;
  }

  // dale: el plan editado se valida entero de nuevo; lo que llega del navegador no es de fiar.
  const crudo = datos.plan as Partial<Plan> | undefined;
  if (!crudo || typeof crudo.id !== "string" || !/^[\w-]+$/.test(crudo.id) || !Array.isArray(crudo.tareas)) {
    json(respuesta, 400, { ok: false, porQue: "falta el plan" });
    return true;
  }
  const tareas = limpiarTareas(crudo.tareas);
  if (tareas.length === 0) {
    json(respuesta, 400, { ok: false, porQue: "el plan quedó sin tareas" });
    return true;
  }
  const tope = config.terminal?.tope;
  if (tope !== undefined && tope > 0 && costoMaximo({ tareas }) > tope) {
    json(respuesta, 409, { ok: false, porQue: `en el peor caso se pasa del tope de este proyecto (US$ ${tope.toFixed(2)}): sacá tareas o bajá los topes` });
    return true;
  }
  await guardarPlan(repo, {
    id: crudo.id,
    objetivo: objetivoDeTarjeta(tarjeta),
    creado: typeof crudo.creado === "string" ? crudo.creado : new Date().toISOString(),
    resumen: typeof crudo.resumen === "string" ? crudo.resumen : "",
    tareas,
    costoDelPlan: typeof crudo.costoDelPlan === "number" ? crudo.costoDelPlan : 0,
    aprobado: new Date().toISOString(),
  });
  // Se ve en Haciendo al instante; el equipo, al arrancar, deja el comentario (y la saca si no sale).
  const movida = await moverTarjeta(repo, tarjeta.id, "haciendo");
  opciones.correr(repo, { tarjeta: tarjeta.id, plan: crudo.id, agente });
  json(respuesta, 202, { ok: true, tarjeta: movida });
  return true;
}
