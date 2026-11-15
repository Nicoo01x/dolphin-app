import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fasesDelPaquete } from "./verificadores.js";

/**
 * Arranque en 30 segundos: la primera vez en un repo, Dolphin mira qué es (node, python, go, rust),
 * con qué se instala y qué hay para probarlo, y propone el dolphin.config.json. Solo lee: lo escribe
 * quien lo aprueba (la terminal, con un «dale»).
 *
 * En node el portón son los scripts de npm que ya existen. En los demás, comandos conocidos del
 * ecosistema (pytest, go test, cargo test) que el portón corre como cualquier fase. Si no hay nada
 * para probar, lo dice: un portón vacío no prueba nada y no se finge lo contrario.
 */

export type Stack = "node" | "python" | "go" | "rust" | "desconocido";

export interface ComandoDelPorton {
  readonly nombre: string;
  readonly cmd: string;
  readonly args: readonly string[];
}

export interface Deteccion {
  readonly stack: Stack;
  /** Con qué se instala: pnpm, npm, yarn, bun, uv, poetry, pip, go, cargo. */
  readonly gestor?: string;
  /** node: los scripts de npm que forman el portón, del más barato al más caro. */
  readonly verificar: readonly string[];
  /** Los demás: los comandos del portón. */
  readonly comandos: readonly ComandoDelPorton[];
  /** Lo que conviene saber, en voz humana. */
  readonly notas: readonly string[];
}

const existe = (ruta: string) => access(ruta).then(() => true, () => false);
const leer = (ruta: string) => readFile(ruta, "utf8").catch(() => "");

async function gestorDeNode(repo: string): Promise<string> {
  if (await existe(join(repo, "pnpm-lock.yaml"))) return "pnpm";
  if (await existe(join(repo, "yarn.lock"))) return "yarn";
  if ((await existe(join(repo, "bun.lockb"))) || (await existe(join(repo, "bun.lock")))) return "bun";
  return "npm";
}

export async function detectarProyecto(repo: string): Promise<Deteccion> {
  if (await existe(join(repo, "package.json"))) {
    const gestor = await gestorDeNode(repo);
    // Lo que construye (build, peso) queda afuera: es caro y casi nunca es lo que rompe un cambio.
    const verificar = await fasesDelPaquete(repo, { sinConstruir: true });
    return {
      stack: "node",
      gestor,
      verificar,
      comandos: [],
      notas: verificar.length === 0 ? ["El package.json no tiene typecheck, lint ni test: sumá un script «test» y lo uso en el portón."] : [],
    };
  }

  const pyproject = await leer(join(repo, "pyproject.toml"));
  if (pyproject || (await existe(join(repo, "requirements.txt"))) || (await existe(join(repo, "setup.py")))) {
    const gestor = (await existe(join(repo, "uv.lock"))) ? "uv" : /\[tool\.poetry\]/.test(pyproject) ? "poetry" : "pip";
    const correr = (modulo: string, ...args: string[]): ComandoDelPorton =>
      gestor === "uv" ? { nombre: modulo, cmd: "uv", args: ["run", modulo, ...args] } : gestor === "poetry" ? { nombre: modulo, cmd: "poetry", args: ["run", modulo, ...args] } : { nombre: modulo, cmd: "python", args: ["-m", modulo, ...args] };
    const comandos: ComandoDelPorton[] = [];
    if (/\bruff\b/.test(pyproject)) comandos.push({ ...correr("ruff", "check", "."), nombre: "lint" });
    if (/\bmypy\b/.test(pyproject)) comandos.push({ ...correr("mypy", "."), nombre: "typecheck" });
    const hayTests = /\bpytest\b/.test(pyproject) || (await existe(join(repo, "tests"))) || (await existe(join(repo, "test")));
    if (hayTests) comandos.push({ ...correr("pytest", "-q"), nombre: "test" });
    return { stack: "python", gestor, verificar: [], comandos, notas: hayTests ? [] : ["No encontré tests (ni pytest ni una carpeta tests/): el portón no va a poder decir si un cambio rompe algo."] };
  }

  if (await existe(join(repo, "go.mod"))) {
    return {
      stack: "go",
      gestor: "go",
      verificar: [],
      comandos: [
        { nombre: "vet", cmd: "go", args: ["vet", "./..."] },
        { nombre: "test", cmd: "go", args: ["test", "./..."] },
      ],
      notas: [],
    };
  }

  if (await existe(join(repo, "Cargo.toml"))) {
    return {
      stack: "rust",
      gestor: "cargo",
      verificar: [],
      comandos: [
        { nombre: "check", cmd: "cargo", args: ["check", "--quiet"] },
        { nombre: "test", cmd: "cargo", args: ["test", "--quiet"] },
      ],
      notas: [],
    };
  }

  return { stack: "desconocido", verificar: [], comandos: [], notas: ["No reconocí el proyecto (ni package.json, ni pyproject, ni go.mod, ni Cargo.toml): el portón va a mirar solo la configuración y la política."] };
}

/** El dolphin.config.json que se propone: solo lo que se detectó, nada inventado. */
export function configPropuesta(d: Deteccion): Record<string, unknown> {
  return {
    ...(d.verificar.length > 0 ? { terminal: { verificar: d.verificar } } : {}),
    ...(d.comandos.length > 0 ? { porton: { comandos: d.comandos } } : {}),
  };
}

/** La propuesta dicha para una persona: qué es, con qué se instala y qué corre el portón. */
export function decirDeteccion(d: Deteccion): string {
  const nombre = { node: "Node", python: "Python", go: "Go", rust: "Rust", desconocido: "" }[d.stack];
  const fases = d.verificar.length > 0 ? d.verificar : d.comandos.map((c) => `${c.nombre} (${[c.cmd, ...c.args].join(" ")})`);
  return [
    d.stack === "desconocido" ? "No reconocí qué tipo de proyecto es." : `Es un proyecto de ${nombre}${d.gestor ? ` (con ${d.gestor})` : ""}.`,
    fases.length > 0 ? `Para probar cada cambio voy a correr: ${fases.join(" › ")}.` : "",
    ...d.notas,
  ]
    .filter(Boolean)
    .join(" ");
}
