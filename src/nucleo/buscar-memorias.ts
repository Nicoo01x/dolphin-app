import { createHash } from "node:crypto";
import { open, readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

/**
 * El buscador de memorias: todo lo que este proyecto ya les enseñó a otros
 * modelos, esté donde esté.
 *
 * No alcanza con mirar el repo. Lo que una persona le explicó a Claude Code
 * vive en `~/.claude`: en la memoria que Claude anota sola (a veces en la
 * carpeta de OTRO proyecto, si la sesión arrancó desde ahí) y, entero, en las
 * conversaciones. Lo mismo Codex (`~/.codex/sessions`) y Gemini CLI
 * (`~/.gemini/tmp/<sha256 de la ruta>`). Y las instrucciones globales de cada
 * herramienta valen para todos los proyectos.
 *
 * Solo lee. De las conversaciones toma SOLO lo que escribió la persona: ni las
 * respuestas del modelo, ni la salida de las herramientas, ni lo que inyecta
 * el CLI (avisos de tareas, comandos, contexto del entorno).
 */

export type Herramienta =
  | "claude"
  | "agents"
  | "gemini"
  | "codex"
  | "cursor"
  | "copilot"
  | "windsurf"
  | "aider"
  | "cline"
  | "roo"
  | "kiro"
  | "continue"
  | "junie"
  | "trae"
  | "zed"
  | "augment";

export type TipoDeFuente = "instrucciones" | "memoria" | "conversaciones";
export type Alcance = "proyecto" | "global" | "otro-proyecto";

export interface Fuente {
  readonly herramienta: Herramienta;
  readonly tipo: TipoDeFuente;
  readonly alcance: Alcance;
  /** Cómo se la muestra: «CLAUDE.md», «Memoria de Claude Code», «Conversaciones con Codex». */
  readonly nombre: string;
  /** Dónde está, para mostrar: relativa al repo o absoluta. */
  readonly ruta: string;
  /** Los archivos de verdad, absolutos: de acá se lee en cada siembra. */
  readonly rutas: readonly string[];
  readonly archivos: number;
  /** Líneas con algo; en las conversaciones, los mensajes de la persona. */
  readonly lineas: number;
  /** En la memoria de otro proyecto: cuál, con el nombre de su carpeta de verdad. */
  readonly proyecto?: string;
}

/** Un mensaje de la persona en una conversación con un modelo. */
export interface Mensaje {
  readonly de: "claude" | "codex" | "gemini";
  readonly texto: string;
  readonly cuando?: string;
}

export interface Hallazgo {
  readonly fuentes: Fuente[];
  /** Lo que la persona les dijo a los modelos sobre este proyecto: va al destilado, no al prompt. */
  readonly mensajes: Mensaje[];
}

/** Archivos de instrucciones de cada herramienta, relativos al repo. */
const ARCHIVOS: readonly { readonly herramienta: Herramienta; readonly ruta: string }[] = [
  { herramienta: "claude", ruta: "CLAUDE.md" },
  { herramienta: "claude", ruta: "CLAUDE.local.md" },
  { herramienta: "claude", ruta: ".claude/CLAUDE.md" },
  { herramienta: "agents", ruta: "AGENTS.md" },
  { herramienta: "gemini", ruta: "GEMINI.md" },
  { herramienta: "cursor", ruta: ".cursorrules" },
  { herramienta: "copilot", ruta: ".github/copilot-instructions.md" },
  { herramienta: "windsurf", ruta: ".windsurfrules" },
  { herramienta: "aider", ruta: "CONVENTIONS.md" },
  { herramienta: "cline", ruta: ".clinerules" },
  { herramienta: "junie", ruta: ".junie/guidelines.md" },
  { herramienta: "augment", ruta: ".augment-guidelines" },
  { herramienta: "zed", ruta: ".rules" },
];

/** Carpetas de reglas: cada archivo adentro es una regla. */
const CARPETAS: readonly { readonly herramienta: Herramienta; readonly ruta: string; readonly nombre: string }[] = [
  { herramienta: "cursor", ruta: ".cursor/rules", nombre: "Reglas de Cursor" },
  { herramienta: "copilot", ruta: ".github/instructions", nombre: "Instrucciones de Copilot por carpeta" },
  { herramienta: "windsurf", ruta: ".windsurf/rules", nombre: "Reglas de Windsurf" },
  { herramienta: "cline", ruta: ".clinerules", nombre: "Reglas de Cline" },
  { herramienta: "roo", ruta: ".roo/rules", nombre: "Reglas de Roo" },
  { herramienta: "kiro", ruta: ".kiro/steering", nombre: "Guías de Kiro" },
  { herramienta: "continue", ruta: ".continue/rules", nombre: "Reglas de Continue" },
  { herramienta: "trae", ruta: ".trae/rules", nombre: "Reglas de Trae" },
];

/** Las instrucciones de cada herramienta que valen para todos los proyectos, relativas a la casa. */
const GLOBALES: readonly { readonly herramienta: Herramienta; readonly ruta: string; readonly nombre: string }[] = [
  { herramienta: "claude", ruta: ".claude/CLAUDE.md", nombre: "Tus instrucciones globales de Claude" },
  { herramienta: "codex", ruta: ".codex/AGENTS.md", nombre: "Tus instrucciones globales de Codex" },
  { herramienta: "gemini", ruta: ".gemini/GEMINI.md", nombre: "Tus instrucciones globales de Gemini" },
];

/** Cuántas veces tiene que aparecer el proyecto en una conversación para que sea sobre él. */
export const MENCIONES_MINIMAS = 20;
/** Un mensaje pegado enorme (un log, un documento) no es una instrucción: se recorta. */
const TOPE_POR_MENSAJE = 2_000;

async function leerTexto(ruta: string): Promise<string | null> {
  try {
    const info = await stat(ruta);
    if (!info.isFile()) return null;
    return await readFile(ruta, "utf8");
  } catch {
    return null;
  }
}

async function listar(carpeta: string): Promise<string[]> {
  try {
    return (await readdir(carpeta)).sort();
  } catch {
    return [];
  }
}

const contarLineas = (texto: string) => texto.split("\n").filter((l) => l.trim() !== "").length;

/** La carpeta de proyecto de Claude Code: la ruta absoluta con todo lo que no es letra o número cambiado por «-». */
export function carpetaDeClaudeCode(repo: string, casa = homedir()): string {
  return join(casa, ".claude", "projects", resolve(repo).replace(/[^a-zA-Z0-9]/g, "-"));
}

/** Dónde guarda Gemini CLI lo de un proyecto: el sha256 de su ruta. */
export function carpetaDeGemini(repo: string, casa = homedir()): string {
  return join(casa, ".gemini", "tmp", createHash("sha256").update(resolve(repo)).digest("hex"));
}

/**
 * Cómo se reconoce el proyecto en un texto: la ruta absoluta en sus formas
 * (con «\», con «/», escapada en JSON) y el nombre de la carpeta si no es
 * genérico. «app» o «web» aparecen en cualquier lado: con esos, solo la ruta.
 */
export function marcasDelProyecto(repo: string): string[] {
  const absoluta = resolve(repo);
  const conBarras = absoluta.replace(/\\/g, "/");
  const marcas = new Set([absoluta, conBarras, absoluta.replace(/\\/g, "\\\\")].map((m) => m.toLowerCase()));
  const nombre = basename(absoluta).toLowerCase();
  const generico = nombre.length < 6 || ["src", "app", "web", "api", "client", "server", "frontend", "backend", "project", "proyecto"].includes(nombre);
  if (!generico) marcas.add(nombre);
  return [...marcas];
}

/** Cuántas veces aparece el proyecto en un texto (sin distinguir mayúsculas). */
export function menciones(texto: string, marcas: readonly string[]): number {
  const bajo = texto.toLowerCase();
  let total = 0;
  for (const marca of marcas) {
    let desde = 0;
    for (;;) {
      const i = bajo.indexOf(marca, desde);
      if (i < 0) break;
      total += 1;
      desde = i + marca.length;
    }
  }
  return total;
}

/** Lo que inyecta un CLI en el turno de la persona, y no lo escribió ella. */
function esDelSistema(texto: string): boolean {
  const t = texto.trimStart();
  return (
    t === "" ||
    /^<(task-notification|command-name|command-message|command-args|local-command-stdout|local-command-stderr|system-reminder|environment_context|user_instructions|external_[\w-]+|bash-input|bash-stdout|bash-stderr)\b/.test(t) ||
    t.startsWith("Caveat:") ||
    t.startsWith("[Request interrupted") ||
    t.startsWith("Base directory for this skill:")
  );
}

function recortarMensaje(texto: string): string {
  const limpio = texto.trim();
  return limpio.length <= TOPE_POR_MENSAJE ? limpio : `${limpio.slice(0, TOPE_POR_MENSAJE).trimEnd()} […]`;
}

/** El texto de un contenido de mensaje (string o arreglo de partes), solo lo escrito. */
function textoDeContenido(contenido: unknown): string {
  if (typeof contenido === "string") return contenido;
  if (!Array.isArray(contenido)) return "";
  return contenido
    .filter((p): p is { type: string; text: string } => typeof p?.text === "string" && (p.type === "text" || p.type === "input_text"))
    .map((p) => p.text)
    .join("\n");
}

/**
 * Los mensajes de la persona en una conversación de Claude Code: las líneas
 * `user` con texto (no los `isMeta`, que son skills y contexto) y los que
 * mandó a mitad de turno (`queue-operation` / `enqueue`).
 */
export function mensajesDeClaudeCode(jsonl: string): Mensaje[] {
  const vistos = new Set<string>();
  const mensajes: Mensaje[] = [];
  for (const linea of jsonl.split("\n")) {
    // Antes de parsear: la inmensa mayoría son respuestas y herramientas.
    if (!linea.includes('"type":"user"') && !linea.includes('"queue-operation"')) continue;
    let j: { type?: string; isMeta?: boolean; operation?: string; content?: unknown; timestamp?: string; message?: { role?: string; content?: unknown } };
    try {
      j = JSON.parse(linea);
    } catch {
      continue;
    }
    let texto = "";
    if (j.type === "user" && j.message?.role === "user" && !j.isMeta) texto = textoDeContenido(j.message.content);
    else if (j.type === "queue-operation" && j.operation === "enqueue") texto = typeof j.content === "string" ? j.content : "";
    if (esDelSistema(texto)) continue;
    const clave = texto.trim();
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    mensajes.push({ de: "claude", texto: recortarMensaje(texto), ...(j.timestamp ? { cuando: j.timestamp } : {}) });
  }
  return mensajes;
}

/** Los mensajes de la persona en una sesión de Codex, y la carpeta donde corrió. */
export function mensajesDeCodex(jsonl: string): { cwd?: string; mensajes: Mensaje[] } {
  let cwd: string | undefined;
  const mensajes: Mensaje[] = [];
  for (const linea of jsonl.split("\n")) {
    if (!linea.includes('"session_meta"') && !linea.includes('"role":"user"')) continue;
    let j: { type?: string; timestamp?: string; payload?: { cwd?: string; type?: string; role?: string; content?: unknown } };
    try {
      j = JSON.parse(linea);
    } catch {
      continue;
    }
    if (j.type === "session_meta" && typeof j.payload?.cwd === "string") cwd = j.payload.cwd;
    if (j.payload?.type === "message" && j.payload.role === "user") {
      const texto = textoDeContenido(j.payload.content);
      if (!esDelSistema(texto)) mensajes.push({ de: "codex", texto: recortarMensaje(texto), ...(j.timestamp ? { cuando: j.timestamp } : {}) });
    }
  }
  return { ...(cwd ? { cwd } : {}), mensajes };
}

/** Los mensajes de la persona en el registro de Gemini CLI de un proyecto. */
export function mensajesDeGemini(logs: string): Mensaje[] {
  let datos: unknown;
  try {
    datos = JSON.parse(logs);
  } catch {
    return [];
  }
  if (!Array.isArray(datos)) return [];
  return datos
    .filter((m): m is { type: string; message: string; timestamp?: string } => m?.type === "user" && typeof m.message === "string")
    .filter((m) => !esDelSistema(m.message) && !m.message.startsWith("/"))
    .map((m) => ({ de: "gemini" as const, texto: recortarMensaje(m.message), ...(m.timestamp ? { cuando: m.timestamp } : {}) }));
}

const igualRuta = (a: string, b: string) => resolve(a).toLowerCase() === resolve(b).toLowerCase();

/** Las instrucciones del repo, archivo por archivo y carpeta por carpeta. */
async function instruccionesDelRepo(repo: string): Promise<Fuente[]> {
  const fuentes: Fuente[] = [];
  for (const { herramienta, ruta } of ARCHIVOS) {
    const absoluta = join(repo, ruta);
    const texto = await leerTexto(absoluta);
    if (texto === null || texto.trim() === "") continue;
    fuentes.push({ herramienta, tipo: "instrucciones", alcance: "proyecto", nombre: ruta, ruta, rutas: [absoluta], archivos: 1, lineas: contarLineas(texto) });
  }
  for (const { herramienta, ruta, nombre } of CARPETAS) {
    const rutas = (await listar(join(repo, ruta)))
      .filter((n) => /\.(md|mdc|txt)$/i.test(n))
      .map((n) => join(repo, ruta, n));
    const textos = (await Promise.all(rutas.map(leerTexto))).filter((t): t is string => t !== null && t.trim() !== "");
    if (textos.length === 0) continue;
    fuentes.push({
      herramienta,
      tipo: "instrucciones",
      alcance: "proyecto",
      nombre,
      ruta,
      rutas,
      archivos: textos.length,
      lineas: textos.reduce((n, t) => n + contarLineas(t), 0),
    });
  }
  return fuentes;
}

async function globales(casa: string): Promise<Fuente[]> {
  const fuentes: Fuente[] = [];
  for (const { herramienta, ruta, nombre } of GLOBALES) {
    const absoluta = join(casa, ruta);
    const texto = await leerTexto(absoluta);
    if (texto === null || texto.trim() === "") continue;
    fuentes.push({ herramienta, tipo: "instrucciones", alcance: "global", nombre, ruta: `~/${ruta}`, rutas: [absoluta], archivos: 1, lineas: contarLineas(texto) });
  }
  return fuentes;
}

/**
 * El nombre de verdad del proyecto de una carpeta de Claude Code. La carpeta
 * es la ruta con todo cambiado por «-» y no se puede deshacer («dolphin-app»
 * y «dolphin/app» quedan igual), pero cada conversación anota su `cwd` en las
 * primeras líneas: alcanza con leer el principio. Sin conversaciones, el
 * último tramo del nombre de la carpeta.
 */
export async function proyectoDeLaCarpeta(carpeta: string): Promise<string> {
  for (const nombre of await listar(carpeta)) {
    if (!nombre.endsWith(".jsonl")) continue;
    let archivo: Awaited<ReturnType<typeof open>> | undefined;
    try {
      archivo = await open(join(carpeta, nombre), "r");
      const { buffer, bytesRead } = await archivo.read(Buffer.alloc(256 * 1024), 0, 256 * 1024, 0);
      const cwd = /"cwd":"((?:[^"\\]|\\.)+)"/.exec(buffer.toString("utf8", 0, bytesRead))?.[1];
      const tramo = cwd ? (JSON.parse(`"${cwd}"`) as string).split(/[\\/]/).filter(Boolean).pop() : undefined;
      if (tramo) return tramo;
    } catch {
      // Ilegible: la próxima conversación.
    } finally {
      await archivo?.close();
    }
  }
  return basename(carpeta).split("-").filter(Boolean).pop() ?? basename(carpeta);
}

