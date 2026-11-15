import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { correrConPrompt, noPasaTalCual, prepararComando } from "./ejecutar.js";
import { anotarAgregados } from "../nucleo/cambios.js";
import { objetosJson } from "../nucleo/json.js";
import { armarPrompt, leerContrato, pedidoDeCorreccion } from "./claude.js";
import { medirForma } from "../nucleo/forma.js";
import { FalloDelAgente } from "../nucleo/tipos.js";
import type { Agente, Falla, Tokens, Trabajo, Universo } from "../nucleo/tipos.js";

/**
 * Los otros motores: Antigravity (Gemini) y Codex (OpenAI).
 *
 * Reciben EXACTAMENTE el mismo pedido que Claude —la tarea, el perfil del
 * proyecto, las reglas de la casa, el contrato de superficie— porque la
 * memoria es del proyecto y no del modelo. Es lo que hace que uno barato
 * encare las cosas como uno caro: no tiene que adivinar lo que el repo ya
 * aprendió, se lo dicen igual que al caro.
 *
 * El aislamiento, igual que con Claude, lo da el worktree; y cuando corren
 * solos, la política del portón mira el diff después.
 */

export interface OpcionesOtroAgente {
  readonly modelo?: string;
  readonly contexto?: string;
  /** «editar» acepta cambios de archivos; «todo» corre sin pedir permiso (siempre en un worktree). */
  readonly permisos?: "editar" | "todo";
  /** Milisegundos antes de darlo por colgado. */
  readonly tope?: number;
  readonly cmd?: string;
  /**
   * El repo o la tarea vienen de afuera (ver siembra.ts). Codex ya corre
   * siempre en su sandbox de escritura sin red y no ejecuta hooks a los que
   * nadie les dio confianza; Antigravity no: sin «todo» su terminal corría
   * sin sandbox y expandía las skills y comandos que trae el repo.
   */
  readonly deAfuera?: boolean;
}

// El pedido para corregir es el mismo para todos los motores: vive en claude.ts.
type Enfoque = { nombre: string; instruccion: string; modelo?: string };

/**
 * Lo que cierra cualquier corrida de estos motores: medir lo que tocó y
 * leer el contrato. Ninguno de los dos informa plata —corren con la cuenta
 * de la persona, ChatGPT o Google—, así que el costo queda desconocido y
 * viajan los tokens. Un cero haría pasar por gratis lo que no se midió.
 */
async function cerrar(universo: Universo, respuesta: string, tokens: Tokens | undefined, modelo?: string): Promise<Trabajo> {
  const forma = await medirForma(universo.ruta);
  // Un agente que no tocó un archivo contestó en vez de trabajar: no puede
  // cruzar el portón intacto y ganar por ser «el más simple».
  if (forma.archivos === 0) throw new FalloDelAgente("no tocó ningún archivo: contestó en vez de trabajar", 0, true);
  const contrato = leerContrato(respuesta);
  return {
    forma,
    gastado: 0,
    costoDesconocido: true,
    ...(tokens ? { tokens } : {}),
    ...(contrato ? { contrato } : {}),
    ...(modelo ? { modelo } : {}),
  };
}

// ── Antigravity ─────────────────────────────────────────────────────────────

export const MODELO_ANTIGRAVITY = "gemini-3.8-flash-medium";

/**
 * Medido: con «aceptar ediciones», Gemini intenta correr un comando para
 * mirar el repo, se lo niegan, y en vez de seguir sin él termina el turno
 * sin tocar nada. Diciéndoselo, edita directo.
 */
export const PISTA_SIN_COMANDOS =
  "No corras comandos de terminal: leé y editá los archivos directamente con tus herramientas de archivos.";

/** Los argumentos de `agy`: el pedido va con -p, al final (agy no lo lee de la entrada estándar). */
export function argumentosDeAntigravity(prompt: string, opciones: OpcionesOtroAgente, modelo?: string): string[] {
  const todo = opciones.permisos === "todo";
  return [
    "--output-format",
    "json",
    // Corriendo solo: sin pedir permiso, pero con la terminal en sandbox.
    // agy no tiene lista de comandos prohibidos como Claude, y sin sandbox un
    // `git push` desde el worktree llegaría al remoto de verdad.
    ...(todo ? ["--dangerously-skip-permissions"] : ["--mode", "accept-edits"]),
    // De afuera, el sandbox va siempre y lo que el repo define no se expande:
    // lo mismo que con Claude, que carga solo la configuración de la persona.
    ...(todo || opciones.deAfuera ? ["--sandbox"] : []),
    ...(opciones.deAfuera ? ["--disable-slash-commands"] : []),
    "--model",
    modelo ?? opciones.modelo ?? MODELO_ANTIGRAVITY,
    "-p",
    todo ? prompt : `${prompt}\n\n${PISTA_SIN_COMANDOS}`,
  ];
}

