import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { Conexion, MetodoDesconocido } from "./acp-protocolo.js";
import { comoCorre, prepararComando } from "./ejecutar.js";
import { anotarHijo, olvidarHijo } from "./procesos.js";
import { FalloDelAgente } from "../nucleo/tipos.js";

/**
 * Hablar ACP (Agent Client Protocol) con un agente de afuera.
 *
 * Hasta acá cada motor nuevo era un módulo o una fila: sus banderas, cómo recibe el pedido, dónde
 * deja la respuesta. ACP da vuelta eso: es un protocolo abierto, así que **un solo cliente sirve
 * para cualquier agente que lo hable**, y sumar uno es decir con qué comando se lanza. Lo hablan
 * Gemini, el adaptador de Claude, Codex, Cursor, OpenCode y varias decenas más.
 *
 * Y da algo que los otros motores no dan: el agente va contando lo que hace mientras lo hace
 * —cada herramienta, su plan, lo que escribió— y, cuando lo manda, cuánto gastó. Con los CLI eso
 * era adivinar leyendo su salida.
 *
 * Lo que este cliente le concede al agente, y lo que no:
 * - **Leer y escribir archivos, solo adentro del worktree.** Es la caja de siempre. Una ruta de
 *   afuera no es un caso raro: es un agente de terceros tocando el repo de la persona, y se niega.
 * - **Permisos: sí, automático.** El universo es un worktree descartable y el portón mira el diff
 *   después; preguntar por cada herramienta sería preguntar por algo que ya está acotado.
 * - **Terminal: no.** No le ofrecemos correr comandos a través nuestro. El que quiera ejecutar algo
 *   lo hace con sus propios medios y bajo su propio sandbox, no con los permisos de Dolphin.
 */

export interface OpcionesDeAcp {
  /** El comando del agente, como se lanza: `gemini`, `claude-agent-acp`, `codex-acp`… */
  readonly cmd: string;
  readonly args?: readonly string[];
  /** El worktree: es el `cwd` de la sesión y el único lugar donde puede escribir. */
  readonly cwd: string;
  /** Milisegundos antes de darlo por colgado. */
  readonly tope?: number;
  readonly senal?: AbortSignal;
  readonly entorno?: Readonly<Record<string, string | undefined>>;
  /**
   * La sesión de una corrida anterior sobre este mismo worktree. Con esto, la corrección sigue la
   * MISMA conversación en vez de empezar de cero: el agente ya sabe lo que intentó y por qué, y no
   * hay que pagar de nuevo para que entienda el repo. Se usa solo si el agente dijo que puede
   * (`loadSession`); si no, se abre una nueva sin hacer ruido.
   */
  readonly sesionPrevia?: string;
  /** Lo que el agente va diciendo, apenas lo dice (ver nucleo/voces.ts). */
  readonly alDecir?: (texto: string) => void;
  /** Cada herramienta que usa, para la línea de tiempo. */
  readonly alUsar?: (herramienta: HerramientaDelAgente) => void;
  /** Su plan, cada vez que lo cambia. */
  readonly alPlanear?: (pasos: readonly PasoDelPlan[]) => void;
}

export interface HerramientaDelAgente {
  readonly id: string;
  readonly titulo: string;
  /** `read`, `edit`, `execute`, `search`… como lo nombra el protocolo. */
  readonly tipo?: string;
  readonly estado: "pending" | "in_progress" | "completed" | "failed";
}

export interface PasoDelPlan {
  readonly texto: string;
  readonly estado: "pending" | "in_progress" | "completed";
  readonly prioridad?: "high" | "medium" | "low";
}

/** Por qué terminó el turno, tal como lo dice el protocolo. */
export type PorQueParo = "end_turn" | "max_tokens" | "max_turn_requests" | "refusal" | "cancelled";