/**
 * La memoria que Claude Code anotó sola: la de la carpeta de este proyecto
 * entera, y de las de OTROS proyectos solo los archivos que hablan de este
 * (el índice de otro proyecto no: es de él).
 */
async function memoriasDeClaudeCode(repo: string, casa: string, marcas: readonly string[]): Promise<Fuente[]> {
  const fuentes: Fuente[] = [];
  const propia = join(carpetaDeClaudeCode(repo, casa), "memory");
  const propias = (await listar(propia)).filter((n) => n.endsWith(".md")).map((n) => join(propia, n));
  const textosPropios = (await Promise.all(propias.map(leerTexto))).filter((t): t is string => t !== null && t.trim() !== "");
  if (textosPropios.length > 0) {
    fuentes.push({
      herramienta: "claude",
      tipo: "memoria",
      alcance: "proyecto",
      nombre: "Memoria de Claude Code",
      ruta: propia,
      rutas: propias,
      archivos: textosPropios.length,
      lineas: textosPropios.reduce((n, t) => n + contarLineas(t), 0),
    });
  }

  const proyectos = join(casa, ".claude", "projects");
  for (const carpeta of await listar(proyectos)) {
    const memoria = join(proyectos, carpeta, "memory");
    if (igualRuta(memoria, propia)) continue;
    const hablan: string[] = [];
    let lineas = 0;
    for (const nombre of await listar(memoria)) {
      if (!nombre.endsWith(".md") || nombre === "MEMORY.md") continue;
      const texto = await leerTexto(join(memoria, nombre));
      if (!texto || menciones(texto, marcas) === 0) continue;
      hablan.push(join(memoria, nombre));
      lineas += contarLineas(texto);
    }
    if (hablan.length === 0) continue;
    const proyecto = await proyectoDeLaCarpeta(join(proyectos, carpeta));
    fuentes.push({
      herramienta: "claude",
      tipo: "memoria",
      alcance: "otro-proyecto",
      nombre: `Memoria de Claude Code de «${proyecto}»`,
      ruta: memoria,
      rutas: hablan,
      archivos: hablan.length,
      lineas,
      proyecto,
    });
  }
  return fuentes;
}

