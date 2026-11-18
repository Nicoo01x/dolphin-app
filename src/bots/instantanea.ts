import { carpetaDeBots, carpetaDelBot } from "./almacen-rutas.js";
import { leerHistorial, listarBots, type Bot } from "./almacen.js";
import { leerPendiente } from "./pendiente.js";
import { puedeCorrer } from "./presupuesto.js";
import { estadoServicio, type EstadoServicio } from "./servicio-instalador.js";

/**
 * Lo que una pantalla necesita para dibujar la manada, en un solo JSON (`dolphin bots --json`): la
 * app de escritorio lo lee para su página de bots, y lo mismo sirve en un servidor por SSH. No
 * lleva lo secreto —el token de Telegram, el secreto de los eventos— ni el alma entera.
 */

/** El largo del último aviso: la página muestra una línea, no la charla. */
const LARGO_DEL_AVISO = 280;

export interface InstantaneaDeBot {
  readonly id: string;
  readonly nombre: string;
  readonly motor: Bot["motor"];
  readonly permiso: Bot["permiso"];
  /** Dónde vive el bot en el disco: la app lo copia de ahí cuando lo lleva a un servidor. */
  readonly dir: string;
  /** La carpeta donde trabaja. */
  readonly carpeta: string;
  /** El servicio está prendido y el presupuesto lo deja correr. */
  readonly corriendo: boolean;
  /** Por qué no corre aunque el servicio esté prendido: el presupuesto. */
  readonly pausa?: string;
  readonly proxima?: { readonly cuando: string; readonly tarea: string; readonly latido: boolean };
  readonly gasto: { readonly usd: number; readonly corridas: number };
  readonly tope?: { readonly usd?: number; readonly corridas?: number };
  readonly ultimo?: { readonly cuando: string; readonly texto: string };
  /** Lo que espera tu «dale». */
  readonly pendiente?: string;
  readonly telegram: boolean;
}

export interface InstantaneaDeManada {
  readonly servicio: EstadoServicio;
  readonly carpeta: string;
  readonly bots: readonly InstantaneaDeBot[];
  readonly rotos: readonly { readonly id: string; readonly error: string }[];
}

/** La rutina que sale primero; las de evento no tienen hora y no cuentan. */
export function proximaRutina(bot: Pick<Bot, "rutinas">): InstantaneaDeBot["proxima"] {
  const conHora = bot.rutinas.filter((r) => r.proxima && !Number.isNaN(Date.parse(r.proxima)));
  const primera = [...conHora].sort((a, b) => Date.parse(a.proxima) - Date.parse(b.proxima))[0];
  return primera ? { cuando: primera.proxima, tarea: primera.tarea, latido: primera.latido === true } : undefined;
}

function recortar(texto: string): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  return limpio.length > LARGO_DEL_AVISO ? `${limpio.slice(0, LARGO_DEL_AVISO - 1)}…` : limpio;
}

export async function instantaneaDeBot(bot: Bot, servicio: EstadoServicio, ahora = new Date()): Promise<InstantaneaDeBot> {
  const [presupuesto, historial, pendiente] = await Promise.all([puedeCorrer(bot, ahora), leerHistorial(bot.id, 40), leerPendiente(bot, ahora)]);
  const ultimo = historial.findLast((entrada) => entrada.quien === "bot" && entrada.texto.trim());
  const proxima = proximaRutina(bot);
  const tope = bot.presupuesto;
  return {
    id: bot.id,
    nombre: bot.nombre,
    motor: bot.motor,
    permiso: bot.permiso,
    dir: carpetaDelBot(bot.id),
    carpeta: bot.carpeta,
    corriendo: servicio.vivo && presupuesto.puede,
    ...(presupuesto.puede ? {} : { pausa: presupuesto.motivo ?? "pausado por el presupuesto" }),
    ...(proxima ? { proxima } : {}),
    gasto: { usd: presupuesto.gasto.usd, corridas: presupuesto.gasto.corridasPorMes },
    ...(tope?.usdPorMes !== undefined || tope?.corridasPorMes !== undefined
      ? { tope: { ...(tope.usdPorMes !== undefined ? { usd: tope.usdPorMes } : {}), ...(tope.corridasPorMes !== undefined ? { corridas: tope.corridasPorMes } : {}) } }
      : {}),
    ...(ultimo ? { ultimo: { cuando: ultimo.cuando, texto: recortar(ultimo.texto) } } : {}),
    ...(pendiente ? { pendiente: pendiente.quiere } : {}),
    telegram: Boolean(bot.telegram),
  };
}

export async function instantaneaDeManada(ahora = new Date()): Promise<InstantaneaDeManada> {
  const [servicio, listados] = await Promise.all([estadoServicio(), listarBots()]);
  const rotos = listados.filter((b): b is { id: string; error: string } => "error" in b);
  const sanos = listados.filter((b): b is Bot => !("error" in b));
  return { servicio, carpeta: carpetaDeBots(), bots: await Promise.all(sanos.map((bot) => instantaneaDeBot(bot, servicio, ahora))), rotos };
}
