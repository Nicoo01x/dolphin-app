import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { correrConPrompt, prepararComando } from "./agentes/ejecutar.js";
import { escribirDeUna } from "./nucleo/escritura.js";

/**
 * Atajos: un comando guardado con nombre (`juego`, `trabajo`) que corre SIEMPRE el mismo script, sin
 * pasar por ningún modelo. Se dispara desde Telegram (`/juego`), la terminal o la consola.
 *
 * Sale de las charlas de Nico (28/10): «cerrame todo menos Fortnite y Discord» 5 veces en 4 días,
 * casi siempre en una sesión nueva que volvía a descubrir qué cerrar, y «corre gamemode» 3 veces sobre
 * un script que ya existía. Lo determinista no tiene por qué gastar cupo ni salir distinto cada vez.
 *
 * Un atajo que escribió un bot nace sin revisar y no corre hasta que la persona lo aprueba: del otro
 * lado de Telegram hay un script que se ejecuta en tu máquina.
 */

export type Consola = "powershell" | "sh";

export interface Atajo {
  readonly nombre: string;
  readonly descripcion: string;
  readonly consola: Consola;
  readonly script: string;
  /** Lo revisó la persona: recién ahí corre. */
  readonly revisado: boolean;
  readonly creado: string;
  readonly ultima?: { readonly cuando: string; readonly codigo: number | null };
}

export function carpetaDeAtajos(): string {
  return process.env.DOLPHIN_ATAJOS_DIR || join(homedir(), ".dolphin", "atajos");
}

const NOMBRE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function nombreDeAtajo(texto: string): string {
  const nombre = texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/^\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (!NOMBRE.test(nombre)) throw new Error("el atajo necesita un nombre con letras o números");
  return nombre;
}

const archivo = (nombre: string) => join(carpetaDeAtajos(), `${nombreDeAtajo(nombre)}.json`);

function valido(dato: unknown): Atajo {
  const d = dato as Partial<Atajo> | null;
  if (!d || typeof d.nombre !== "string" || !NOMBRE.test(d.nombre) || typeof d.script !== "string" || (d.consola !== "powershell" && d.consola !== "sh"))
    throw new Error("atajo con un formato que no entiendo");
  return {
    nombre: d.nombre,
    descripcion: typeof d.descripcion === "string" ? d.descripcion : "",
    consola: d.consola,
    script: d.script,
    revisado: d.revisado === true,
    creado: typeof d.creado === "string" ? d.creado : new Date().toISOString(),
    ...(d.ultima ? { ultima: d.ultima } : {}),
  };
}

export async function leerAtajo(nombre: string): Promise<Atajo | undefined> {
  try {
    return valido(JSON.parse(await readFile(archivo(nombre), "utf8")));
  } catch {
    return undefined;
  }
}

export async function listarAtajos(): Promise<Atajo[]> {
  const nombres = (await readdir(carpetaDeAtajos()).catch(() => [] as string[])).filter((a) => a.endsWith(".json"));
  const atajos = await Promise.all(nombres.map((n) => leerAtajo(n.slice(0, -5))));
  return atajos.filter((a): a is Atajo => a !== undefined).sort((a, b) => a.nombre.localeCompare(b.nombre));
}

export interface NuevoAtajo {
  readonly nombre: string;
  readonly script: string;
  readonly descripcion?: string;
  readonly consola?: Consola;
  /** Lo escribió la persona (CLI, consola): ya está revisado. Lo propuso un bot: espera tu aprobación. */
  readonly revisado: boolean;
}

export async function guardarAtajo(nuevo: NuevoAtajo): Promise<Atajo> {
  const nombre = nombreDeAtajo(nuevo.nombre);
  if (!nuevo.script.trim()) throw new Error("el atajo necesita un script");
  const atajo: Atajo = {
    nombre,
    descripcion: (nuevo.descripcion ?? "").trim(),
    consola: nuevo.consola ?? (process.platform === "win32" ? "powershell" : "sh"),
    script: nuevo.script,
    // Cambiar el script de uno revisado vuelve a pedir revisión si no lo cambió la persona.
    revisado: nuevo.revisado,
    creado: (await leerAtajo(nombre))?.creado ?? new Date().toISOString(),
  };
  await mkdir(carpetaDeAtajos(), { recursive: true });
  await escribirDeUna(archivo(nombre), `${JSON.stringify(atajo, null, 2)}\n`);
  return atajo;
}