export interface TrabajoDeAcp {
  readonly porQueParo: PorQueParo;
  /** La sesión que quedó abierta: se le pasa a la corrección para que siga la misma conversación. */
  readonly sesion: string;
  /** Todo lo que dijo el agente, pegado. */
  readonly texto: string;
  /** Lo que gastó, si lo informó: ACP lo manda en `usage_update` y los CLI no lo dicen nunca. */
  readonly gastado?: number;
  readonly contexto?: { readonly usado: number; readonly tamano: number };
  readonly herramientas: readonly HerramientaDelAgente[];
  readonly plan: readonly PasoDelPlan[];
  /** Lo que el agente dijo por el error estándar: el motivo real cuando no arranca. */
  readonly ruido: string;
}

const VERSION_DEL_PROTOCOLO = 1;
const TOPE = 20 * 60 * 1000;

/** Una ruta que el agente pide, resuelta y confirmada adentro del worktree. */
function adentroDe(worktree: string, ruta: unknown): string {
  if (typeof ruta !== "string" || ruta === "") throw new Error("falta la ruta");
  const completa = resolve(worktree, ruta);
  const relativa = relative(resolve(worktree), completa);
  if (relativa.startsWith("..") || (relativa !== "" && resolve(worktree, relativa) !== completa)) {
    throw new Error(`«${ruta}» queda fuera de la carpeta de esta rama: acá solo se toca lo de adentro`);
  }
  return completa;
}

/** La pinta de un pedido de permiso: se acepta la primera opción que permita. */
function queOpcionPermite(opciones: unknown): string | undefined {
  if (!Array.isArray(opciones)) return undefined;
  const elegibles = opciones.filter((o): o is { optionId: string; kind?: string } => typeof (o as { optionId?: unknown }).optionId === "string");
  return (elegibles.find((o) => o.kind === "allow_always") ?? elegibles.find((o) => o.kind === "allow_once") ?? elegibles[0])?.optionId;
}

/**
 * Lanza el agente, le hace el apretón de manos, abre una sesión sobre el worktree y le da la tarea.
 * Vuelve cuando el agente dice que terminó el turno.
 */
