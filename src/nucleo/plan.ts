import { readFile, readdir } from "node:fs/promises";
import { carpetaDeDolphin, escribirDeUna } from "./escritura.js";
import { nuevoId } from "./ids.js";
import { join } from "node:path";
import { tipoDeTarea, type TipoDeTarea } from "./desempeno.js";
import { objetosJson } from "./json.js";
import { contextoDeSpecs } from "./spec.js";

/**
 * Dolphin Thinking: un objetivo grande partido en un plan de tareas.
 *
 * Le contás un objetivo («que la tienda acepte cupones de descuento») y un
 * modelo, leyendo el repo sin tocar nada, lo parte en tareas chicas que se
 * pueden probar solas: cada una con el escalón de modelo que le alcanza, un
 * presupuesto en dólares y, si necesita el trabajo de otra, de cuál depende.
 * El plan se muestra en la consola para aprobarlo o editarlo ANTES de gastar
 * nada, y después lo corre la cola: las independientes a la vez, cada una en
 * su rama; las que dependen, encima de la rama de la que dependen.
 *
 * Acá vive lo que no necesita un modelo: el pedido, la lectura y validación
 * de lo que contesta, y dónde se guarda. Quién contesta se inyecta.
 */

export type Escalon = "barato" | "medio" | "caro";

export interface TareaDelPlan {
  /** Corto y único dentro del plan: «t1», «t2»… */
  readonly id: string;
  readonly titulo: string;
  /** El pedido entero, como se lo daría una persona a un agente. */
  readonly tarea: string;
  readonly tipo: TipoDeTarea;
  readonly escalon: Escalon;
  /** Tope de gasto de la tarea, en dólares. */
  readonly presupuesto: number;
  /** La tarea anterior cuyo trabajo necesita: una sola, porque se siembra encima de su rama. */
  readonly dependeDe?: string;
  /**
   * Los archivos (o carpetas) que va a tocar, según el líder. Con eso se encadenan las que se pisan
   * y, mientras trabajan, se avisa si un compañero se mete en lo de otro (ver equipo/choques.ts).
   */
  readonly archivos?: readonly string[];
  readonly porQue: string;
}

export interface Plan {
  readonly id: string;
  readonly objetivo: string;
  readonly creado: string;
  readonly resumen: string;
  readonly tareas: readonly TareaDelPlan[];
  /** Lo que costó pensarlo (la llamada al modelo que lo armó), en dólares. */
  readonly costoDelPlan: number;
  /** Cuándo se aprobó en la consola (y con eso, se encoló). */
  readonly aprobado?: string;
}

export const LIMITES = {
  tareas: 8,
  presupuestoMinimo: 0.05,
  presupuestoMaximo: 5,
  titulo: 80,
  tarea: 2000,
  objetivo: 4000,
} as const;

/** Quién piensa el plan: recibe el pedido y el repo, devuelve lo que contestó y lo que costó. */
export type Planificador = (prompt: string, repo: string) => Promise<{ texto: string; gastado: number }>;

export function promptDePlan(objetivo: string, contexto = ""): string {
  return [
    "Sos el planificador de Dolphin, un orquestador que les da tareas a agentes de programación. Cada tarea la escribe un agente en su propia rama de git y la prueba un portón (typecheck, tests, build y una revisión) antes de entregarla.",
    "",
    "El objetivo de la persona:",
    `«${objetivo}»`,
    "",
    "Leé del repo lo que haga falta para entenderlo (no cambies nada) y partí el objetivo en tareas.",
    ...(contexto ? ["", contexto, "", "Usá esos SPEC.md para que cada tarea respete el contrato de la carpeta que va a tocar."] : []),
    "",
    "Reglas:",
    "1. Cada tarea es un pedido completo y concreto para un agente: qué cambiar, dónde, y cómo se sabe que quedó bien (qué test o qué comportamiento). Nada de «investigar» o «analizar» sueltos: cada tarea deja código probado.",
    `2. Lo más chico que se pueda probar solo. Entre 1 y ${LIMITES.tareas} tareas; si alcanza con una, una.`,
    "3. Que se pisen lo menos posible: dos tareas que tocan los mismos archivos van encadenadas (la segunda depende de la primera).",
    '4. "dependeDe": el id de UNA tarea ANTERIOR cuyo trabajo hace falta, o null. Nunca una posterior.',
    '4b. "archivos": las rutas (relativas a la raíz del repo, o una carpeta terminada en /) que esa tarea va a crear o cambiar. Con esto Dolphin encadena solo las que se pisan y avisa si un compañero se mete en lo de otro: que sea la lista real, no una adivinanza.',
    '5. "escalon": "barato" para cambios mecánicos y chicos (textos, tests simples, renombres), "medio" para la mayoría, "caro" solo para lo difícil de verdad (lógica delicada, concurrencia, seguridad).',
    `6. "presupuesto": cuántos dólares vale como mucho hacerla, entre ${LIMITES.presupuestoMinimo} y ${LIMITES.presupuestoMaximo}. Una chica y barata, 0.2; una del medio, de 0.5 a 1; una cara, hasta 3.`,
    "7. Todo en castellano rioplatense, con voseo.",
    "",
    "Respondé SOLO con un objeto JSON, sin nada antes ni después:",
    '{"resumen": "una oración con el enfoque", "tareas": [{"id": "t1", "titulo": "corto", "tarea": "el pedido completo", "escalon": "medio", "presupuesto": 0.5, "dependeDe": null, "archivos": ["src/carrito.ts", "tests/carrito.test.ts"], "porQue": "una oración: por qué esta tarea y este escalón"}]}',
  ].join("\n");
}

