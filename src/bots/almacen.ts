import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { enFila, escribirDeUna } from "../nucleo/escritura.js";
import { proximaDiaria, validarZona } from "./horarios.js";
import { archivoDelBot, carpetaDeBots, carpetaDelBot, idValido, slug } from "./almacen-rutas.js";
import { validaPresupuesto } from "./presupuesto.js";
export { anotarHistorial, leerHistorial, tomarLockDeBots } from "./almacen-historial.js";
export type { EntradaDeHistorial, QuienDelHistorial } from "./almacen-historial.js";
export { carpetaDeBots } from "./almacen-rutas.js";
export { borrarHabilidad, guardarHabilidad, leerHabilidad, listarHabilidades } from "./almacen-habilidades.js";
export type { Habilidad } from "./almacen-habilidades.js";
export type MotorDeBot = "claude" | "codex" | "mentira";
export type PermisoDeBot = "preguntar" | "leer" | "carpeta" | "libre";
export interface TelegramDelBot {
  readonly token: string;
  readonly chat: string;
}
export interface RutinaGuardada {
  readonly id: string;
  readonly cuando:
    | { readonly tipo: "diario"; readonly hora: string; readonly tz?: string }
    | { readonly tipo: "cada"; readonly minutos: number }
    | { readonly tipo: "evento" };
  readonly tarea: string;
  readonly latido?: boolean;
  readonly ultima?: string;
  readonly proxima: string;
  /** Cuántas veces seguidas falló: decide cuándo se reintenta y que el aviso salga una vez por racha. */
  readonly fallos?: number;
  readonly ultimoError?: string;
  /** Ajustes propios del trabajo programado, para que no herede todo del bot. */
  readonly modelo?: string;
  readonly vueltas?: number;
  readonly habilidades?: readonly string[];
  /** Comando escrito por la persona que decide si el latido despierta al bot. */
  readonly chequeo?: string;
  /** Se muestra una sola vez al crear la rutina desde la API o el CLI. */
  readonly secreto?: string;
  /** Solo lo puede poner la API o el CLI con pase; un bloque del bot no puede hacerlo. */
  readonly confiar?: boolean;
}
export interface Bot {
  readonly id: string;
  readonly nombre: string;
  readonly motor: MotorDeBot;
  readonly modelo?: string;
  readonly carpeta: string;
  readonly permiso: PermisoDeBot;
  readonly respaldo?: MotorDeBot;
  readonly presupuesto?: { readonly usdPorMes?: number; readonly corridasPorMes?: number; readonly avisoUsd?: number; readonly avisoCorridasPorMes?: number };
  readonly entorno?: readonly string[];
  readonly herramientas?: readonly string[];
  readonly telegram?: TelegramDelBot;
  readonly rutinas: readonly RutinaGuardada[];
  readonly creado: string;
}
export interface BotRoto {
  readonly id: string;
  readonly error: string;
}
export type BotListado = Bot | BotRoto;
export interface CrearBot {
  readonly nombre: string;
  readonly motor?: MotorDeBot;
  readonly modelo?: string;
  readonly carpeta?: string;
  readonly permiso?: PermisoDeBot;
  readonly respaldo?: MotorDeBot;
  readonly presupuesto?: { readonly usdPorMes?: number; readonly corridasPorMes?: number; readonly avisoUsd?: number; readonly avisoCorridasPorMes?: number };
  readonly entorno?: readonly string[];
  readonly herramientas?: readonly string[];
  readonly telegram?: TelegramDelBot;
  readonly rutinas?: readonly (RutinaGuardada | Omit<RutinaGuardada, "proxima">)[];
  readonly alma?: string;
}
const carpetaDel = carpetaDelBot;
const leerTexto = async (ruta: string, vacio = ""): Promise<string> => readFile(ruta, "utf8").catch(() => vacio);
const archivo = archivoDelBot;
function validaBot(datos: unknown): Bot {
  if (!datos || typeof datos !== "object") throw new Error("bot.json no es un objeto");
  const d = datos as Record<string, unknown>;
  const motor = d.motor;
  const permiso = d.permiso;
  if (typeof d.id !== "string" || !idValido(d.id) || typeof d.nombre !== "string" || d.nombre.trim() === "") throw new Error("faltan id o nombre");
  if (motor !== "claude" && motor !== "codex" && motor !== "mentira") throw new Error("motor inválido");
  if (permiso !== "preguntar" && permiso !== "leer" && permiso !== "carpeta" && permiso !== "libre") throw new Error("permiso inválido");
  if (d.respaldo !== undefined && (d.respaldo !== "claude" && d.respaldo !== "codex")) throw new Error("motor de respaldo inválido");
  if (d.presupuesto !== undefined && !validaPresupuesto(d.presupuesto)) throw new Error("presupuesto inválido");
  if (d.entorno !== undefined && (!Array.isArray(d.entorno) || !d.entorno.every((x) => typeof x === "string" && /^[A-Z_][A-Z0-9_]*$/i.test(x)))) throw new Error("entorno inválido");
  if (typeof d.carpeta !== "string" || d.carpeta.trim() === "") throw new Error("carpeta inválida");
  if (typeof d.creado !== "string" || Number.isNaN(Date.parse(d.creado))) throw new Error("creado inválido");
  if (!Array.isArray(d.rutinas) || !d.rutinas.every(validaRutina)) throw new Error("rutinas inválidas");
  const telegram = d.telegram;
  if (
    telegram !== undefined &&
    (!telegram ||
      typeof telegram !== "object" ||
      typeof (telegram as Record<string, unknown>).token !== "string" ||
      typeof (telegram as Record<string, unknown>).chat !== "string")
  )
    throw new Error("telegram inválido");
  return {
    id: d.id,
    nombre: d.nombre,
    motor,
    ...(typeof d.modelo === "string" && d.modelo ? { modelo: d.modelo } : {}),
    carpeta: d.carpeta,
    permiso,
    ...(d.respaldo ? { respaldo: d.respaldo } : {}),
    ...(d.presupuesto && validaPresupuesto(d.presupuesto) ? { presupuesto: d.presupuesto as NonNullable<Bot["presupuesto"]> } : {}),
    ...(Array.isArray(d.entorno) ? { entorno: d.entorno as string[] } : {}),
    ...(Array.isArray(d.herramientas) && d.herramientas.every((x) => typeof x === "string") ? { herramientas: d.herramientas as string[] } : {}),
    ...(telegram ? { telegram: telegram as TelegramDelBot } : {}),
    rutinas: d.rutinas as RutinaGuardada[],
    creado: d.creado,
  };
}
function validaRutina(d: unknown): d is RutinaGuardada {
  if (!d || typeof d !== "object") return false;
  const r = d as Record<string, unknown>;
  const c = r.cuando as Record<string, unknown> | undefined;
  return (
    typeof r.id === "string" &&
    typeof r.tarea === "string" &&
    typeof r.proxima === "string" &&
    !!c &&
    ((c.tipo === "diario" &&
      typeof c.hora === "string" &&
      /^([01]\d|2[0-3]):[0-5]\d$/.test(c.hora) &&
      (c.tz === undefined || (typeof c.tz === "string" && validarZona(c.tz) === c.tz))) ||
      ((c.tipo === "cada" && Number.isInteger(c.minutos) && (c.minutos as number) > 0) || c.tipo === "evento"))
    && (r.modelo === undefined || typeof r.modelo === "string")
    && (r.vueltas === undefined || (Number.isInteger(r.vueltas) && Number(r.vueltas) > 0))
    && (r.habilidades === undefined || (Array.isArray(r.habilidades) && r.habilidades.every((x) => typeof x === "string")))
    && (r.chequeo === undefined || typeof r.chequeo === "string")
    && (c.tipo !== "evento" || (typeof r.secreto === "string" && r.secreto.length >= 32))
    && (r.confiar === undefined || typeof r.confiar === "boolean")
  );
}
export async function crearBot(opciones: CrearBot): Promise<Bot> {
  const nombre = opciones.nombre.trim();
  if (!nombre) throw new Error("el bot necesita un nombre");
  const id = slug(nombre);
  if (!idValido(id)) throw new Error("el nombre del bot necesita letras o números");
  const carpeta = carpetaDel(id);
  // Crear no pisa: con el mismo nombre se perdían el alma, la memoria y las habilidades del que ya estaba.
  if (
    await readFile(archivo(id, "bot.json"), "utf8").then(
      () => true,
      () => false,
    )
  )
    throw new Error(`ya tenés un bot que se llama «${nombre}»`);
  await mkdir(join(carpeta, "habilidades", ""), { recursive: true });
  const rutinas: RutinaGuardada[] = (opciones.rutinas ?? []).map((rutina) => {
    const conSecreto = rutina.cuando.tipo === "evento" && !rutina.secreto ? { ...rutina, secreto: randomBytes(32).toString("hex") } : rutina;
    return "proxima" in conSecreto ? conSecreto : { ...conSecreto, proxima: primeraProxima(conSecreto) };
  }) as RutinaGuardada[];
  const bot: Bot = {
    id,
    nombre,
    motor: opciones.motor ?? "claude",
    ...(opciones.modelo ? { modelo: opciones.modelo } : {}),
    carpeta: opciones.carpeta ?? process.cwd(),
    permiso: opciones.permiso ?? "preguntar",
    ...(opciones.respaldo ? { respaldo: opciones.respaldo } : {}),
    ...(opciones.presupuesto ? { presupuesto: opciones.presupuesto } : {}),
    ...(opciones.entorno ? { entorno: opciones.entorno } : {}),
    ...(opciones.herramientas ? { herramientas: opciones.herramientas } : {}),
    ...(opciones.telegram ? { telegram: opciones.telegram } : {}),
    rutinas,
    creado: new Date().toISOString(),
  };
  await guardarBotInterno(bot, true);
  await escribirDeUna(
    archivo(id, "alma.md"),
    opciones.alma ?? `Sos ${nombre}. Ayudás a quien te escribe con criterio, claridad y voseo rioplatense.\n`,
  );
  await escribirDeUna(archivo(id, "memoria.md"), "");
  await escribirDeUna(archivo(id, "historial.jsonl"), "");
  return bot;
}
function primeraProxima(rutina: Omit<RutinaGuardada, "proxima">): string {
  if (rutina.cuando.tipo === "evento") return "";
  const ahora = new Date();
  if (rutina.cuando.tipo === "cada") return new Date(ahora.getTime() + rutina.cuando.minutos * 60_000).toISOString();
  return proximaDiaria(rutina.cuando.hora, rutina.cuando.tz, ahora);
}
export async function listarBots(): Promise<BotListado[]> {
  let nombres: string[];
  try {
    nombres = (await readdir(carpetaDeBots(), { withFileTypes: true })).filter((e) => e.isDirectory() && idValido(e.name)).map((e) => e.name);
  } catch {
    return [];
  }
  return Promise.all(
    nombres.sort().map(async (id) => {
      try {
        return await leerBot(id);
      } catch (error) {
        return { id, error: error instanceof Error ? error.message : String(error) };
      }
    }),
  );
}

