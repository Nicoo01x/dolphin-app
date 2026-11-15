import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

/**
 * Escribir los archivos de estado de `.dolphin/` sin que nadie lea uno a
 * medio escribir, y sin que dos cambios simultáneos se pisen.
 *
 * La consola relee el calendario, la bandeja, la cola y la última cosecha
 * cada pocos segundos mientras otro pedido —o el programador, o la cola—
 * los reescribe. Con writeFile a secas, una lectura en el medio veía el
 * archivo vacío: el turno «desaparecía» de la agenda, y un agendar justo en
 * ese momento guardaba la lista vacía más el nuevo, borrando los demás. Lo
 * encontró un test con la máquina cargada.
 *
 * Dos herramientas:
 * - escribirDeUna: a un temporal en la misma carpeta y se renombra, que
 *   reemplaza el archivo de una sola vez.
 * - enFila: lo que lee, cambia y vuelve a escribir un archivo va de a uno
 *   por archivo. Dentro de este proceso; entre dos procesos no hay fila.
 */

/**
 * La carpeta de Dolphin en el repo (o una de adentro), con el `.gitignore`
 * que la ignora entera desde el primer archivo: Dolphin no ensucia el repo
 * de nadie. Antes lo escribía solo la siembra; si el primero en escribir
 * era la consola, el calendario o la bandeja, la carpeta nacía sin él y su
 * contenido aparecía en el `git status` de la persona, y en su próximo
 * `git add -A`. Uno que ya existe no se pisa.
 */
export async function carpetaDeDolphin(repo: string, ...adentro: string[]): Promise<string> {
  const raiz = join(repo, ".dolphin");
  await mkdir(raiz, { recursive: true });
  await writeFile(join(raiz, ".gitignore"), "*\n", { encoding: "utf8", flag: "wx" }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error;
  });
  if (adentro.length === 0) return raiz;
  const carpeta = join(raiz, ...adentro);
  await mkdir(carpeta, { recursive: true });
  return carpeta;
}

/**
 * Lee un archivo de estado de `.dolphin/` (JSON). Si no está, `vacio`. Si
 * está pero no se entiende, se aparta como `<nombre>.roto-<fecha>` y se
 * arranca de `vacio`: leerlo como vacío y escribir encima borraba todo lo
 * que tenía —en la bandeja, además, volvía lo rechazado— sin que nadie se
 * enterara. `desde` arma el estado con lo leído (y valida la forma).
 */
export async function leerEstado<T>(ruta: string, vacio: T, desde: (datos: unknown) => T): Promise<T> {
  let texto: string;
  try {
    texto = await leerConReintentos(ruta);
  } catch {
    // No está: es el estado vacío. Otra cosa (sin permiso): tampoco se toca nada.
    return vacio;
  }
  if (texto.trim() === "") return vacio;
  try {
    return desde(JSON.parse(texto) as unknown);
  } catch {
    const aparte = `${ruta}.roto-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    await rename(ruta, aparte).catch(() => {});
    return vacio;
  }
}

/** Como el rename de abajo: en Windows, alguien leyendo o un antivirus da EPERM unos milisegundos. */
async function leerConReintentos(ruta: string): Promise<string> {
  const limite = Date.now() + 1_000;
  for (let espera = 10; ; espera = Math.min(espera * 2, 100)) {
    try {
      return await readFile(ruta, "utf8");
    } catch (error) {
      const codigo = (error as NodeJS.ErrnoException).code;
      if (Date.now() >= limite || (codigo !== "EPERM" && codigo !== "EBUSY" && codigo !== "EACCES")) throw error;
      await new Promise((listo) => setTimeout(listo, espera));
    }
  }
}

export async function escribirDeUna(ruta: string, texto: string): Promise<void> {
  // Termina en .tmp: las listas de cosechas, planes y asuntos filtran por .json y no lo ven.
  const temporal = `${ruta}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  await writeFile(temporal, texto, "utf8");
  try {
    await renombrar(temporal, ruta);
  } catch (error) {
    await rm(temporal, { force: true }).catch(() => {});
    throw error;
  }
}

/**
 * En Windows no se puede reemplazar un archivo mientras alguien lo tiene
 * abierto —la consola leyéndolo, un antivirus, un editor— y el rename falla
 * con EPERM. Esas lecturas duran milisegundos: se reintenta con espera
 * creciente, como graceful-fs. Lo midió un test que lee sin parar. Hasta 10 s:
 * con la máquina cargada (un juego abierto, el antivirus mirando cada archivo
 * nuevo) 3 s no alcanzaban y el estado no se guardaba (28/10).
 */
async function renombrar(desde: string, hasta: string): Promise<void> {
  const limite = Date.now() + 10_000;
  for (let espera = 10; ; espera = Math.min(espera * 2, 100)) {
    try {
      await rename(desde, hasta);
      return;
    } catch (error) {
      const codigo = (error as NodeJS.ErrnoException).code;
      if (Date.now() >= limite || (codigo !== "EPERM" && codigo !== "EBUSY" && codigo !== "EACCES")) throw error;
      await new Promise((listo) => setTimeout(listo, espera));
    }
  }
}

const filas = new Map<string, Promise<unknown>>();

/** En Windows las rutas no distinguen mayúsculas: la misma carpeta escrita de dos maneras («D:/x», «d:\X») es una sola. */
export const claveDeRuta = (ruta: string) => (process.platform === "win32" ? resolve(ruta).toLowerCase() : resolve(ruta));
const claveDe = claveDeRuta;

/** Corre `trabajo` cuando terminen los anteriores sobre el mismo archivo. Un error no traba la fila. */
export function enFila<T>(ruta: string, trabajo: () => Promise<T>): Promise<T> {
  const clave = claveDe(ruta);
  const turno = (filas.get(clave) ?? Promise.resolve()).catch(() => {}).then(trabajo);
  filas.set(clave, turno);
  // La fila no crece para siempre: cuando termina el último, se va.
  void turno
    .catch(() => {})
    .finally(() => {
      if (filas.get(clave) === turno) filas.delete(clave);
    });
  return turno;
}
