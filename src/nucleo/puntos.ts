import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { git } from "./git.js";
import { agregadosDe, todoMenos } from "./cambios.js";


/**
 * Los puntos de control del bucle de corrección: antes de cada vuelta se
 * saca una foto del universo, y si la corrección empeora las cosas —arregla
 * la fase pero rompe una que ya estaba en verde— se vuelve a la foto en vez
 * de seguir corrigiendo encima del lodo.
 *
 * La foto es un árbol de git armado con un índice aparte, no un commit en la
 * rama: un commit movería HEAD, y todo lo que mide contra HEAD —la forma de
 * la rama, los tests intactos, la política, el diff que lee la revisión—
 * pasaría a medir solo la última vuelta. Así la rama y su índice no se
 * enteran de que hubo una foto.
 */

/**
 * Saca la foto: todo lo que hay en el universo, menos lo que .gitignore
 * ignora y lo que Dolphin le agregó (ver cambios.ts): con el `.env` copiado
 * o el enlace a node_modules adentro, volver a la foto los dejaba en el
 * índice y el commit de entrega se los llevaba. Devuelve el árbol.
 */
export async function guardarPunto(ruta: string): Promise<string> {
  const indice = join(tmpdir(), `dolphin-punto-${process.pid}-${randomBytes(4).toString("hex")}`);
  const env = { ...process.env, GIT_INDEX_FILE: indice };
  try {
    await git(["read-tree", "HEAD"], ruta, { env });
    await git(["add", "-A", ...todoMenos(await agregadosDe(ruta))], ruta, { env });
    return (await git(["write-tree"], ruta, { env })).trim();
  } finally {
    await rm(indice, { force: true });
  }
}

/**
 * Vuelve el universo a la foto: los archivos como estaban, los que se
 * borraron de vuelta, y afuera lo que se creó después. Lo ignorado
 * (node_modules, builds) no se toca: no estaba en la foto ni se borra; y lo
 * que Dolphin agregó tampoco, aunque el repo no lo ignore (un `.env`, el
 * enlace de node_modules, que en POSIX es un symlink que `node_modules/`
 * no cubre). Con core.autocrlf, los finales de línea vuelven como los
 * escribe git en cualquier checkout: el contenido para git —y el diff— es el mismo.
 */
export async function volverAlPunto(ruta: string, arbol: string): Promise<void> {
  await git(["read-tree", "-u", "--reset", arbol], ruta);
  const respetar = (await agregadosDe(ruta)).flatMap((r) => ["-e", `/${r}`]);
  await git(["clean", "-fd", ...respetar], ruta);
}
