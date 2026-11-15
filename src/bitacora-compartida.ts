import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { leerMemoria, recordar, type Recuerdo } from "./nucleo/memoria.js";

/**
 * La bitácora compartida: lo que el agente de una persona aprendió, para que lo sepan los de todos.
 *
 *   exportar → las lecciones del proyecto (reglas y errores confirmados, con su patrón si lo tienen),
 *              SIN nada del proyecto: ni rutas, ni URLs, ni correos, ni claves, ni el nombre del repo,
 *              ni el título de tus tareas. Van etiquetadas con los frameworks que usa el repo (next@16,
 *              prisma@6…), que es lo que las hace útiles para otro.
 *   importar → cada lección entra como CANDIDATA de afuera: no se usa hasta que le des el visto bueno.
 *              Las de frameworks que tu repo no usa se saltean, y un patrón que podría colgar el
 *              portón (una regex con cuantificadores anidados) no entra.
 */

export const FORMATO = "dolphin-bitacora/1";

export interface Leccion {
  readonly dicho: string;
  readonly patron?: string;
  readonly tipo: "regla" | "error";
}

export interface PaqueteDeBitacora {
  readonly formato: typeof FORMATO;
  readonly creado: string;
  /** Los frameworks del repo de donde salió, con su versión mayor: «next@16». */
  readonly marcos: readonly string[];
  readonly lecciones: readonly Leccion[];
}

/** Los que se reconocen en package.json, por el nombre del paquete. */
const MARCOS: Readonly<Record<string, string>> = {
  next: "next",
  react: "react",
  vue: "vue",
  svelte: "svelte",
  "@angular/core": "angular",
  astro: "astro",
  "@remix-run/react": "remix",
  express: "express",
  fastify: "fastify",
  "@nestjs/core": "nestjs",
  hono: "hono",
  prisma: "prisma",
  "@prisma/client": "prisma",
  "drizzle-orm": "drizzle",
  vite: "vite",
  tailwindcss: "tailwind",
  electron: "electron",
  typescript: "typescript",
  vitest: "vitest",
  jest: "jest",
  "@playwright/test": "playwright",
};

