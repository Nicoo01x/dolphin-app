import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";
import { leerBandeja, sumarAsuntos } from "./nucleo/bandeja.js";
import { leerPerfil } from "./nucleo/perfil.js";
import { leerConfig } from "./nucleo/config.js";
import { correrScout, type Proyecto } from "./ideas/scout.js";

/**
 * npm run ideas -- --repo <ruta> [--modelo sonnet] [--tope 5]
 *
 * Manda al scout a mirar qué hacen otros y deja las ideas en la bandeja.
 * Lo que ya está en la bandeja —abierto, hecho o rechazado— se le pasa
 * para que no lo reproponga; y si igual lo trae, la firma lo frena.
 * Pensado para correr solo, en el VPS, con el calendario.
 */

const { values } = parseArgs({
  options: {
    repo: { type: "string", default: process.cwd() },
    modelo: { type: "string", default: "sonnet" },
    tope: { type: "string", default: "5" },
  },
});

const repo = values.repo ?? process.cwd();

// Lo que no dice cómo está hecho el proyecto, o no se le muestra a nadie (un `.env`).
const NO_SE_MUESTRA = new Set(["node_modules", "dist", "out", "build", "coverage"]);

/** Las carpetas y archivos de arriba y las dependencias: lo que el scout leía del repo, contado acá. */
async function leerEstructura(ruta: string, dependencias: readonly string[]): Promise<string | undefined> {
  const entradas = await readdir(ruta, { withFileTypes: true }).catch(() => []);
  const arriba = entradas
    .filter((e) => !e.name.startsWith(".") && !NO_SE_MUESTRA.has(e.name))
    .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
    .sort()
    .slice(0, 40);
  const lineas = [
    arriba.length > 0 ? `- Arriba: ${arriba.join(", ")}` : "",
    dependencias.length > 0 ? `- Dependencias: ${dependencias.slice(0, 40).join(", ")}` : "",
  ].filter((l) => l !== "");
  return lineas.length > 0 ? lineas.join("\n") : undefined;
}

async function leerProyecto(ruta: string): Promise<Proyecto> {
  let nombre = basename(ruta);
  let descripcion: string | undefined;
  let dependencias: string[] = [];
  try {
    const pkg = JSON.parse(await readFile(join(ruta, "package.json"), "utf8")) as {
      name?: string;
      description?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    if (pkg.name) nombre = pkg.name;
    if (pkg.description) descripcion = pkg.description;
    dependencias = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
  } catch {
    /* no todo proyecto es de Node */
  }
  const estructura = await leerEstructura(ruta, dependencias);
  let readme: string | undefined;
  for (const archivo of ["README.md", "readme.md", "README"]) {
    try {
      readme = (await readFile(join(ruta, archivo), "utf8")).split("\n").slice(0, 80).join("\n");
      break;
    } catch {
      /* el próximo */
    }
  }
  const perfil = await leerPerfil(ruta);
  return {
    nombre,
    ...(descripcion ? { descripcion } : {}),
    ...(readme ? { readme } : {}),
    ...(perfil ? { perfil } : {}),
    ...(estructura ? { estructura } : {}),
  };
}

const proyecto = await leerProyecto(repo);
const yaVistas = (await leerBandeja(repo)).asuntos.filter((a) => a.tipo === "idea").map((a) => a.titulo);
const tope = Math.max(1, Number.parseInt(values.tope ?? "5", 10) || 5);

console.log(`\n  dolphin ideas · el scout sale a mirar qué hacen otros para «${proyecto.nombre}»`);
console.log(`  (como mucho ${tope}; ${yaVistas.length} que ya vio no las repropone — tarda unos minutos)\n`);

try {
  const inicio = Date.now();
  const { ideas, gastado, crudo } = await correrScout(proyecto, yaVistas, {
    ...(values.modelo ? { modelo: values.modelo } : {}),
    tope,
  });
  const resultado = await sumarAsuntos(repo, ideas);
  const minutos = ((Date.now() - inicio) / 60_000).toFixed(1);

  if (resultado.sumados.length === 0) {
    console.log(`  El scout volvió en ${minutos} min sin nada nuevo que valga.`);
    // Sin ideas, lo que dijo el modelo es la única pista: «no pude abrir la web» no es «no hay nada».
    const explicacion = ideas.length === 0 ? crudo.split("<<<IDEAS")[0]?.trim() : "";
    if (explicacion) console.log(`  Lo que contestó: ${explicacion.slice(0, 400)}${explicacion.length > 400 ? "…" : ""}`);
  } else {
    console.log(`  ${resultado.sumados.length} idea(s) nueva(s) en la bandeja, en ${minutos} min:`);
    for (const idea of resultado.sumados) {
      console.log(`    · ${idea.titulo}`);
      for (const f of idea.fuentes ?? []) console.log(`        ${f.url}`);
    }
  }
  if (resultado.rechazados > 0) console.log(`  ${resultado.rechazados} que ya habías rechazado: no vuelven.`);
  // Con suscripción no se muestra plata: nadie pagó por uso.
  if (gastado > 0 && !(await leerConfig(repo)).suscripcion) console.log(`  (el modelo informó US$ ${gastado.toFixed(2)})`);
  console.log("");
} catch (error) {
  console.error(`\n  El scout no pudo terminar: ${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
}