export async function leerBot(id: string): Promise<Bot> {
  const texto = await readFile(archivo(id, "bot.json"), "utf8");
  return validaBot(JSON.parse(texto) as unknown);
}
async function guardarBotInterno(bot: Bot, permitirCrear: boolean): Promise<void> {
  if (bot.id !== slug(bot.nombre) || !idValido(bot.id)) throw new Error("el id no coincide con el nombre del bot");
  validaBot(bot);
  const ruta = archivo(bot.id, "bot.json");
  await enFila(ruta, async () => {
    const anterior = await readFile(ruta, "utf8").then((x) => JSON.parse(x) as Partial<Bot>, () => undefined);
    if (!anterior && !permitirCrear) throw new Error("ese bot ya no existe");
    if (anterior?.permiso !== undefined && anterior.permiso !== bot.permiso) await rm(join(carpetaDel(bot.id), "pendiente.json"), { force: true });
    if (permitirCrear) await mkdir(carpetaDel(bot.id), { recursive: true });
    await escribirDeUna(ruta, `${JSON.stringify(bot, null, 2)}\n`);
  });
}
export async function guardarBot(bot: Bot): Promise<void> {
  await guardarBotInterno(bot, false);
}

export async function actualizarRutina(
  id: string,
  rutinaId: string,
  cambiar: (rutina: RutinaGuardada, bot: Bot) => RutinaGuardada | Promise<RutinaGuardada>,
): Promise<Bot | undefined> {
  const ruta = archivo(id, "bot.json");
  return enFila(ruta, async () => {
    const bot = await readFile(ruta, "utf8").then((x) => validaBot(JSON.parse(x) as unknown), () => undefined);
    if (!bot) return undefined;
    const rutina = bot.rutinas.find((x) => x.id === rutinaId);
    if (!rutina) return undefined;
    const cambiada = await cambiar(rutina, bot);
    const nuevas = bot.rutinas.map((x) => (x.id === rutinaId ? cambiada : x));
    const actualizado = { ...bot, rutinas: nuevas };
    await escribirDeUna(ruta, `${JSON.stringify(actualizado, null, 2)}\n`);
    return actualizado;
  });
}
export async function borrarBot(id: string): Promise<void> {
  await rm(carpetaDel(id), { recursive: true, force: true });
}
export const leerAlma = (id: string): Promise<string> => leerTexto(archivo(id, "alma.md"));
export async function guardarAlma(id: string, alma: string): Promise<void> {
  await escribirDeUna(archivo(id, "alma.md"), alma);
}