/** Los frameworks del repo con su versión mayor, leídos de package.json. */
export async function marcosDelRepo(repo: string): Promise<string[]> {
  try {
    const paquete = JSON.parse(await readFile(join(repo, "package.json"), "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const deps = { ...paquete.devDependencies, ...paquete.dependencies };
    const marcos = new Map<string, string>();
    for (const [paqueteNombre, version] of Object.entries(deps)) {
      const marco = MARCOS[paqueteNombre];
      if (!marco || marcos.has(marco)) continue;
      const mayor = /(\d+)/.exec(version)?.[1];
      marcos.set(marco, mayor ? `${marco}@${mayor}` : marco);
    }
    return [...marcos.values()].sort();
  } catch {
    return [];
  }
}

const nombreDe = (marco: string) => marco.split("@")[0]!;

/** Los nombres propios del proyecto: la carpeta y el nombre del paquete. */
async function nombresDelProyecto(repo: string): Promise<string[]> {
  const nombres = [basename(repo)];
  try {
    const nombre = (JSON.parse(await readFile(join(repo, "package.json"), "utf8")) as { name?: string }).name;
    if (nombre) nombres.push(nombre, nombre.replace(/^@[^/]+\//, ""));
  } catch {
    // Sin package.json, alcanza con la carpeta.
  }
  return [...new Set(nombres.filter((n) => n.length >= 3))];
}

const escapar = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** El texto sin los títulos de tareas («…»), rutas, URLs, correos, claves ni los nombres propios del repo. */
function sinNadaDelProyecto(texto: string, nombres: readonly string[]): string {
  let t = texto
    .replace(/«[^»]*»/g, "«una tarea»")
    .replace(/\bhttps?:\/\/\S+/gi, "<url>")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "<correo>")
    .replace(/\b(?:sk|pk|rk|ghp|gho|github_pat|xox[abp]|tk_live|tk_test|AKIA)[-_A-Za-z0-9]{8,}\b/g, "<secreto>")
    .replace(/\b[A-Za-z0-9+/_-]{32,}={0,2}/g, "<secreto>")
    .replace(/[A-Za-z]:[\\/][^\s"'«»;,!?)]{1,}/g, "<ruta>")
    .replace(/\b(?:\.{0,2}[\\/])?(?:[\w-][\w.-]*[\\/])+[\w-][\w.-]*(?:\.[\w-]+)?/g, "<ruta>")
    .replace(/(?:^|\s)\/(?:home|Users|var|srv|opt|mnt|tmp)\/[^\s"'«»]+/g, " <ruta>");
  for (const n of nombres) t = t.replace(new RegExp(`\\b${escapar(n)}\\b`, "gi"), "el proyecto");
  return t.replace(/\s+/g, " ").trim();
}

/** Una lección sin nada del proyecto; si después de limpiar no queda algo que se entienda, null. */
export function anonimizar(texto: string, nombres: readonly string[]): string | null {
  const t = sinNadaDelProyecto(texto, nombres);
  return t.replace(/[«»<>]|una tarea|el proyecto|ruta|url|correo|secreto/g, "").trim().length >= 15 ? t : null;
}

/** Una regex que puede colgar el portón: cuantificadores anidados como (a+)+ o (\w*)*. */
export function patronPeligroso(patron: string): boolean {
  return patron.length > 200 || /\([^)]*[+*][^)]*\)\s*[+*{]/.test(patron);
}

export async function exportarBitacora(repo: string, ahora = new Date()): Promise<PaqueteDeBitacora> {
  const nombres = await nombresDelProyecto(repo);
  const lecciones: Leccion[] = [];
  for (const r of (await leerMemoria(repo)).recuerdos) {
    // Solo lo que es palabra del proyecto: activo, aprobado, de acá y que es regla o error (las
    // decisiones y notas son de ESTE proyecto, no le sirven a otro).
    if (!r.activo || r.candidato || r.origen === "untrusted") continue;
    const tipo = (r.tipo ?? "regla") as Recuerdo["tipo"];
    if (tipo !== "regla" && tipo !== "error") continue;
    const dicho = anonimizar(r.dicho, nombres);
    if (!dicho) continue;
    // El patrón se comparte solo si no dice nada del proyecto.
    const patron = r.patron && sinNadaDelProyecto(r.patron, nombres) === r.patron.replace(/\s+/g, " ").trim() && !patronPeligroso(r.patron) ? r.patron : undefined;
    lecciones.push({ dicho, tipo, ...(patron ? { patron } : {}) });
  }
  return { formato: FORMATO, creado: ahora.toISOString(), marcos: await marcosDelRepo(repo), lecciones };
}

export interface ResultadoDeImportar {
  readonly sumadas: number;
  readonly yaEstaban: number;
  /** Las que no entraron, con por qué. */
  readonly descartadas: readonly string[];
}

/** Las lecciones de otro, como candidatas de afuera: esperan tu visto bueno antes de usarse. */
export async function importarBitacora(repo: string, paquete: unknown): Promise<ResultadoDeImportar> {
  const p = paquete as Partial<PaqueteDeBitacora> | null;
  if (!p || p.formato !== FORMATO || !Array.isArray(p.lecciones)) throw new Error(`no es una bitácora de Dolphin (falta "formato": "${FORMATO}")`);
  const marcosDeAca = new Set((await marcosDelRepo(repo)).map(nombreDe));
  const marcosDeAlla = (Array.isArray(p.marcos) ? p.marcos : []).filter((m): m is string => typeof m === "string");
  // Si viene de un stack que no tiene nada que ver con el tuyo, no le sirve a tu proyecto.
  if (marcosDeAlla.length > 0 && marcosDeAca.size > 0 && !marcosDeAlla.some((m) => marcosDeAca.has(nombreDe(m)))) {
    return { sumadas: 0, yaEstaban: 0, descartadas: [`es de ${marcosDeAlla.join(", ")} y este repo no usa ninguno`] };
  }
  const antes = new Set((await leerMemoria(repo)).recuerdos.map((r) => r.id));
  let sumadas = 0;
  let yaEstaban = 0;
  const descartadas: string[] = [];
  for (const l of p.lecciones as readonly Partial<Leccion>[]) {
    const dicho = typeof l.dicho === "string" ? l.dicho.trim() : "";
    if (dicho.length < 10 || dicho.length > 400) {
      descartadas.push(`«${dicho.slice(0, 40)}»: vacía o demasiado larga`);
      continue;
    }
    const patron = typeof l.patron === "string" && l.patron.trim() !== "" ? l.patron : undefined;
    if (patron && patronPeligroso(patron)) {
      descartadas.push(`«${dicho.slice(0, 40)}»: su patrón podría colgar el portón`);
      continue;
    }
    try {
      const r = await recordar(repo, dicho, patron, l.tipo === "error" ? "error" : "regla", {
        origen: "untrusted",
        candidato: true,
        porQue: `de la bitácora compartida${marcosDeAlla.length ? ` (${marcosDeAlla.join(", ")})` : ""}`,
      });
      if (antes.has(r.id)) yaEstaban += 1;
      else sumadas += 1;
    } catch (error) {
      descartadas.push(`«${dicho.slice(0, 40)}»: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { sumadas, yaEstaban, descartadas };
}
