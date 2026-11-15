import { carpetaDeDolphin, enFila, escribirDeUna, leerEstado } from "./escritura.js";
import { join } from "node:path";
import type { Cosecha } from "./tipos.js";

/**
 * El desempeño propio: qué modelo pasa el portón en qué tipo de tarea, a
 * qué costo y en cuánto tiempo, medido en las siembras de ESTE repo.
 *
 * No es un benchmark ajeno: es lo que el router consulta para repartir
 * (ver router.ts). Con esto, «calidad», «equilibrada» y «economía» dejan
 * de ser una tabla fija y pasan a ser tres preguntas sobre los mismos
 * datos: ¿quién pasa más?, ¿quién pasa casi igual por menos?, ¿quién sale
 * más barato por rama aceptada?
 *
 * Una fila por rama escrita, en `.dolphin/desempeno.json`.
 */

export type TipoDeTarea = "tests" | "docs" | "pantalla" | "arreglo" | "refactor" | "funcion";

/** Cómo se dice cada tipo en una oración: «en arreglos, haiku pasó…». */
export const NOMBRE_DE_TIPO: Readonly<Record<TipoDeTarea, string>> = {
  tests: "tests",
  docs: "documentación",
  pantalla: "pantalla",
  arreglo: "arreglos",
  refactor: "refactors",
  funcion: "funciones nuevas",
};

// Una palabra que EMPIEZA así, sin otra letra delante. `\b` no sirve: en
// JavaScript una «á» no es letra para `\b`, y «arreglá» no cortaría nunca.
const raiz = (raices: string) => new RegExp(`(?<!\\p{L})(?:${raices})`, "iu");

/**
 * Un patrón por tipo, en orden: gana el primero que encaja. «Tests» pide
 * ESCRIBIR pruebas —«arreglá la suma, el test falla» es un arreglo—, y
 * pantalla va antes que arreglo porque un botón roto se juzga en pantalla.
 *
 * Los verbos van en voseo con su tilde («sumá», «escribí») o con pronombre
 * («sumale»): sin tilde, «suma» es el sustantivo de «arreglá la suma».
 */
const REGLAS: readonly (readonly [TipoDeTarea, RegExp])[] = [
  [
    "tests",
    /(?<!\p{L})(?:sumá|agregá|escribí|creá|completá|sumale|agregale|escribile|add|write)(?!\p{L})[^.\n]{0,40}?(?<!\p{L})(?:tests?|pruebas?)(?!\p{L})|(?<!\p{L})(?:cobertura|coverage)(?!\p{L})/iu,
  ],
  ["docs", raiz("readme|documentaci[oó]n|document[aá]|changelog|comentari")],
  ["pantalla", raiz("bot[oó]n|botones|pantalla|css|estilo|dise[nñ]o|mobile|m[oó]vil|responsive|layout|modal|men[uú](?!\\p{L})|tipograf|accesib|contraste|color(?:es)?(?!\\p{L})")],
  ["arreglo", raiz("arregl|bug|error|falla|fall[oó](?!\\p{L})|rompe|rot[oa](?!\\p{L})|no anda|no funciona|crash|fix(?!\\p{L})|correg")],
  ["refactor", raiz("refactor|renombr|limpi[aá]|simplific|extra[eé]|reorganiz|dedup")],
];

/** De qué tipo es una tarea, por cómo está dicha. Lo que no encaja es una función nueva. */
export function tipoDeTarea(tarea: string): TipoDeTarea {
  for (const [tipo, patron] of REGLAS) if (patron.test(tarea)) return tipo;
  return "funcion";
}

export interface Registro {
  readonly cuando: string;
  readonly tipo: TipoDeTarea;
  /** La tarea, recortada: para auditar de dónde salió una cifra, no para buscar. */
  readonly tarea: string;
  readonly modelo: string;
  readonly paso: boolean;
  readonly murioEn?: string;
  /**
   * El ángulo con que se encaró (ver enfoques.ts). Sin esto no se puede medir una estrategia: es lo
   * que deja preguntarse «¿funciona mejor «test primero» en los arreglos?» (ver mejorarse.ts).
   */
  readonly enfoque?: string;
  /** Las vueltas del bucle de corrección: 1 es a la primera. */
  readonly vueltas: number;
  /** Escribir, corregir y las fases pagas de esta rama, en dólares. */
  readonly costo: number;
  /** El motor no informó lo que costó escribir: `costo` es un piso y no entra en las cuentas de plata. */
  readonly costoDesconocido?: boolean;
  /** El agente más las fases, en ms. */
  readonly ms: number;
}

const ARCHIVO = "desempeno.json";

/** Lo de hace meses describe a los modelos de hace meses: se guardan las últimas. */
const TOPE = 2000;

export function leerDesempeno(repo: string): Promise<Registro[]> {
  return leerEstado(join(repo, ".dolphin", ARCHIVO), [] as Registro[], (datos) => {
    const registros = (datos as { registros?: unknown } | null)?.registros;
    return Array.isArray(registros) ? (registros as Registro[]) : [];
  });
}

/**
 * Las filas que deja una cosecha. Quedan afuera las que no dicen nada del
 * modelo: lo que salió de la memoria de respuestas (no lo escribió nadie),
 * el agente de prueba, y lo que se cayó antes de escribir —el taller o el
 * agente: un corte de luz no es una opinión sobre Haiku—.
 */
