import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { claveDeRuta, escribirDeUna } from "../nucleo/escritura.js";
import { carpetaDelBot, idEnOrden } from "./almacen-rutas.js";
import type { Bot } from "./almacen.js";

export type EstadoDeSalida = "pendiente" | "enviado" | "fallido";
export interface SalidaGuardada {
  readonly id: string;
  readonly texto: string;
  readonly tema?: number;
  readonly creado: string;
  readonly vence: string;
  readonly estado: EstadoDeSalida;
  readonly intentos: number;
  readonly proximo?: string;
  readonly incierto?: boolean;
  readonly teclado?: unknown;
}

export type EntregaDeSalida = (salida: SalidaGuardada) => Promise<boolean>;
const REINTENTO_MS = 30_000;
const VIDA_MS = 60 * 60_000;
const GUARDADAS = 50;
const bloqueadas = new Set<string>();
const otraVez = new Set<string>();

export const separarSalida = (texto: string, largo = 3500): string[] => {
  const letras = Array.from(texto);
  const partes: string[] = [];
  for (let i = 0; i < letras.length; i += largo) partes.push(letras.slice(i, i + largo).join(""));
  return partes.length ? partes : [""];
};

export function carpetaDeSalida(carpeta: string): string {
  return join(carpeta, "salida");
}

export async function encolarSalidaEn(carpeta: string, texto: string, tema: number | undefined, ahora = new Date(), teclado?: unknown): Promise<void> {
  await encolarSalidaEnRuta(carpetaDeSalida(carpeta), texto, tema, ahora, teclado);
}

export async function encolarSalidaEnRuta(salida: string, texto: string, tema: number | undefined, ahora = new Date(), teclado?: unknown): Promise<void> {
  await mkdir(salida, { recursive: true });
  const vence = new Date(ahora.getTime() + VIDA_MS).toISOString();
  for (const parte of separarSalida(texto)) {
    const dato: SalidaGuardada = {
      id: idEnOrden(ahora),
      texto: parte,
      ...(tema === undefined ? {} : { tema }),
      ...(teclado === undefined ? {} : { teclado }),
      creado: ahora.toISOString(),
      vence,
      estado: "pendiente",
      intentos: 0,
    };
    await escribirDeUna(join(salida, `${dato.id}.json`), `${JSON.stringify(dato, null, 2)}\n`);
  }
}

export const encolarSalida = (bot: Bot, texto: string, tema?: number, ahora = new Date(), teclado?: unknown): Promise<void> =>
  encolarSalidaEn(carpetaDelBot(bot.id), texto, tema, ahora, teclado);

export async function leerSalidas(carpeta: string): Promise<SalidaGuardada[]> {
  return leerSalidasEnRuta(carpetaDeSalida(carpeta));
}

function comoSalida(dato: Partial<SalidaGuardada>): SalidaGuardada | undefined {
  if (typeof dato.id !== "string" || typeof dato.texto !== "string" || typeof dato.creado !== "string" || typeof dato.vence !== "string" || !["pendiente", "enviado", "fallido"].includes(String(dato.estado))) return undefined;
  return {
    id: dato.id,
    texto: dato.texto,
    ...(typeof dato.tema === "number" ? { tema: dato.tema } : {}),
    creado: dato.creado,
    vence: dato.vence,
    estado: dato.estado as EstadoDeSalida,
    intentos: typeof dato.intentos === "number" && Number.isInteger(dato.intentos) ? dato.intentos : 0,
    ...(typeof dato.proximo === "string" ? { proximo: dato.proximo } : {}),
    ...(dato.incierto === true ? { incierto: true } : {}),
    ...(dato.teclado !== undefined ? { teclado: dato.teclado } : {}),
  };
}

const leerUna = async (ruta: string): Promise<SalidaGuardada | undefined> => {
  try {
    return comoSalida(JSON.parse(await readFile(ruta, "utf8")) as Partial<SalidaGuardada>);
  } catch {
    return undefined;
  }
};

export async function leerSalidasEnRuta(salida: string): Promise<SalidaGuardada[]> {
  const nombres = (await readdir(salida).catch(() => [] as string[])).filter((x) => x.endsWith(".json")).sort();
  const salidas: SalidaGuardada[] = [];
  // Una salida rota no debe frenar las demás.
  for (const nombre of nombres) {
    const dato = await leerUna(join(salida, nombre));
    if (dato) salidas.push(dato);
  }
  return salidas;
}

async function guardarEnRuta(salida: string, dato: SalidaGuardada): Promise<void> {
  await escribirDeUna(join(salida, `${dato.id}.json`), `${JSON.stringify(dato, null, 2)}\n`);
}

const CONEXION = new Set(["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ENETUNREACH", "EHOSTUNREACH"]);

/**
 * Si el error dice que ni siquiera hubo conexión, el pedido no salió y se puede reintentar sin miedo a
 * duplicar. `fetch` lo envuelve en `cause` (y en `errors` cuando probó varias direcciones).
 */
export function noSalio(error: unknown, profundidad = 0): boolean {
  if (!error || typeof error !== "object" || profundidad > 4) return false;
  const { code, syscall, errors, cause } = error as { code?: unknown; syscall?: unknown; errors?: unknown; cause?: unknown };
  if (Array.isArray(errors) && errors.length > 0 && errors.every((e) => noSalio(e, profundidad + 1))) return true;
  if (typeof code === "string" && (CONEXION.has(code) || code.startsWith("UND_ERR_CONNECT") || (code === "ETIMEDOUT" && syscall === "connect"))) return true;
  return noSalio(cause, profundidad + 1);
}

const vivo = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
};
const RECLAMO = /^(.+\.json)\.(\d+)\.[a-z0-9]+\.enviando$/;