const ESCALONES: Readonly<Record<string, Escalon>> = {
  barato: "barato",
  cheap: "barato",
  bajo: "barato",
  medio: "medio",
  medium: "medio",
  mid: "medio",
  caro: "caro",
  expensive: "caro",
  alto: "caro",
};

const acotar = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const recortar = (texto: string, largo: number) => (texto.length > largo ? `${texto.slice(0, largo - 1)}…` : texto);

function presupuestoDe(valor: unknown, escalon: Escalon): number {
  const numero = typeof valor === "number" ? valor : typeof valor === "string" ? Number.parseFloat(valor.replace(",", ".")) : Number.NaN;
  // Sin un número que sirva, el del escalón: el plan se puede corregir en la consola antes de aprobar.
  const porEscalon = { barato: 0.2, medio: 0.6, caro: 2 }[escalon];
  return Math.round(acotar(Number.isFinite(numero) && numero > 0 ? numero : porEscalon, LIMITES.presupuestoMinimo, LIMITES.presupuestoMaximo) * 100) / 100;
}

const TOPE_DE_ARCHIVOS = 30;

/** Una ruta como la escribió el modelo, comparable: barras derechas, sin ./ adelante. */
export function normalizarRuta(ruta: string): string {
  return ruta.trim().replace(/\\/g, "/").replace(/^(\.\/)+/, "").replace(/\/{2,}/g, "/");
}

function archivosDe(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  const rutas = valor
    .filter((r): r is string => typeof r === "string")
    .map(normalizarRuta)
    .filter((r) => r !== "" && r.length <= 200 && !r.startsWith("/") && !r.split("/").includes(".."));
  return [...new Set(rutas)].slice(0, TOPE_DE_ARCHIVOS);
}

/** Si dos rutas se pisan: la misma, o una es la carpeta (terminada en /) que contiene a la otra. */
export function rutasSePisan(a: string, b: string): boolean {
  if (a === b) return true;
  const dentro = (archivo: string, carpeta: string) => carpeta.endsWith("/") && archivo.startsWith(carpeta);
  return dentro(a, b) || dentro(b, a);
}

/** Los archivos que dos listas tienen en común (los de la primera). */
export function archivosEnComun(a: readonly string[], b: readonly string[]): string[] {
  return a.filter((x) => b.some((y) => rutasSePisan(x, y)));
}

/** Si `a` espera a `b` (directo o por la cadena de dependencias). */
export function esperaA(tareas: readonly Pick<TareaDelPlan, "id" | "dependeDe">[], a: string, b: string): boolean {
  const vistas = new Set<string>();
  for (let actual = tareas.find((t) => t.id === a)?.dependeDe; actual && !vistas.has(actual); actual = tareas.find((t) => t.id === actual)?.dependeDe) {
    if (actual === b) return true;
    vistas.add(actual);
  }
  return false;
}

/**
 * La regla 3 del pedido, cumplida sin confiar en el modelo: una tarea que toca archivos de otra
 * ANTERIOR, y que no la espera, pasa a esperarla. Una tarea espera a una sola, así que si ya espera
 * a otra se queda como está: de esos choques avisa la vigilancia mientras trabajan.
 */
export function encadenarLasQueSePisan(tareas: readonly TareaDelPlan[]): TareaDelPlan[] {
  const salida: TareaDelPlan[] = [];
  for (const t of tareas) {
    if (t.dependeDe === undefined && t.archivos?.length) {
      const pisada = [...salida].reverse().find((anterior) => anterior.archivos?.length && archivosEnComun(t.archivos!, anterior.archivos).length > 0);
      if (pisada) {
        salida.push({ ...t, dependeDe: pisada.id });
        continue;
      }
    }
    salida.push(t);
  }
  return salida;
}

/**
 * Las tareas de un plan, limpias: sin vacías, con ids únicos, a lo sumo
 * ocho, presupuestos dentro del rango y cada dependencia apuntando a una
 * tarea ANTERIOR que sigue en el plan (si no, se saca: una dependencia rota
 * dejaría una tarea esperando para siempre). Las que se pisan quedan encadenadas.
 */
