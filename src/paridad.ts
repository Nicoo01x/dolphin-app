import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { carpetaDeDolphin, escribirDeUna } from "./nucleo/escritura.js";
import { puertoLibre } from "./nucleo/puertos.js";
import { levantarApp } from "./tester/levantar.js";

/**
 * Migrar con paridad: «pasá esto de Express a Fastify» y que se pueda PROBAR que se comporta igual.
 *
 *   grabar     → se le pregunta a la app vieja por cada ruta y se guarda lo que contesta: el estado y
 *                el cuerpo normalizado (el JSON con las claves en orden, o el texto que se ve de una
 *                página, sin scripts ni estilos). Lo que cambia solo (fechas, ids) se ignora por nombre.
 *   comprobar  → se levanta la app nueva, se le pregunta lo mismo y se compara. Sale en 0 solo si todo
 *                coincide: así sirve de oráculo para /objetivo (ver nucleo/oraculo.ts), y el equipo no
 *                para hasta que la app nueva contesta igual que la vieja.
 *
 * Mira rutas HTTP: APIs y páginas que arma el servidor. Una app que se dibuja toda en el navegador
 * necesita mirarse con navegador, y eso no lo hace esto todavía.
 */

export interface Respuesta {
  readonly estado: number;
  readonly tipo: "json" | "texto";
  readonly cuerpo: string;
}

export interface Grabacion {
  readonly creada: string;
  readonly url: string;
  /** Claves de JSON que cambian solas y no cuentan (fecha, id…). */
  readonly ignorar: readonly string[];
  readonly rutas: Readonly<Record<string, Respuesta>>;
}

export interface Diferencia {
  readonly ruta: string;
  readonly que: string;
}

/** Un JSON comparable: claves en orden, y las que cambian solas, fuera (en cualquier nivel). */
export function jsonNormalizado(valor: unknown, ignorar: ReadonlySet<string>): unknown {
  if (Array.isArray(valor)) return valor.map((v) => jsonNormalizado(v, ignorar));
  if (valor && typeof valor === "object") {
    return Object.fromEntries(
      Object.keys(valor as Record<string, unknown>)
        .filter((k) => !ignorar.has(k))
        .sort()
        .map((k) => [k, jsonNormalizado((valor as Record<string, unknown>)[k], ignorar)]),
    );
  }
  return valor;
}

/** El texto que se ve de una página: sin scripts, estilos ni etiquetas, con los espacios juntos. */
export function textoVisible(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export async function preguntar(base: string, ruta: string, ignorar: readonly string[]): Promise<Respuesta> {
  const r = await fetch(new URL(ruta, base), { redirect: "manual", signal: AbortSignal.timeout(15_000) });
  const crudo = await r.text();
  const esJson = (r.headers.get("content-type") ?? "").includes("json");
  if (esJson) {
    try {
      return { estado: r.status, tipo: "json", cuerpo: JSON.stringify(jsonNormalizado(JSON.parse(crudo), new Set(ignorar))) };
    } catch {
      // Dice JSON pero no lo es: se compara como texto.
    }
  }
  return { estado: r.status, tipo: "texto", cuerpo: (r.headers.get("content-type") ?? "").includes("html") ? textoVisible(crudo) : crudo.trim() };
}

/** Le pregunta a la app vieja por cada ruta y lo guarda en `.dolphin/paridad/`. Devuelve dónde quedó. */
export async function grabar(repo: string, opciones: { url: string; rutas: readonly string[]; ignorar?: readonly string[]; nombre?: string }): Promise<{ archivo: string; grabacion: Grabacion }> {
  const ignorar = opciones.ignorar ?? [];
  const rutas: Record<string, Respuesta> = {};
  for (const ruta of opciones.rutas) rutas[ruta] = await preguntar(opciones.url, ruta, ignorar);
  const grabacion: Grabacion = { creada: new Date().toISOString(), url: opciones.url, ignorar, rutas };
  const carpeta = await carpetaDeDolphin(repo, "paridad");
  const archivo = join(carpeta, `${(opciones.nombre ?? "app").replace(/[^\w-]/g, "-")}.json`);
  await escribirDeUna(archivo, `${JSON.stringify(grabacion, null, 2)}\n`);
  return { archivo, grabacion };
}

const corto = (t: string) => (t.length > 120 ? `${t.slice(0, 119)}…` : t);

/** En qué difieren dos respuestas de la misma ruta, en una línea; null si son iguales. */
export function diferencia(antes: Respuesta, ahora: Respuesta): string | null {
  if (antes.estado !== ahora.estado) return `contestaba ${antes.estado} y ahora ${ahora.estado}`;
  if (antes.cuerpo === ahora.cuerpo) return null;
  if (antes.tipo === "json" && ahora.tipo === "json") {
    const a = JSON.parse(antes.cuerpo) as unknown;
    const b = JSON.parse(ahora.cuerpo) as unknown;
    return `el JSON cambió: ${primeraDiferencia(a, b, "") ?? "en el orden o en los tipos"}`;
  }
  return `el texto cambió: antes «${corto(antes.cuerpo)}», ahora «${corto(ahora.cuerpo)}»`;
}

function primeraDiferencia(a: unknown, b: unknown, camino: string): string | null {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (a && b && typeof a === "object" && typeof b === "object" && Array.isArray(a) === Array.isArray(b)) {
    if (Array.isArray(a) && Array.isArray(b) && a.length !== b.length) return `${camino || "la lista"} tenía ${a.length} elementos y ahora ${b.length}`;
    const claves = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    for (const k of claves) {
      const dentro = primeraDiferencia((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], camino ? `${camino}.${k}` : k);
      if (dentro) return dentro;
    }
  }
  return `${camino || "el valor"}: antes ${corto(JSON.stringify(a) ?? "nada")}, ahora ${corto(JSON.stringify(b) ?? "nada")}`;
}

/** Compara la app que contesta en `url` con lo grabado. Sin diferencias, la paridad se cumple. */
export async function comparar(grabacion: Grabacion, url: string): Promise<Diferencia[]> {
  const diferencias: Diferencia[] = [];
  for (const [ruta, antes] of Object.entries(grabacion.rutas)) {
    const ahora = await preguntar(url, ruta, grabacion.ignorar).catch((error: unknown) => ({ estado: 0, tipo: "texto" as const, cuerpo: `no contestó: ${error instanceof Error ? error.message : String(error)}` }));
    const que = diferencia(antes, ahora);
    if (que) diferencias.push({ ruta, que });
  }
  return diferencias;
}

/** Levanta la app de esta carpeta con su comando (con `{PUERTO}`) y la compara con lo grabado. */
export async function comprobar(opciones: { grabacion: string; cwd: string; levantar?: string; url: string; esperaMs?: number }): Promise<{ diferencias: Diferencia[]; total: number }> {
  const grabacion = JSON.parse(await readFile(opciones.grabacion, "utf8")) as Grabacion;
  const total = Object.keys(grabacion.rutas).length;
  if (!opciones.levantar) return { diferencias: await comparar(grabacion, opciones.url), total };
  const app = await levantarApp({ comando: opciones.levantar, url: opciones.url, cwd: opciones.cwd, puerto: await puertoLibre(), ...(opciones.esperaMs ? { esperaMs: opciones.esperaMs } : {}) });
  try {
    return { diferencias: await comparar(grabacion, app.url), total };
  } finally {
    await app.detener();
  }
}