interface SalidaDeAntigravity {
  readonly status?: string;
  readonly response?: string;
  readonly error?: string;
  readonly usage?: {
    readonly input_tokens?: number;
    readonly output_tokens?: number;
    readonly thinking_tokens?: number;
    readonly cache_read_tokens?: number;
  };
}

/**
 * Los tokens que informa agy. Medido el 22/10: `usage` trae entrada, salida,
 * razonamiento y caché, y el total es entrada + salida (6831 + 26 = 6857 con
 * 25 de razonamiento), así que el razonamiento ya viene adentro de la salida.
 */
export function tokensDeAntigravity(leido: SalidaDeAntigravity): Tokens | undefined {
  const u = leido.usage;
  if (!u) return undefined;
  return { entrada: u.input_tokens ?? 0, salida: u.output_tokens ?? 0, ...(u.cache_read_tokens ? { cache: u.cache_read_tokens } : {}) };
}

export function leerSalidaDeAntigravity(crudo: string): SalidaDeAntigravity {
  const texto = crudo.trim();
  if (texto === "") return { status: "ERROR", error: "agy no devolvió nada" };
  // El objeto de la salida aunque venga con un aviso antes o después (ver json.ts).
  const leido = objetosJson(texto).find((o): o is SalidaDeAntigravity => typeof o === "object" && o !== null && "status" in o);
  return leido ?? { status: "ERROR", error: texto.slice(0, 300) };
}

export function agenteAntigravity(opciones: OpcionesOtroAgente = {}): Agente {
  const pedido = opciones.cmd ?? "agy";

  const correr = async (prompt: string, universo: Universo, enfoque?: Enfoque, senal?: AbortSignal) => {
    const modelo = enfoque?.modelo ?? opciones.modelo ?? MODELO_ANTIGRAVITY;
    // agy no lee el pedido de la entrada estándar: va como argumento. Uno largo
    // (más de lo que entra en una línea de comandos), o uno que cmd.exe no deja
    // pasar tal cual (saltos de línea, `%`), va en un archivo del worktree que el
    // agente lee; anotado como agregado, no entra al diff ni al commit (ver cambios.ts).
    const porArchivo = prompt.length > 6000 || noPasaTalCual(pedido, prompt);
    const pedidoEntero = join(universo.ruta, ".dolphin-pedido.md");
    if (porArchivo) {
      await writeFile(pedidoEntero, prompt, "utf8");
      await anotarAgregados(universo.ruta, [".dolphin-pedido.md"]).catch(() => {});
    }
    const argumento = porArchivo ? "El pedido completo está en el archivo .dolphin-pedido.md de esta carpeta: leelo entero y hacé lo que dice." : prompt;
    const listo = prepararComando(pedido, argumentosDeAntigravity(argumento, opciones, modelo));
    if (!listo) throw new Error(`no encontré «${pedido}» en el PATH: instalá Antigravity o sumá su carpeta al PATH`);
    const { salida } = await correrConPrompt(listo.cmd, listo.args, "", universo.ruta, opciones.tope ?? 600_000, universo.entorno, listo.verbatim, undefined, senal).finally(
      () => (porArchivo ? rm(pedidoEntero, { force: true }).catch(() => {}) : undefined),
    );
    const leido = leerSalidaDeAntigravity(salida);
    if (leido.status !== "SUCCESS") {
      // Pudo haber trabajado antes de fallar, y agy no dice cuánto costó.
      throw new FalloDelAgente((leido.error ?? leido.response ?? "Antigravity devolvió un error sin explicación").slice(0, 200), 0, true);
    }
    return { respuesta: leido.response ?? "", modelo, tokens: tokensDeAntigravity(leido) };
  };

  return {
    nombre: `antigravity ${opciones.modelo ?? MODELO_ANTIGRAVITY}`,
    async trabajar(universo, tarea, enfoque, senal) {
      const { respuesta, modelo, tokens } = await correr(armarPrompt(tarea, opciones.contexto, enfoque?.instruccion), universo, enfoque, senal);
      return cerrar(universo, respuesta, tokens, modelo);
    },
    async corregir(universo, tarea, falla, enfoque) {
      const { respuesta, modelo, tokens } = await correr(pedidoDeCorreccion(tarea, falla), universo, enfoque);
      return cerrar(universo, respuesta, tokens, modelo);
    },
  };
}

// ── Codex ───────────────────────────────────────────────────────────────────

/** Los argumentos de `codex exec`: el pedido entra por la entrada estándar («-»). */
export function argumentosDeCodex(ruta: string, salida: string, opciones: OpcionesOtroAgente, modelo?: string): string[] {
  return [
    "exec",
    "-",
    "-C",
    ruta,
    // El sandbox de Codex deja escribir solo en el worktree: con «todo» no
    // hace falta saltearlo, alcanza con no pedir confirmaciones.
    "--sandbox",
    "workspace-write",
    "--skip-git-repo-check",
    "--ephemeral",
    // Los eventos por la salida estándar: el último `turn.completed` trae los tokens.
    "--json",
    "-o",
    salida,
    ...(modelo ?? opciones.modelo ? ["-m", (modelo ?? opciones.modelo)!] : []),
  ];
}