/** Las conversaciones de Claude Code que son sobre este proyecto: las de su carpeta y las que lo nombran mucho. */
async function conversacionesDeClaudeCode(repo: string, casa: string, marcas: readonly string[]): Promise<{ fuente?: Fuente; mensajes: Mensaje[] }> {
  const proyectos = join(casa, ".claude", "projects");
  const propia = carpetaDeClaudeCode(repo, casa);
  const rutas: string[] = [];
  const mensajes: Mensaje[] = [];
  for (const carpeta of await listar(proyectos)) {
    const dir = join(proyectos, carpeta);
    const esPropia = igualRuta(dir, propia);
    // Solo las conversaciones de primer nivel: las de subagents/ las escribió el agente, no la persona.
    for (const nombre of await listar(dir)) {
      if (!nombre.endsWith(".jsonl")) continue;
      const texto = await leerTexto(join(dir, nombre));
      if (!texto) continue;
      if (!esPropia && menciones(texto, marcas) < MENCIONES_MINIMAS) continue;
      const deEsta = mensajesDeClaudeCode(texto);
      if (deEsta.length === 0) continue;
      rutas.push(join(dir, nombre));
      mensajes.push(...deEsta);
    }
  }
  if (rutas.length === 0) return { mensajes };
  return {
    fuente: {
      herramienta: "claude",
      tipo: "conversaciones",
      alcance: "proyecto",
      nombre: "Conversaciones con Claude Code",
      ruta: proyectos,
      rutas,
      archivos: rutas.length,
      lineas: mensajes.length,
    },
    mensajes,
  };
}