export async function aprobarAtajo(nombre: string): Promise<Atajo> {
  const atajo = await leerAtajo(nombre);
  if (!atajo) throw new Error(`no hay un atajo «${nombre}»`);
  const aprobado = { ...atajo, revisado: true };
  await escribirDeUna(archivo(nombre), `${JSON.stringify(aprobado, null, 2)}\n`);
  return aprobado;
}

export async function borrarAtajo(nombre: string): Promise<void> {
  await rm(archivo(nombre), { force: true });
}

export interface ResultadoDeAtajo {
  readonly codigo: number | null;
  /** El final de lo que escribió: lo que entra en un mensaje de Telegram. */
  readonly salida: string;
}

/** Cómo se corre un script. Los tests lo inyectan: acá no se ejecuta nada de la máquina. */
export type EjecutarScript = (atajo: Atajo) => Promise<ResultadoDeAtajo>;

export const ejecutarScript: EjecutarScript = async (atajo) => {
  // El script va por la entrada estándar, no como argumento: así no hay comillas que escapar.
  const [cmd, args] = atajo.consola === "powershell" ? ["powershell", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", "-"]] : ["sh", ["-s"]];
  const listo = prepararComando(cmd, args);
  if (!listo) throw new Error(`no encontré «${cmd}»`);
  const corrida = await correrConPrompt(listo.cmd, listo.args, atajo.script, homedir(), 120_000, undefined, listo.verbatim);
  const todo = `${corrida.salida}${corrida.error ? `\n${corrida.error}` : ""}`.trim();
  return { codigo: corrida.codigo, salida: todo.length > 3000 ? `…${todo.slice(-3000)}` : todo };
};

export async function correrAtajo(nombre: string, ejecutar: EjecutarScript = ejecutarScript): Promise<ResultadoDeAtajo> {
  const atajo = await leerAtajo(nombre);
  if (!atajo) throw new Error(`no hay un atajo «${nombre}»`);
  if (!atajo.revisado) throw new Error(`«${atajo.nombre}» todavía no lo revisaste: miralo con «dolphin atajo ver ${atajo.nombre}» y aprobalo con «dolphin atajo aprobar ${atajo.nombre}»`);
  const resultado = await ejecutar(atajo);
  await escribirDeUna(archivo(atajo.nombre), `${JSON.stringify({ ...atajo, ultima: { cuando: new Date().toISOString(), codigo: resultado.codigo } }, null, 2)}\n`);
  return resultado;
}

/**
 * ¿El mensaje de Telegram es un atajo? `/juego` (o `/juego@MiBot`, como lo manda Telegram en un
 * grupo). Devuelve el nombre si existe ese atajo; si no, el mensaje sigue su camino de siempre.
 */
export async function atajoDelMensaje(texto: string): Promise<string | undefined> {
  const pedido = /^\/([a-z0-9-]+)(?:@\w+)?$/i.exec(texto.trim());
  if (!pedido) return undefined;
  return (await leerAtajo(pedido[1]!.toLowerCase())) ? pedido[1]!.toLowerCase() : undefined;
}

/** La respuesta para el chat: corto, con lo último que escribió el script. */
export async function contestarAtajo(nombre: string, ejecutar: EjecutarScript = ejecutarScript): Promise<string> {
  try {
    const r = await correrAtajo(nombre, ejecutar);
    const salio = r.codigo === 0 ? `Listo: corrí «${nombre}».` : `«${nombre}» terminó con código ${r.codigo ?? "?"}.`;
    return r.salida ? `${salio}\n\n${r.salida.slice(-1500)}` : salio;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
