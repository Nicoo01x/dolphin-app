import { leerDesempeno, type Registro, type TipoDeTarea } from "./desempeno.js";
import { nuevoId } from "./ids.js";
import {
  flaquezas,
  juzgar,
  leerHipotesis,
  partirHistorial,
  promptDeHipotesis,
  proponer,
  type CorrerEnsayo,
  type Flaqueza,
  type Hipotesis,
  type ReglasDeAdopcion,
  type Veredicto,
} from "./mejorarse.js";

/**
 * El ciclo entero de `mejorarse`, de una vuelta: dónde falla → una hipótesis → el ensayo → la
 * propuesta que espera tu ok.
 *
 * Las piezas ya existían en `mejorarse.ts` y cada una tenía su test, pero **no había quién las
 * llamara en orden**: el módulo era una caja de herramientas sin ciclo. Esto es el ciclo, y como
 * todo lo caro entra inyectado (`pensar` es un modelo, `correr` es un agente escribiendo de
 * verdad), la vuelta entera se puede probar sin gastar un peso.
 *
 * Lo que NO hace, a propósito: no adopta nada. Termina en una propuesta en `.dolphin/mejoras.json`
 * esperando que una persona diga que sí. Un sistema que se cambia solo la forma de trabajar y
 * además se aprueba solo no tiene a nadie mirando.
 */

export interface DepsDeLaVuelta {
  /** El modelo que lee las fallas y propone un ángulo. No ve el repo: solo el prompt. */
  readonly pensar: (prompt: string, senal?: AbortSignal) => Promise<string>;
  /**
   * Correr una tarea histórica con un ángulo. **Cuesta plata**: es un agente escribiendo. Sin esto
   * la vuelta llega hasta la hipótesis y se detiene ahí, que es lo que conviene por defecto.
   */
  readonly correr?: CorrerEnsayo;
  readonly reglas?: ReglasDeAdopcion;
  /** Cuántas tareas del lado reservado se corren como mucho, por lado. El ensayo se paga. */
  readonly topeDeTareas?: number;
  /** Cuántas tareas de OTROS tipos se corren de control. */
  readonly topeDeControl?: number;
  readonly ahora?: () => Date;
  readonly senal?: AbortSignal;
}

export type ResultadoDeLaVuelta =
  | { readonly que: "nada"; readonly porQue: string }
  | { readonly que: "sin-hipotesis"; readonly flaqueza: Flaqueza; readonly porQue: string }
  | { readonly que: "sin-ensayo"; readonly flaqueza: Flaqueza; readonly hipotesis: Hipotesis; readonly porQue: string }
  | { readonly que: "propuesta"; readonly flaqueza: Flaqueza; readonly hipotesis: Hipotesis; readonly veredicto: Veredicto };

/** Por defecto se corren hasta ocho tareas por lado: alcanzan para el mínimo de `juzgar` y no se dispara el gasto. */
const TOPE = 8;
const TOPE_CONTROL = 6;

/** Las tareas distintas de una lista de registros, en orden y sin repetir. */
function tareasDe(registros: readonly Registro[], tope: number): string[] {
  const vistas: string[] = [];
  for (const r of registros) {
    if (!vistas.includes(r.tarea)) vistas.push(r.tarea);
    if (vistas.length >= tope) break;
  }
  return vistas;
}

async function correrTodas(tareas: readonly string[], enfoque: Parameters<CorrerEnsayo>[1], correr: CorrerEnsayo, senal?: AbortSignal) {
  const resultados: { paso: boolean; costo: number }[] = [];
  for (const tarea of tareas) {
    // Una por vez y no en paralelo: cada una es un agente escribiendo, y de a ocho a la vez se
    // pelean por la máquina y por el cupo del proveedor.
    resultados.push(await correr(tarea, enfoque, senal));
  }
  return resultados;
}

/**
 * Una vuelta de mejora sobre el historial del repo.
 *
 * Sin `correr` llega hasta la hipótesis y se detiene: eso es gratis y sirve para mirar qué se le
 * ocurrió antes de pagar el ensayo.
 */
