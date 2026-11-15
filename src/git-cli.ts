// Primero: saca ELECTRON_RUN_AS_NODE del entorno antes de que nadie lance nada (ver electron.ts).
import "./nucleo/electron.js";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { commitsDelRepo, issuesDelRepo, prsPorRama, ramaBase, ramasDelRepo, type Persona } from "./nucleo/vista-git.js";
import { gitDice } from "./nucleo/git.js";
import { C, colorDePersona, haceCuanto, pintar, tabla, titulo } from "./salida.js";

/**
 * dolphin git [ramas|commits|issues] [--repo X] [--rama R] [-n 30] [--todas]
 *
 * Lo mismo que la sección Git de la terminal y de la consola, impreso: las ramas con cuánto les falta
 * integrar y su PR, los últimos commits con su autor y las ramas que apuntan a cada uno, y los issues
 * de GitHub (con gh). Sin nada, un resumen de las tres.
 */

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    repo: { type: "string", default: process.cwd() },
    rama: { type: "string" },
    n: { type: "string", short: "n", default: "15" },
    todas: { type: "boolean", default: false },
  },
});

const repo = resolve(values.repo ?? process.cwd());
const cuantos = Math.max(1, Number.parseInt(values.n ?? "15", 10) || 15);
const que = positionals[0] ?? "todo";
if (!["todo", "ramas", "commits", "issues"].includes(que)) {
  console.error(`\n  No conozco «${que}»: dolphin git [ramas|commits|issues]\n`);
  process.exit(1);
}
if (!(await gitDice(["rev-parse", "--is-inside-work-tree"], repo))) {
  console.error(`\n  ${repo} no es un repo de git.\n`);
  process.exit(1);
}

const iniciales = (p: Persona) =>
  pintar(
    p.nombre
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((x) => [...x][0]!.toUpperCase())
      .join("") || "?",
    colorDePersona(p.login ?? p.nombre),
    { negrita: true },
  );

if (que === "todo" || que === "ramas") {
  const [ramas, base] = await Promise.all([prsPorRama(repo).then((prs) => ramasDelRepo(repo, 60, prs)), ramaBase(repo)]);
  const visibles = values.todas ? ramas : ramas.filter((r) => r.actual || !r.mergeada).slice(0, que === "todo" ? 8 : cuantos);
  console.log(titulo("Ramas", `${ramas.length} · base ${base ?? "?"}${values.todas ? "" : ` · ${ramas.length - visibles.length} mergeadas o de más, con --todas`}`));
  console.log(
    tabla(visibles, [
      { titulo: "", valor: (r) => (r.actual ? pintar("●", C.texto, { negrita: true }) : r.mergeada ? pintar("✓", C.verde) : r.adelante ? pintar("◆", C.amarillo) : " ") },
      { titulo: "rama", valor: (r) => (r.actual ? pintar(r.nombre, C.texto, { negrita: true }) : r.nombre) + (r.deDolphin ? pintar("  dolphin", C.tenue) : "") },
      { titulo: "último commit", valor: (r) => pintar(r.mensaje, C.suave), elastica: true },
      { titulo: "↑ ↓", valor: (r) => (r.adelante || r.atras ? `${r.adelante ? pintar(`↑${r.adelante}`, C.texto) : pintar("↑0", C.tenue)} ${pintar(`↓${r.atras}`, C.tenue)}` : pintar("—", C.tenue)), derecha: true },
      { titulo: "quiénes", valor: (r) => r.autores.slice(0, 3).map(iniciales).join(" ") },
      { titulo: "PR", valor: (r) => (r.pr ? pintar(`#${r.pr.numero} ${r.pr.estado === "open" ? "abierto" : r.pr.estado === "merged" ? "mergeado" : "cerrado"}`, r.pr.estado === "open" ? C.azul : C.suave) : "") },
      { titulo: "hace", valor: (r) => pintar(haceCuanto(r.fecha), C.tenue), derecha: true },
    ]),
  );
}

if (que === "todo" || que === "commits") {
  const commits = await commitsDelRepo(repo, values.rama, que === "todo" ? 8 : cuantos);
  console.log(titulo("Commits", values.rama ?? "de la rama actual"));
  console.log(
    tabla(commits, [
      { titulo: "commit", valor: (c) => pintar(c.hashCorto, C.tenue) },
      { titulo: "mensaje", valor: (c) => c.refs.slice(0, 2).map((r) => pintar(`(${r}) `, C.azul)).join("") + c.mensaje, elastica: true },
      { titulo: "autor", valor: (c) => `${iniciales(c.autor)} ${pintar(c.autor.nombre, C.suave)}` },
      { titulo: "hace", valor: (c) => pintar(haceCuanto(c.fecha), C.tenue), derecha: true },
    ]),
  );
}

if (que === "todo" || que === "issues") {
  const r = await issuesDelRepo(repo);
  if (!r.disponible) {
    console.log(titulo("Issues"));
    console.log(`  ${pintar(r.porQue, C.suave)}`);
  } else {
    const abiertos = r.issues.filter((i) => i.abierto);
    const visibles = (values.todas ? r.issues : abiertos).slice(0, que === "todo" ? 8 : cuantos);
    console.log(titulo("Issues", `${abiertos.length} abiertos de ${r.issues.length}`));
    if (visibles.length === 0) console.log(`  ${pintar(r.issues.length ? "No hay issues abiertos. --todas muestra los cerrados." : "Este repo no tiene issues.", C.suave)}`);
    else
      console.log(
        tabla(visibles, [
          { titulo: "", valor: (i) => (i.abierto ? pintar("○", C.texto) : pintar("✓", C.verde)) },
          { titulo: "#", valor: (i) => pintar(String(i.numero), C.tenue), derecha: true },
          { titulo: "issue", valor: (i) => i.titulo + i.etiquetas.slice(0, 2).map((e) => pintar(`  ${e}`, C.azul)).join(""), elastica: true },
          { titulo: "asignados", valor: (i) => i.asignados.slice(0, 3).map(iniciales).join(" ") },
          { titulo: "hace", valor: (i) => pintar(haceCuanto(i.fecha), C.tenue), derecha: true },
        ]),
      );
  }
}
console.log("");