export async function correrAgenteAcp(pedido: string, opciones: OpcionesDeAcp): Promise<TrabajoDeAcp> {
  const listo = prepararComando(opciones.cmd, opciones.args ?? []);
  if (!listo) throw new FalloDelAgente(`no encontré «${opciones.cmd}»: el agente ACP no está instalado o no está en el PATH`, 0, true);

  const env = { ...process.env, ...opciones.entorno };
  const corre = comoCorre(listo.cmd, listo.args, opciones.cwd, env);
  const proceso = spawn(corre.cmd, [...corre.args], {
    cwd: opciones.cwd,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
    env: "env" in corre ? corre.env : env,
    windowsVerbatimArguments: listo.verbatim,
  }) as ChildProcessWithoutNullStreams;
  anotarHijo(proceso.pid);

  let ruido = "";
  proceso.stderr.setEncoding("utf8");
  proceso.stderr.on("data", (t: string) => (ruido += t));

  const dicho: string[] = [];
  /** Mientras se carga una sesión vieja, lo que llega es su historial y no lo de este turno. */
  let cargando = false;
  const herramientas = new Map<string, HerramientaDelAgente>();
  let plan: PasoDelPlan[] = [];
  let gastado: number | undefined;
  let contexto: { usado: number; tamano: number } | undefined;

  const conexion = new Conexion(
    proceso,
    async (metodo, params) => atenderAlAgente(metodo, params, opciones.cwd),
    (metodo, params) => {
      if (metodo !== "session/update") return;
      // Lo que llega mientras se carga una sesión vieja es su historial: ya pasó, no es de ahora.
      if (cargando) return;
      const u = (params as { update?: Record<string, unknown> } | undefined)?.update;
      if (!u) return;
      switch (u["sessionUpdate"]) {
        case "agent_message_chunk": {
          const texto = textoDelBloque(u["content"]);
          if (texto) {
            dicho.push(texto);
            opciones.alDecir?.(texto);
          }
          break;
        }
        case "tool_call":
        case "tool_call_update": {
          const id = typeof u["toolCallId"] === "string" ? u["toolCallId"] : "";
          if (!id) break;
          const previa = herramientas.get(id);
          const herramienta: HerramientaDelAgente = {
            id,
            titulo: typeof u["title"] === "string" ? u["title"] : (previa?.titulo ?? id),
            ...(typeof u["kind"] === "string" ? { tipo: u["kind"] } : previa?.tipo ? { tipo: previa.tipo } : {}),
            estado: (u["status"] as HerramientaDelAgente["estado"]) ?? previa?.estado ?? "pending",
          };
          herramientas.set(id, herramienta);
          opciones.alUsar?.(herramienta);
          break;
        }
        case "plan": {
          // Cada plan reemplaza al anterior: es el plan, no un agregado.
          plan = (Array.isArray(u["entries"]) ? u["entries"] : []).flatMap((e: unknown) => {
            const paso = e as { content?: unknown; status?: unknown; priority?: unknown };
            if (typeof paso.content !== "string") return [];
            const prioridad = typeof paso.priority === "string" ? (paso.priority as NonNullable<PasoDelPlan["prioridad"]>) : undefined;
            return [{ texto: paso.content, estado: (paso.status as PasoDelPlan["estado"]) ?? "pending", ...(prioridad ? { prioridad } : {}) }];
          });
          opciones.alPlanear?.(plan);
          break;
        }
        case "usage_update": {
          const costo = (u["cost"] as { amount?: unknown } | undefined)?.amount;
          if (typeof costo === "number" && Number.isFinite(costo)) gastado = costo;
          if (typeof u["used"] === "number" && typeof u["size"] === "number") contexto = { usado: u["used"], tamano: u["size"] };
          break;
        }
        default:
          break;
      }
    },
  );

  const matar = () => {
    try {
      proceso.kill("SIGKILL");
    } catch {
      /* ya estaba muerto */
    }
  };
  const reloj = setTimeout(matar, opciones.tope ?? TOPE);
  const cancelar = () => matar();
  opciones.senal?.addEventListener("abort", cancelar, { once: true });

  try {
    const saludo = (await conexion.pedir("initialize", {
      protocolVersion: VERSION_DEL_PROTOCOLO,
      // Lo que no se anuncia, el agente no lo puede pedir. La terminal queda afuera a propósito.
      clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: false },
      clientInfo: { name: "dolphin", title: "Dolphin", version: "1.0.0" },
    })) as { protocolVersion?: unknown; agentCapabilities?: { loadSession?: unknown } };
    // El agente contesta con la última versión que habla. Si no es la nuestra, no hay conversación
    // posible: mejor decirlo que mandarle mensajes que no va a entender.
    if (typeof saludo?.protocolVersion === "number" && saludo.protocolVersion !== VERSION_DEL_PROTOCOLO) {
      throw new FalloDelAgente(
        `«${opciones.cmd}» habla la versión ${saludo.protocolVersion} de ACP y Dolphin la ${VERSION_DEL_PROTOCOLO}`,
        0,
        true,
      );
    }

    // Retomar la conversación anterior, cuando hay una y el agente puede: así la corrección sigue
    // donde quedó el intento, sin pagar de nuevo para que entienda el repo. Una sesión que el
    // agente ya no tiene no es un error: se abre una nueva y listo.
    let sessionId: string | undefined;
    if (saludo?.agentCapabilities?.loadSession === true && opciones.sesionPrevia) {
      // Al cargar, el agente reenvía TODO el historial como avisos. Eso es lo de antes, no lo de
      // ahora: si contara, la corrección arrancaría repitiendo lo que dijo la corrida vieja.
      cargando = true;
      const cargo = await conexion
        .pedir("session/load", { sessionId: opciones.sesionPrevia, cwd: resolve(opciones.cwd), mcpServers: [] })
        .then(() => true)
        .catch(() => false);
      cargando = false;
      if (cargo) sessionId = opciones.sesionPrevia;
    }

    if (!sessionId) {
      const sesion = (await conexion.pedir("session/new", { cwd: resolve(opciones.cwd), mcpServers: [] }).catch((error: unknown) => {
        // Lo único que el protocolo define para «falta loguearse» es este código en session/new.
        if ((error as { codigo?: unknown })?.codigo === -32000) {
          throw new FalloDelAgente(`«${opciones.cmd}» pide que te loguees primero: hacelo con su propio comando y volvé a sembrar`, 0, true);
        }
        throw error;
      })) as { sessionId?: unknown };
      if (typeof sesion?.sessionId !== "string") throw new Error("el agente no devolvió una sesión");
      sessionId = sesion.sessionId;
    }

    if (opciones.senal?.aborted) {
      conexion.avisar("session/cancel", { sessionId });
      throw new Error("cancelado: nadie esperaba la respuesta");
    }
    opciones.senal?.addEventListener("abort", () => conexion.avisar("session/cancel", { sessionId }), { once: true });

    const turno = (await conexion.pedir("session/prompt", { sessionId, prompt: [{ type: "text", text: pedido }] })) as { stopReason?: unknown };
    const porQueParo = (typeof turno?.stopReason === "string" ? turno.stopReason : "end_turn") as PorQueParo;

    return {
      porQueParo,
      sesion: sessionId,
      texto: dicho.join(""),
      ...(gastado !== undefined ? { gastado } : {}),
      ...(contexto ? { contexto } : {}),
      herramientas: [...herramientas.values()],
      plan,
      ruido: ruido.trim(),
    };
  } finally {
    clearTimeout(reloj);
    opciones.senal?.removeEventListener("abort", cancelar);
    conexion.terminar();
    matar();
    olvidarHijo(proceso.pid);
  }
}