export function registrosDeCosecha(cosecha: Cosecha, cuando: string): Registro[] {
  const tipo = tipoDeTarea(cosecha.tarea);
  return cosecha.candidatos.flatMap((c) => {
    if (!c.modelo || c.modelo === "demo" || c.deCache) return [];
    if (c.murioEn === "el agente" || c.murioEn === "el taller") return [];
    // Pasó con fases que no corrieron: no se sabe si acertó, y el router no puede aprender de eso.
    if (c.vivo && c.pasadas.some((p) => p.salteada)) return [];
    const vueltas = Math.max(1, ...c.pasadas.map((p) => p.intento ?? 1));
    const costo = (c.gastadoAgente ?? 0) + c.pasadas.reduce((n, p) => n + p.gastado, 0);
    const ms = (c.msAgente ?? 0) + c.pasadas.reduce((n, p) => n + p.ms, 0);
    return [
      {
        cuando,
        tipo,
        tarea: cosecha.tarea.slice(0, 120),
        modelo: c.modelo,
        paso: c.vivo,
        ...(c.murioEn ? { murioEn: c.murioEn } : {}),
        ...(c.enfoque ? { enfoque: c.enfoque } : {}),
        vueltas,
        costo: Math.round(costo * 10000) / 10000,
        ...(c.costoDesconocido ? { costoDesconocido: true } : {}),
        ms: Math.round(ms),
      },
    ];
  });
}

/**
 * Suma las filas de una cosecha. Devuelve cuántas sumó. En la fila de
 * escritura.ts: dos siembras que terminan juntas en el mismo proceso (la
 * cola) leerían la misma lista y una pisaría a la otra.
 */
export async function registrarDesempeno(repo: string, cosecha: Cosecha, cuando: string): Promise<number> {
  const nuevos = registrosDeCosecha(cosecha, cuando);
  if (nuevos.length === 0) return 0;
  const ruta = join(repo, ".dolphin", ARCHIVO);
  await enFila(ruta, async () => {
    const registros = [...(await leerDesempeno(repo)), ...nuevos].slice(-TOPE);
    await carpetaDeDolphin(repo);
    // De una sola vez (ver escritura.ts): un corte a mitad de camino no
    // deja un JSON roto que tire todas las cifras.
    await escribirDeUna(ruta, `${JSON.stringify({ version: 1, registros }, null, 2)}\n`);
  });
  return nuevos.length;
}

export interface Rendimiento {
  /** La familia, para Claude («sonnet»); el nombre tal cual, para el resto. */
  readonly modelo: string;
  readonly intentos: number;
  readonly pasaron: number;
  /** Pasaron sin necesitar una corrección. */
  readonly aLaPrimera: number;
  /** Pasaron sobre intentos, de 0 a 1. */
  readonly tasa: number;
  /** `null` si ninguna rama de este modelo informó su costo (Codex, Antigravity). */
  readonly costoMedio: number | null;
  /**
   * Lo que cuesta conseguir una rama que pasa: todo lo gastado sobre las
   * que pasaron. Es la cifra honesta de lo barato: un modelo que cobra la
   * mitad y pasa un tercio de las veces sale más caro. `null` si ninguna pasó
   * o si no se sabe lo que costaron: un cero inventado lo haría el más barato.
   */
  readonly costoPorAcierto: number | null;
  /** Las ramas cuyo motor no informó lo que costaron: quedan afuera de las cuentas de plata. */
  readonly sinCosto?: number;
  readonly msMedio: number;
}

/** «claude-sonnet-5-5» y «sonnet» son el mismo para decidir: se cuentan por familia. */
export function familia(modelo: string): string {
  const m = modelo.toLowerCase();
  for (const f of ["opus", "sonnet", "haiku"]) if (m.includes(f)) return f;
  return m;
}

/** El rendimiento de cada modelo, en un tipo de tarea o en todos. Los más medidos primero. */
export function rendimientoPorModelo(registros: readonly Registro[], tipo?: TipoDeTarea): Rendimiento[] {
  const grupos = new Map<string, Registro[]>();
  for (const r of registros) {
    if (tipo && r.tipo !== tipo) continue;
    const f = familia(r.modelo);
    grupos.set(f, [...(grupos.get(f) ?? []), r]);
  }
  return [...grupos.entries()]
    .map(([modelo, lista]) => {
      const pasaron = lista.filter((r) => r.paso).length;
      // La plata se cuenta solo con las ramas que dijeron cuánto costaron.
      const conCosto = lista.filter((r) => !r.costoDesconocido);
      const costoTotal = conCosto.reduce((n, r) => n + r.costo, 0);
      const pasaronConCosto = conCosto.filter((r) => r.paso).length;
      return {
        modelo,
        intentos: lista.length,
        pasaron,
        aLaPrimera: lista.filter((r) => r.paso && r.vueltas === 1).length,
        tasa: pasaron / lista.length,
        costoMedio: conCosto.length > 0 ? costoTotal / conCosto.length : null,
        costoPorAcierto: pasaronConCosto > 0 ? costoTotal / pasaronConCosto : null,
        ...(conCosto.length < lista.length ? { sinCosto: lista.length - conCosto.length } : {}),
        msMedio: lista.reduce((n, r) => n + r.ms, 0) / lista.length,
      };
    })
    .sort((a, b) => b.intentos - a.intentos || a.modelo.localeCompare(b.modelo));
}
