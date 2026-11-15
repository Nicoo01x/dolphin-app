import { appendFile, open, readFile, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { carpetaDeDolphin, enFila, escribirDeUna } from "./escritura.js";

/**
 * Lo que se corrió de verdad sobre una rama: cada comando, con su salida y su código de salida.
 *
 * Un agente cuenta lo que hizo en su resultado, y eso es lo que se leía. Pero lo que cuenta es un
 * texto que escribió él: puede decir «corrí los tests y pasaron» sin haberlos corrido, o haberlos
 * corrido en otra carpeta. Esto es el otro lado: lo anota quien ejecuta, no quien narra, así que
 * alcanza para revisar una rama sin creerle a nadie.
 *
 * Es una bitácora por rama, una línea de JSON por comando, que se agrega al final y no se reescribe
 * (si una línea sale mal, se saltea esa y no se pierde el resto). Vive en `.dolphin/bitacora/` y se
 * ignora como todo lo de esa carpeta.
 */

export interface ComandoCorrido {
  /** Cuándo arrancó, en ISO. */
  readonly cuando: string;
  /** La fase del portón que lo pidió, cuando viene de una. */
  readonly fase?: string;
  /** El comando como se pidió. */
  readonly cmd: string;
  readonly args: readonly string[];
  /** Cómo se corrió de verdad, cuando no es lo mismo: envuelto en cmd.exe, o adentro de la caja. */
  readonly corrioComo?: string;
  /**
   * Dónde corrió (vacío: en la raíz del repo). Relativo al repo cuando está adentro; el worktree de
   * una rama vive en una carpeta temporal, así que de esos se guarda el nombre y no un camino de
   * «../» que no le dice nada a nadie.
   */
  readonly donde?: string;
  /** El código de salida; `null` si no terminó solo (lo cortó el tope). */
  readonly codigo: number | null;
  readonly ms: number;
  /** Cuánto esperó su turno en la cola de verificación antes de arrancar; `ms` ya no lo incluye. */
  readonly esperaMs?: number;
  /** Lo que escribió, recortado por el tope de abajo. */
  readonly salida: string;
  /** Si se le cortó la salida, cuántos caracteres tenía. */
  readonly salidaEntera?: number;
}

/** Más que esto por comando no sirve para revisar y hace la bitácora impresentable. */
export const TOPE_DE_SALIDA = 4_000;
/** Al pasarse, se queda con los últimos. Una rama no corre miles de comandos; si pasa, algo se trabó. */
const TOPE_DE_ENTRADAS = 2_000;
const DEJAR_AL_PODAR = 500;

const carpeta = (repo: string) => join(repo, ".dolphin", "bitacora");
/**
 * Una rama lleva barras y dos puntos: el archivo se nombra con lo que un nombre de archivo acepta.
 * El punto tampoco pasa, así que «../../fuera» no puede quedar con `..` adentro del nombre.
 */
export const archivoDeRama = (rama: string) => `${rama.replace(/[^\w-]/g, "_") || "sin-nombre"}.jsonl`;
const ruta = (repo: string, rama: string) => join(carpeta(repo), archivoDeRama(rama));

/** Qué anotar de un comando que ya terminó. `salida` y `donde` se acomodan acá. */
export interface Anotacion extends Omit<ComandoCorrido, "cuando" | "salida" | "salidaEntera" | "donde"> {
  readonly salida: string;
  /** La carpeta donde corrió, absoluta: se guarda relativa al repo. */
  readonly cwd?: string;
  readonly cuando?: Date;
}

/** Anota un comando en la bitácora de su rama. No tira: una bitácora que falla no puede cortar una siembra. */
export async function anotarComando(repo: string, rama: string, anotacion: Anotacion): Promise<void> {
  const destino = ruta(repo, rama);
  await enFila(destino, async () => {
    const entera = anotacion.salida.length;
    const { cwd, cuando, ...resto } = anotacion;
    const donde = cwd ? dondeCorrio(repo, cwd) : "";
    const entrada: ComandoCorrido = {
      cuando: (cuando ?? new Date()).toISOString(),
      ...resto,
      salida: entera > TOPE_DE_SALIDA ? `${anotacion.salida.slice(0, TOPE_DE_SALIDA)}…` : anotacion.salida,
      ...(entera > TOPE_DE_SALIDA ? { salidaEntera: entera } : {}),
      ...(donde && donde !== "" ? { donde } : {}),
    };
    await carpetaDeDolphin(repo, "bitacora");
    // Una línea por comando, al final: así dos pasadas del portón no se pisan y el lector tolera que
    // una quede a medias. Los saltos de la salida se escapan en el JSON, nunca parten la línea.
    // Y si la última quedó cortada —el proceso murió a mitad de escribirla— se cierra antes de
    // seguir: pegada a ella, la nueva se perdería también.
    await appendFile(destino, `${(await terminaCortada(destino)) ? "\n" : ""}${JSON.stringify(entrada)}\n`, "utf8");
    await podarSiHaceFalta(destino);
  }).catch(() => {});
}

/**
 * Cómo se nombra la carpeta donde corrió. Adentro del repo, relativa a él. Afuera —el worktree de
 * la rama, que vive en una carpeta temporal— su nombre: «dolphin-EF5u2I/equipo» se lee, y
 * «../../../../../dolphin-EF5u2I/equipo» no le dice nada a nadie.
 */
function dondeCorrio(repo: string, cwd: string): string {
  const relativa = relative(resolve(repo), resolve(cwd)).replace(/\\/g, "/");
  if (!relativa.startsWith("..")) return relativa;
  return resolve(cwd).replace(/\\/g, "/").split("/").slice(-2).join("/");
}

/** ¿El archivo termina en una línea sin cerrar? Solo se miran los últimos bytes. */
async function terminaCortada(destino: string): Promise<boolean> {
  const archivo = await open(destino, "r").catch(() => null);
  if (!archivo) return false;
  try {
    const { size } = await archivo.stat();
    if (size === 0) return false;
    const ultimo = Buffer.alloc(1);
    await archivo.read(ultimo, 0, 1, size - 1);
    return ultimo[0] !== 0x0a;
  } finally {
    await archivo.close().catch(() => {});
  }
}

async function podarSiHaceFalta(destino: string): Promise<void> {
  const tamano = await stat(destino)
    .then((s) => s.size)
    .catch(() => 0);
  // Mirar el tamaño primero evita leer el archivo entero en cada comando.
  if (tamano < TOPE_DE_ENTRADAS * 200) return;
  const lineas = (await readFile(destino, "utf8")).split("\n").filter((l) => l.trim() !== "");
  if (lineas.length <= TOPE_DE_ENTRADAS) return;
  await escribirDeUna(destino, `${lineas.slice(-DEJAR_AL_PODAR).join("\n")}\n`);
}

/** Lo que se corrió sobre esa rama, en orden. Una línea que no se entiende se saltea. */
export async function leerBitacora(repo: string, rama: string): Promise<ComandoCorrido[]> {
  const texto = await readFile(ruta(repo, rama), "utf8").catch(() => "");
  const entradas: ComandoCorrido[] = [];
  for (const linea of texto.split("\n")) {
    if (linea.trim() === "") continue;
    try {
      const dato = JSON.parse(linea) as Partial<ComandoCorrido>;
      if (typeof dato.cmd === "string" && typeof dato.cuando === "string") {
        entradas.push({ ...dato, cmd: dato.cmd, cuando: dato.cuando, args: dato.args ?? [], codigo: dato.codigo ?? null, ms: dato.ms ?? 0, salida: dato.salida ?? "" });
      }
    } catch {
      /* una línea a medio escribir no se lleva las demás */
    }
  }
  return entradas;
}

/** El comando como se lee: «npm run test -- --run». */
export function comoSeLee(c: Pick<ComandoCorrido, "cmd" | "args">): string {
  return [c.cmd, ...c.args].map((p) => (/\s/.test(p) ? `"${p}"` : p)).join(" ");
}

/** De un vistazo: cuántos corrieron, cuántos fallaron y cuánto tardó todo. */
export function resumenDeBitacora(entradas: readonly ComandoCorrido[]): { corridos: number; fallados: number; ms: number } {
  return {
    corridos: entradas.length,
    fallados: entradas.filter((e) => e.codigo !== 0).length,
    ms: entradas.reduce((n, e) => n + e.ms, 0),
  };
}