export function limpiarTareas(crudas: readonly unknown[]): TareaDelPlan[] {
  const tareas: TareaDelPlan[] = [];
  const ids = new Set<string>();
  for (const cruda of crudas) {
    if (tareas.length >= LIMITES.tareas) break;
    if (!cruda || typeof cruda !== "object") continue;
    const datos = cruda as Record<string, unknown>;
    const tarea = typeof datos.tarea === "string" ? datos.tarea.trim() : "";
    if (tarea === "") continue;
    let id = typeof datos.id === "string" && /^[\w-]{1,20}$/.test(datos.id.trim()) ? datos.id.trim() : `t${tareas.length + 1}`;
    for (let n = 2; ids.has(id); n++) id = `t${tareas.length + 1}-${n}`;
    const escalon = ESCALONES[String(datos.escalon ?? "").trim().toLowerCase()] ?? "medio";
    const titulo = typeof datos.titulo === "string" && datos.titulo.trim() !== "" ? datos.titulo.trim() : tarea.split(/[.\n]/)[0]!.trim();
    const dependeDe = typeof datos.dependeDe === "string" && ids.has(datos.dependeDe.trim()) ? datos.dependeDe.trim() : undefined;
    const archivos = archivosDe(datos.archivos);
    tareas.push({
      id,
      titulo: recortar(titulo, LIMITES.titulo),
      tarea: recortar(tarea, LIMITES.tarea),
      tipo: tipoDeTarea(tarea),
      escalon,
      presupuesto: presupuestoDe(datos.presupuesto, escalon),
      ...(dependeDe ? { dependeDe } : {}),
      ...(archivos.length > 0 ? { archivos } : {}),
      porQue: typeof datos.porQue === "string" ? recortar(datos.porQue.trim(), 240) : "",
    });
    ids.add(id);
  }
  return encadenarLasQueSePisan(tareas);
}

/** El plan que contestó el modelo, o por qué no se pudo leer. */
export function leerPlan(texto: string, objetivo: string, costoDelPlan = 0, ahora = new Date()): Plan | { porQue: string } {
  const objeto = objetosJson(texto).find((o): o is { tareas: unknown[]; resumen?: unknown } =>
    Boolean(o && typeof o === "object" && Array.isArray((o as { tareas?: unknown }).tareas)),
  );
  if (!objeto) return { porQue: "el planificador no contestó un plan en el formato pedido" };
  const tareas = limpiarTareas(objeto.tareas);
  if (tareas.length === 0) return { porQue: "el plan vino sin ninguna tarea que se pueda hacer" };
  return {
    id: nuevoId("p", ahora.getTime()),
    objetivo: recortar(objetivo.trim(), LIMITES.objetivo),
    creado: ahora.toISOString(),
    resumen: typeof objeto.resumen === "string" ? recortar(objeto.resumen.trim(), 400) : "",
    tareas,
    costoDelPlan,
  };
}

/** Pensar el plan: el pedido al planificador y la lectura de lo que contesta. */
export async function planificar(objetivo: string, repo: string, pensar: Planificador): Promise<Plan | { porQue: string }> {
  const limpio = objetivo.trim();
  if (limpio === "") return { porQue: "falta el objetivo" };
  const { texto, gastado } = await pensar(promptDePlan(recortar(limpio, LIMITES.objetivo), await contextoDeSpecs(repo)), repo);
  return leerPlan(texto, limpio, gastado);
}

/** Lo que cuesta el plan como mucho: la suma de los presupuestos. */
export function costoMaximo(plan: Pick<Plan, "tareas">): number {
  return Math.round(plan.tareas.reduce((suma, t) => suma + t.presupuesto, 0) * 100) / 100;
}

const carpetaDePlanes = (repo: string) => join(repo, ".dolphin", "planes");

export async function guardarPlan(repo: string, plan: Plan): Promise<void> {
  await carpetaDeDolphin(repo, "planes");
  await escribirDeUna(join(carpetaDePlanes(repo), `${plan.id}.json`), `${JSON.stringify(plan, null, 2)}\n`);
}

export async function leerPlanGuardado(repo: string, id: string): Promise<Plan | null> {
  if (!/^[\w-]+$/.test(id)) return null;
  try {
    return JSON.parse(await readFile(join(carpetaDePlanes(repo), `${id}.json`), "utf8")) as Plan;
  } catch {
    return null;
  }
}

/** Los últimos planes, del más nuevo al más viejo. */
export async function listarPlanes(repo: string, cuantos = 10): Promise<Plan[]> {
  const nombres = await readdir(carpetaDePlanes(repo)).catch(() => [] as string[]);
  const planes = await Promise.all(
    nombres.filter((n) => n.endsWith(".json")).map((n) => leerPlanGuardado(repo, n.slice(0, -5))),
  );
  return planes.filter((p): p is Plan => p !== null).sort((a, b) => b.creado.localeCompare(a.creado)).slice(0, cuantos);
}
