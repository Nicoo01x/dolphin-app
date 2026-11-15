import { leerCosecha, listarCosechas } from "./archivo.js";
import { leerConfig } from "./config.js";
import { familia, leerDesempeno, NOMBRE_DE_TIPO, rendimientoPorModelo, tipoDeTarea, type Rendimiento, type TipoDeTarea } from "./desempeno.js";
import { MUESTRAS_MINIMAS, repartir } from "./router.js";
import type { Cosecha, Costo } from "./tipos.js";

/**
 * El informe de rendimiento del tablero: cuánto rinde cada modelo en cada
 * tipo de tarea, cuánto pasa y cuánto cuesta cada fase del portón, y qué
 * decidiría el router con esas cifras. Es lo mismo que el router consulta
 * (ver desempeno.ts y router.ts), puesto a la vista: si el router cambia
 * de opinión, acá se ve por qué.
 */

export interface Fase {
  readonly fase: string;
  readonly costo: Costo;
  /** Cuántas veces corrió, contando las vueltas del bucle de corrección. */
  readonly corridas: number;
  readonly pasaron: number;
  readonly gastado: number;
  readonly msMedio: number;
}

export interface InformeDeRendimiento {
  /** Los tipos de tarea con cifras, los más medidos primero. */
  readonly tipos: readonly { readonly tipo: TipoDeTarea; readonly nombre: string; readonly ramas: number }[];
  /** El tipo que se está mirando; null es «todos». */
  readonly tipo: TipoDeTarea | null;
  readonly modelos: readonly Rendimiento[];
  readonly fases: readonly Fase[];
  /** Cuántas ramas por modelo hacen falta para que el router decida con cifras. */
  readonly minimo: number;
  /** Lo que decidiría el router en la próxima siembra de este tipo. Solo con un tipo elegido. */
  readonly router?: {
    readonly estrategia: string;
    readonly escribe?: string;
    readonly porDatos?: string;
    readonly explorar?: string;
    /** Quién escribe está fijado a mano en dolphin.config.json: las cifras no mandan. */
    readonly fijado: boolean;
    /** Los modelos que todavía no llegan al mínimo, con cuántas ramas tienen. */
    readonly faltan: readonly { readonly modelo: string; readonly tiene: number }[];
  };
}

const ORDEN_DE_COSTO: readonly Costo[] = ["gratis", "barato", "caro"];

/**
 * Cada fase del portón con su tasa de paso y su costo. Las fases vienen en
 * el orden en que corren —por costo, y dentro del mismo costo como
 * aparecieron—, que es el orden en que se lee el portón.
 */
export function fasesDe(cosechas: readonly Cosecha[], tipo?: TipoDeTarea | null): Fase[] {
  const fases = new Map<string, { costo: Costo; corridas: number; pasaron: number; gastado: number; ms: number; orden: number }>();
  for (const cosecha of cosechas) {
    if (tipo && tipoDeTarea(cosecha.tarea) !== tipo) continue;
    for (const c of cosecha.candidatos) {
      for (const p of c.pasadas) {
        // Una que no corrió no es una corrida, y menos una que pasó.
        if (p.salteada) continue;
        const f = fases.get(p.verificador) ?? { costo: p.costo, corridas: 0, pasaron: 0, gastado: 0, ms: 0, orden: fases.size };
        f.corridas += 1;
        if (p.paso) f.pasaron += 1;
        f.gastado += p.gastado;
        f.ms += p.ms;
        fases.set(p.verificador, f);
      }
    }
  }
  return [...fases.entries()]
    .sort(([, a], [, b]) => ORDEN_DE_COSTO.indexOf(a.costo) - ORDEN_DE_COSTO.indexOf(b.costo) || a.orden - b.orden)
    .map(([fase, f]) => ({
      fase,
      costo: f.costo,
      corridas: f.corridas,
      pasaron: f.pasaron,
      gastado: Math.round(f.gastado * 10000) / 10000,
      msMedio: Math.round(f.ms / f.corridas),
    }));
}

/** Las cosechas que se miran para las fases: las últimas, como el historial. */
const COSECHAS_QUE_SE_MIRAN = 50;

/**
 * `pedido`: un tipo, «todos», o nada —y entonces el más medido, que es
 * donde el router tiene algo que decir—.
 */
export async function armarInforme(repo: string, pedido?: TipoDeTarea | "todos"): Promise<InformeDeRendimiento> {
  const [registros, config, rutas] = await Promise.all([leerDesempeno(repo), leerConfig(repo), listarCosechas(repo, COSECHAS_QUE_SE_MIRAN)]);
  const cosechas = (await Promise.all(rutas.map((r) => leerCosecha(r).catch(() => null)))).filter((c): c is NonNullable<typeof c> => c !== null);

  const cuantas = new Map<TipoDeTarea, number>();
  for (const r of registros) cuantas.set(r.tipo, (cuantas.get(r.tipo) ?? 0) + 1);
  const tipos = [...cuantas.entries()]
    .map(([tipo, ramas]) => ({ tipo, nombre: NOMBRE_DE_TIPO[tipo], ramas }))
    .sort((a, b) => b.ramas - a.ramas || a.tipo.localeCompare(b.tipo));

  const tipo = pedido === "todos" ? null : (pedido ?? tipos[0]?.tipo ?? null);
  const modelos = rendimientoPorModelo(registros, tipo ?? undefined);
  const informe = { tipos, tipo, modelos, fases: fasesDe(cosechas, tipo), minimo: MUESTRAS_MINIMAS };
  if (!tipo) return informe;

  // El router de verdad, con las mismas cifras que va a ver la próxima siembra.
  const configModelos = config.modelos ?? {};
  const conDatos = repartir("claude", configModelos, {}, { tipo, rendimientos: modelos });
  const deTabla = repartir("claude", configModelos);
  const tiene = (modelo: string) => modelos.find((r) => r.modelo === familia(modelo))?.intentos ?? 0;
  const mirados = [deTabla.escribir, conDatos.explorar].filter((m): m is string => m !== undefined);
  return {
    ...informe,
    router: {
      estrategia: conDatos.estrategia,
      ...(conDatos.escribir ? { escribe: conDatos.escribir } : {}),
      ...(conDatos.porDatos ? { porDatos: conDatos.porDatos } : {}),
      ...(conDatos.explorar ? { explorar: conDatos.explorar } : {}),
      fijado: configModelos.escribir !== undefined,
      faltan: [...new Set(mirados)].map((modelo) => ({ modelo, tiene: tiene(modelo) })).filter((m) => m.tiene < MUESTRAS_MINIMAS),
    },
  };
}

/** Lo que llega por la URL: un tipo que exista, «todos», o nada. */
export function leerTipo(valor: string | null): TipoDeTarea | "todos" | undefined {
  if (valor === "todos") return "todos";
  // hasOwn y no `in`: «toString» está en cualquier objeto.
  return valor && Object.hasOwn(NOMBRE_DE_TIPO, valor) ? (valor as TipoDeTarea) : undefined;
}
