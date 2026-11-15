import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { hogarDeDolphin } from "./proyectos.js";

/**
 * La firma de lo que corre solo.
 *
 * La agenda y la cola viven en `.dolphin/` del repo, y un repo puede traer
 * su `.dolphin/` versionado: alcanza un `git add -f`. Sin esto, clonar un
 * repo ajeno con un turno vencido en su calendario era correr SU tarea a los
 * 30 segundos, sin que nadie tocara nada; y una cola con tareas «esperando»
 * se corría entera la próxima vez que encolabas algo vos.
 *
 * Por eso Dolphin corre solo lo que firmó una consola de ESTA máquina. La
 * llave vive en el hogar (`~/.dolphin`, o `DOLPHIN_HOME`), fuera de todo
 * repo, y nace sola la primera vez. Un turno que llegó escrito en el repo —o
 * que agendó otra máquina— se marca y no corre.
 */

export const NO_FIRMADO =
  "Esto no lo agendó una consola de esta máquina: venía escrito en el repo. Dolphin no corre lo que no firmó; si es tuyo, volvé a cargarlo desde la consola.";

const ARCHIVO = "llave-de-firma";
const llaves = new Map<string, Promise<Buffer>>();

/** La llave de la máquina; la crea si no está. Dos procesos que la crean a la vez terminan con la misma. */
export function llaveDeFirma(hogar = hogarDeDolphin()): Promise<Buffer> {
  const clave = resolve(hogar);
  let llave = llaves.get(clave);
  if (!llave) {
    llave = cargarOCrear(clave);
    // Si falló (un hogar sin permiso de escritura), la próxima vez se prueba de nuevo.
    llave.catch(() => llaves.delete(clave));
    llaves.set(clave, llave);
  }
  return llave;
}

async function cargarOCrear(hogar: string): Promise<Buffer> {
  const ruta = join(hogar, ARCHIVO);
  const leer = async () => Buffer.from((await readFile(ruta, "utf8")).trim(), "hex");
  try {
    const llave = await leer();
    if (llave.length >= 32) return llave;
  } catch {
    // no está: se crea abajo
  }
  await mkdir(hogar, { recursive: true });
  try {
    // `wx`: si otro proceso la creó en el medio, gana la suya y se lee esa.
    await writeFile(ruta, `${randomBytes(32).toString("hex")}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  return leer();
}

/** Lo firmado es lo que decide qué corre y dónde; nunca el estado, que cambia en cada corrida. */
function canonico(contenido: Readonly<Record<string, unknown>>): string {
  return JSON.stringify(Object.keys(contenido).sort().map((k) => [k, contenido[k] ?? null]));
}

export function firmar(llave: Buffer, contenido: Readonly<Record<string, unknown>>): string {
  return createHmac("sha256", llave).update(canonico(contenido)).digest("hex");
}

export function firmaValida(llave: Buffer, contenido: Readonly<Record<string, unknown>>, firma: unknown): boolean {
  if (typeof firma !== "string" || !/^[0-9a-f]{64}$/.test(firma)) return false;
  return timingSafeEqual(Buffer.from(firmar(llave, contenido), "hex"), Buffer.from(firma, "hex"));
}