/**
 * Los tokens de `codex exec --json`: la suma de cada `turn.completed`.
 * Medido el 22/10: el caché viene adentro de la entrada (20261 con 13312
 * del caché) y el razonamiento adentro de la salida, como en la API.
 */
export function tokensDeCodex(eventos: string): Tokens | undefined {
  let entrada = 0;
  let salida = 0;
  let cache = 0;
  let hubo = false;
  for (const linea of eventos.split("\n")) {
    if (!linea.includes("turn.completed")) continue;
    try {
      const evento = JSON.parse(linea) as {
        type?: string;
        usage?: { input_tokens?: number; cached_input_tokens?: number; output_tokens?: number };
      };
      if (evento.type !== "turn.completed" || !evento.usage) continue;
      hubo = true;
      entrada += evento.usage.input_tokens ?? 0;
      cache += evento.usage.cached_input_tokens ?? 0;
      salida += evento.usage.output_tokens ?? 0;
    } catch {
      // Una línea que no es un evento (un aviso del CLI): se sigue.
    }
  }
  return hubo ? { entrada, salida, ...(cache > 0 ? { cache } : {}) } : undefined;
}

/**
 * Si la corrida de Codex falló: un evento `turn.failed` o `error`, o un
 * código de salida que no es 0 sin ningún turno completo. Sin mirarlo, un
 * límite de uso salía como «contestó en vez de trabajar», y en una
 * corrección la vuelta fallida contaba como hecha.
 */
export function fallaDeCodex(eventos: string, codigo: number | null): string | undefined {
  let completos = 0;
  for (const linea of eventos.split("\n")) {
    if (!linea.trim().startsWith("{")) continue;
    try {
      const evento = JSON.parse(linea) as { type?: string; message?: unknown; error?: { message?: unknown } | string };
      if (evento.type === "turn.completed") completos += 1;
      if (evento.type === "turn.failed" || evento.type === "error") {
        const motivo = typeof evento.error === "string" ? evento.error : evento.error?.message ?? evento.message;
        return typeof motivo === "string" && motivo.trim() !== "" ? motivo.trim().slice(0, 200) : `Codex terminó con «${evento.type}»`;
      }
    } catch {
      // una línea que no es un evento
    }
  }
  return codigo !== 0 && codigo !== null && completos === 0 ? `Codex salió con ${codigo} sin terminar ningún turno` : undefined;
}

export function agenteCodex(opciones: OpcionesOtroAgente = {}): Agente {
  const pedido = opciones.cmd ?? "codex";

  const correr = async (prompt: string, universo: Universo, enfoque?: Enfoque, senal?: AbortSignal) => {
    const modelo = enfoque?.modelo ?? opciones.modelo;
    const carpeta = await mkdtemp(join(tmpdir(), "dolphin-codex-"));
    const archivo = join(carpeta, "ultimo.txt");
    try {
      const listo = prepararComando(pedido, argumentosDeCodex(universo.ruta, archivo, opciones, modelo));
      if (!listo) throw new Error(`no encontré «${pedido}» en el PATH: instalá Codex o sumá su carpeta al PATH`);
      const { salida: eventos, codigo } = await correrConPrompt(listo.cmd, listo.args, prompt, universo.ruta, opciones.tope ?? 600_000, universo.entorno, listo.verbatim, undefined, senal);
      // Pudo haber trabajado antes de fallar, y Codex no dice cuánto costó.
      const falla = fallaDeCodex(eventos, codigo);
      if (falla) throw new FalloDelAgente(falla, 0, true);
      const respuesta = await readFile(archivo, "utf8").catch(() => "");
      return { respuesta, tokens: tokensDeCodex(eventos), ...(modelo ? { modelo } : { modelo: "codex" }) };
    } finally {
      await rm(carpeta, { recursive: true, force: true }).catch(() => {});
    }
  };

  return {
    nombre: opciones.modelo ? `codex ${opciones.modelo}` : "codex",
    async trabajar(universo, tarea, enfoque, senal) {
      const { respuesta, modelo, tokens } = await correr(armarPrompt(tarea, opciones.contexto, enfoque?.instruccion), universo, enfoque, senal);
      return cerrar(universo, respuesta, tokens, modelo);
    },
    async corregir(universo, tarea, falla, enfoque) {
      const { respuesta, modelo, tokens } = await correr(pedidoDeCorreccion(tarea, falla), universo, enfoque);
      return cerrar(universo, respuesta, tokens, modelo);
    },
  };
}