export async function unaVueltaDeMejora(repo: string, deps: DepsDeLaVuelta): Promise<ResultadoDeLaVuelta> {
  const ahora = deps.ahora ?? (() => new Date());
  const registros = await leerDesempeno(repo);
  const [flaqueza] = flaquezas(registros);
  if (!flaqueza) {
    return { que: "nada", porQue: "no hay ningún tipo de tarea con suficientes ramas y mal resultado" };
  }

  const delTipo = registros.filter((r) => r.tipo === flaqueza.tipo);
  const { disenio, prueba } = partirHistorial(delTipo);
  if (disenio.length === 0 || prueba.length === 0) {
    return { que: "sin-hipotesis", flaqueza, porQue: "el historial no se parte en dos mitades: no hay con qué pensar y con qué juzgar" };
  }

  const dicho = await deps.pensar(promptDeHipotesis(flaqueza, disenio), deps.senal);
  const cuando = ahora().toISOString();
  const leida = leerHipotesis(dicho, flaqueza, cuando, nuevoId("m", ahora().getTime()));
  // Se distingue por `enfoque` y no por `porQue`: una hipótesis buena TAMBIÉN trae un porqué (es la
  // causa que propuso el modelo), así que preguntar por él daba siempre el mismo lado.
  if (!("enfoque" in leida)) {
    return { que: "sin-hipotesis", flaqueza, porQue: leida.porQue };
  }

  if (!deps.correr) {
    return { que: "sin-ensayo", flaqueza, hipotesis: leida, porQue: "la hipótesis está; el ensayo cuesta plata y se pide aparte" };
  }

  const tope = deps.topeDeTareas ?? TOPE;
  const tareas = tareasDe(prueba, tope);
  const base = await correrTodas(tareas, undefined, deps.correr, deps.senal);
  const nueva = await correrTodas(tareas, leida.enfoque, deps.correr, deps.senal);

  // El control: las mismas dos corridas sobre OTROS tipos de tarea, para que mejorar acá no sea
  // romper allá. Si no hay de otros tipos, se juzga sin control y `juzgar` lo tiene en cuenta.
  const otros = tareasDe(
    registros.filter((r) => r.tipo !== flaqueza.tipo),
    deps.topeDeControl ?? TOPE_CONTROL,
  );
  const control =
    otros.length > 0
      ? { base: await correrTodas(otros, undefined, deps.correr, deps.senal), nueva: await correrTodas(otros, leida.enfoque, deps.correr, deps.senal) }
      : undefined;

  const veredicto = juzgar({ base, nueva, ...(control ? { control } : {}) }, deps.reglas);
  // Se guarda gane o pierda: saber que un ángulo NO sirvió también es saber, y evita volver a
  // pagarlo dentro de tres semanas.
  await proponer(repo, leida, veredicto);
  return { que: "propuesta", flaqueza, hipotesis: leida, veredicto };
}

/** Cómo se cuenta una vuelta, en una línea, para el CLI y para el parte. */
export function comoSeCuenta(r: ResultadoDeLaVuelta): string {
  if (r.que === "nada") return r.porQue;
  if (r.que === "sin-hipotesis") return `${r.flaqueza.tipo}: ${r.porQue}`;
  if (r.que === "sin-ensayo") return `${r.flaqueza.tipo}: «${r.hipotesis.enfoque.nombre}» — ${r.porQue}`;
  return `${r.flaqueza.tipo}: «${r.hipotesis.enfoque.nombre}» ${r.veredicto.adoptar ? "sirve" : "no sirve"} — ${r.veredicto.porQue}`;
}

/** Los tipos de tarea donde hoy falla, para mostrarlos sin correr nada. */
export async function dondeFalla(repo: string): Promise<{ readonly flaquezas: Flaqueza[]; readonly tipos: readonly TipoDeTarea[] }> {
  const registros = await leerDesempeno(repo);
  const encontradas = flaquezas(registros);
  return { flaquezas: encontradas, tipos: encontradas.map((f) => f.tipo) };
}