async function archivosDentro(carpeta: string, filtro: (nombre: string) => boolean, profundidad = 4): Promise<string[]> {
  if (profundidad < 0) return [];
  const salida: string[] = [];
  let entradas: import("node:fs").Dirent[];
  try {
    entradas = await readdir(carpeta, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const e of entradas) {
    const ruta = join(carpeta, e.name);
    if (e.isDirectory()) salida.push(...(await archivosDentro(ruta, filtro, profundidad - 1)));
    else if (e.isFile() && filtro(e.name)) salida.push(ruta);
  }
  return salida;
}

/** Las sesiones de Codex que corrieron en este repo o lo nombran mucho. */
async function conversacionesDeCodex(repo: string, casa: string, marcas: readonly string[]): Promise<{ fuente?: Fuente; mensajes: Mensaje[] }> {
  const raiz = join(casa, ".codex", "sessions");
  const rutas: string[] = [];
  const mensajes: Mensaje[] = [];
  for (const ruta of await archivosDentro(raiz, (n) => n.endsWith(".jsonl"))) {
    const texto = await leerTexto(ruta);
    if (!texto) continue;
    const sesion = mensajesDeCodex(texto);
    const enElRepo = sesion.cwd !== undefined && igualRuta(sesion.cwd, repo);
    if (!enElRepo && menciones(texto, marcas) < MENCIONES_MINIMAS) continue;
    if (sesion.mensajes.length === 0) continue;
    rutas.push(ruta);
    mensajes.push(...sesion.mensajes);
  }
  if (rutas.length === 0) return { mensajes };
  return {
    fuente: { herramienta: "codex", tipo: "conversaciones", alcance: "proyecto", nombre: "Conversaciones con Codex", ruta: raiz, rutas, archivos: rutas.length, lineas: mensajes.length },
    mensajes,
  };
}

async function conversacionesDeGemini(repo: string, casa: string): Promise<{ fuente?: Fuente; mensajes: Mensaje[] }> {
  const ruta = join(carpetaDeGemini(repo, casa), "logs.json");
  const texto = await leerTexto(ruta);
  const mensajes = texto ? mensajesDeGemini(texto) : [];
  if (mensajes.length === 0) return { mensajes };
  return {
    fuente: { herramienta: "gemini", tipo: "conversaciones", alcance: "proyecto", nombre: "Conversaciones con Gemini", ruta, rutas: [ruta], archivos: 1, lineas: mensajes.length },
    mensajes,
  };
}

/** Todo lo que este proyecto ya les enseñó a otros modelos. Solo lee. */
export async function buscarMemorias(repo: string, casa = homedir()): Promise<Hallazgo> {
  const marcas = marcasDelProyecto(repo);
  const [delRepo, deLaCasa, memorias, claude, codex, gemini] = await Promise.all([
    instruccionesDelRepo(repo),
    globales(casa),
    memoriasDeClaudeCode(repo, casa, marcas),
    conversacionesDeClaudeCode(repo, casa, marcas),
    conversacionesDeCodex(repo, casa, marcas),
    conversacionesDeGemini(repo, casa),
  ]);
  const conversaciones = [claude, codex, gemini];
  return {
    fuentes: [
      ...delRepo,
      ...memorias,
      ...deLaCasa,
      ...conversaciones.flatMap((c) => (c.fuente ? [c.fuente] : [])),
    ],
    mensajes: conversaciones
      .flatMap((c) => c.mensajes)
      .sort((a, b) => (a.cuando ?? "").localeCompare(b.cuando ?? "")),
  };
}