/** Lo que reclamó un proceso que murió vuelve a la cola como quedó: incierto si llegó a salir a la red. */
async function recuperarReclamos(salida: string): Promise<void> {
  for (const nombre of await readdir(salida).catch(() => [] as string[])) {
    const partes = RECLAMO.exec(nombre);
    if (!partes || vivo(Number(partes[2]))) continue;
    const json = join(salida, partes[1]!);
    // Si el json ya volvió, el reclamo es un resto: vale lo que se guardó después.
    if (await readFile(json).then(() => true, () => false)) await rm(join(salida, nombre), { force: true });
    else await rename(join(salida, nombre), json).catch(() => {});
  }
}

/** El rename es el candado entre procesos (dos terminales con el mismo repo): solo uno se queda con cada mensaje. */
async function reclamar(salida: string, id: string): Promise<{ ruta: string; dato: SalidaGuardada } | undefined> {
  const json = join(salida, `${id}.json`);
  const ruta = `${json}.${process.pid}.${randomUUID().slice(0, 8)}.enviando`;
  try {
    await rename(json, ruta);
  } catch {
    return undefined;
  }
  const dato = await leerUna(ruta);
  if (dato) return { ruta, dato };
  await rename(ruta, json).catch(() => {});
  return undefined;
}

const espera = (x: SalidaGuardada, ahora: Date): boolean => x.estado !== "enviado" && !x.incierto && !(x.proximo && Date.parse(x.proximo) > ahora.getTime());

async function intentar(salida: string, leida: SalidaGuardada, entregar: EntregaDeSalida, ahora: Date): Promise<void> {
  if (!espera(leida, ahora)) return;
  if (Date.parse(leida.vence) <= ahora.getTime()) {
    if (leida.estado === "fallido" && !leida.proximo) return;
    const { proximo: _proximo, ...vencida } = leida;
    return guardarEnRuta(salida, { ...vencida, estado: "fallido" });
  }
  const reclamo = await reclamar(salida, leida.id);
  if (!reclamo) return;
  const original = reclamo.dato;
  // Lo leído antes del rename pudo haber cambiado: otro proceso lo mandó mientras tanto.
  if (!espera(original, ahora) || Date.parse(original.vence) <= ahora.getTime()) {
    await rename(reclamo.ruta, join(salida, `${original.id}.json`)).catch(() => {});
    return;
  }
  // Se marca incierto antes de salir a la red: si el proceso muere después de enviar,
  // al arrancar no repetimos un mensaje cuyo resultado no pudimos confirmar.
  const intento: SalidaGuardada = { ...original, estado: "fallido", intentos: original.intentos + 1, incierto: true };
  await escribirDeUna(reclamo.ruta, `${JSON.stringify(intento, null, 2)}\n`);
  const { incierto: _incierto, ...sinIncierto } = intento;
  const reintento = new Date(ahora.getTime() + REINTENTO_MS).toISOString();
  let resultado: SalidaGuardada;
  try {
    const { proximo: _proximo, ...limpio } = sinIncierto;
    resultado = (await entregar(intento)) ? { ...limpio, estado: "enviado" } : { ...sinIncierto, proximo: reintento };
  } catch (error) {
    // Sin conexión, el pedido no salió y se reintenta; un corte a mitad de respuesta pudo haber llegado: queda incierto.
    resultado = noSalio(error) ? { ...sinIncierto, proximo: reintento } : intento;
  }
  await guardarEnRuta(salida, resultado);
  await rm(reclamo.ruta, { force: true });
}

/** La carpeta no crece sin límite: de lo ya cerrado (enviado, incierto o vencido) quedan los últimos. */
async function podar(salida: string, ahora: Date): Promise<void> {
  const cerradas = (await leerSalidasEnRuta(salida)).filter((x) => x.estado === "enviado" || x.incierto || Date.parse(x.vence) <= ahora.getTime());
  for (const vieja of cerradas.slice(0, -GUARDADAS)) await rm(join(salida, `${vieja.id}.json`), { force: true });
}

export async function drenarSalidas(carpeta: string, entregar: EntregaDeSalida, ahora = new Date()): Promise<void> {
  return drenarSalidasEnRuta(carpetaDeSalida(carpeta), entregar, ahora);
}

export async function drenarSalidasEnRuta(salida: string, entregar: EntregaDeSalida, ahora = new Date()): Promise<void> {
  // El candado es por CARPETA, no por el texto de la ruta: «…/salida», «…/salida/» y «…/salida/.»
  // son la misma cola, y con la clave cruda cada una abría su propio drenado. Entre dos de ellos el
  // reclamo por rename no alcanza —comparten el bucle de eventos y se cruzan entre los await—, y un
  // mensaje salía dos veces (lo reproduce el test de los cinco drenados). Entre PROCESOS distintos
  // el rename sigue siendo el candado, que para eso es del sistema de archivos.
  const clave = claveDeRuta(salida);
  if (bloqueadas.has(clave)) {
    // Lo recién encolado no espera al próximo drenado: se le pide otra pasada al que ya corre.
    otraVez.add(clave);
    return;
  }
  bloqueadas.add(clave);
  try {
    await recuperarReclamos(salida);
    do {
      otraVez.delete(clave);
      for (const leida of await leerSalidasEnRuta(salida)) await intentar(salida, leida, entregar, ahora);
    } while (otraVez.has(clave));
    await podar(salida, ahora);
  } finally {
    bloqueadas.delete(clave);
  }
}

export const drenarSalidasDelBot = (bot: Bot, entregar: EntregaDeSalida, ahora = new Date()): Promise<void> =>
  drenarSalidas(carpetaDelBot(bot.id), entregar, ahora);