export async function leerMemoria(id: string): Promise<string> {
  return leerTexto(archivo(id, "memoria.md"));
}
export async function consolidarMemoria(id: string, texto: string): Promise<string> {
  const resumen = texto.trim();
  if (resumen.length > 2200) throw new Error("la memoria consolidada supera los 2.200 caracteres");
  const guardada = resumen ? `${resumen}\n` : "";
  await enFila(archivo(id, "memoria.md"), () => escribirDeUna(archivo(id, "memoria.md"), guardada));
  return guardada;
}
export async function recordarEnBot(id: string, linea: string, ahora = new Date()): Promise<string> {
  const recuerdo = linea.trim();
  if (!recuerdo) return leerMemoria(id);
  return enFila(archivo(id, "memoria.md"), async () => {
    const lineas = (await leerMemoria(id))
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (!lineas.some((x) => x === recuerdo || x.replace(/^\d{4}-\d{2}-\d{2}\s+/, "") === recuerdo))
      lineas.push(`${ahora.toISOString().slice(0, 10)} ${recuerdo}`);
    const ultimas = lineas.slice(-200);
    let texto = ultimas.length ? `${ultimas.join("\n")}\n` : "";
    // La memoria viaja en cada prompt: un tope fijo evita que semanas de charla se vuelvan costo.
    if (texto.length > 2200) {
      texto = "";
      for (const lineaGuardada of ultimas.reverse()) {
        const candidato = `${lineaGuardada}\n${texto}`;
        if (candidato.length > 2200) break;
        texto = candidato;
      }
    }
    await escribirDeUna(archivo(id, "memoria.md"), texto);
    return texto;
  });
}
export async function olvidarEnBot(id: string, linea: string): Promise<string> {
  const buscada = linea.trim();
  return enFila(archivo(id, "memoria.md"), async () => {
    const lineas = (await leerMemoria(id)).split(/\r?\n/).filter(Boolean);
    const quedan = lineas.filter((x) => x.trim() !== buscada && x.replace(/^\d{4}-\d{2}-\d{2}\s+/, "").trim() !== buscada);
    const texto = quedan.length ? `${quedan.join("\n")}\n` : "";
    await escribirDeUna(archivo(id, "memoria.md"), texto);
    return texto;
  });
}