/** Lo que el agente nos pide a nosotros. Lo que no está acá, no se lo concedemos. */
async function atenderAlAgente(metodo: string, params: unknown, worktree: string): Promise<unknown> {
  const p = (params ?? {}) as Record<string, unknown>;
  switch (metodo) {
    case "session/request_permission": {
      // El worktree es la caja y el portón mira el diff después: no hay a quién preguntarle a las
      // tres de la mañana, y negar por defecto sería no poder trabajar.
      const optionId = queOpcionPermite(p["options"]);
      return { outcome: optionId ? { outcome: "selected", optionId } : { outcome: "cancelled" } };
    }
    case "fs/read_text_file": {
      const ruta = adentroDe(worktree, p["path"]);
      const texto = await readFile(ruta, "utf8");
      const desde = typeof p["line"] === "number" ? Math.max(1, p["line"]) : 1;
      const cuantas = typeof p["limit"] === "number" ? p["limit"] : undefined;
      if (desde === 1 && cuantas === undefined) return { content: texto };
      const lineas = texto.split("\n").slice(desde - 1, cuantas === undefined ? undefined : desde - 1 + cuantas);
      return { content: lineas.join("\n") };
    }
    case "fs/write_text_file": {
      const ruta = adentroDe(worktree, p["path"]);
      await mkdir(dirname(ruta), { recursive: true });
      await writeFile(ruta, typeof p["content"] === "string" ? p["content"] : "", "utf8");
      return {};
    }
    default:
      throw new MetodoDesconocido(metodo);
  }
}

/** El texto de un bloque de contenido; nada si no es de texto. */
function textoDelBloque(bloque: unknown): string {
  const b = bloque as { type?: unknown; text?: unknown } | undefined;
  return b?.type === "text" && typeof b.text === "string" ? b.text : "";
}
