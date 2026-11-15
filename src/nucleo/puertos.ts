import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";

/**
 * Un puerto y una base por universo.
 *
 * Es la deuda más cara de todas las que tenía Dolphin: dos universos
 * levantando `npm run dev` contra el mismo puerto y la misma base se
 * pisan, uno de los dos falla, y el portón lo mata culpando a su código.
 * Un veredicto equivocado es peor que no tener veredicto — hace desconfiar
 * de la herramienta entera.
 *
 * Los puertos se reservan de verdad (el sistema operativo los entrega), no
 * se adivinan sumando uno: en una máquina ocupada, `3000 + i` choca.
 */

/** Un puerto libre de verdad, el que el sistema diga que está libre. */
export function puertoLibre(): Promise<number> {
  return new Promise((resolver, rechazar) => {
    const servidor = createServer();
    servidor.unref();
    servidor.on("error", rechazar);
    servidor.listen(0, "127.0.0.1", () => {
      const direccion = servidor.address();
      if (direccion === null || typeof direccion === "string") {
        servidor.close(() => rechazar(new Error("no pude reservar un puerto")));
        return;
      }
      const puerto = direccion.port;
      servidor.close(() => resolver(puerto));
    });
  });
}

/** Los que ya tiene un universo vivo de este proceso, de cualquier siembra. */
const entregados = new Set<number>();
let colaDePuertos = Promise.resolve();

function puertoDisponible(puerto: number): Promise<boolean> {
  return new Promise((resolver) => {
    const servidor = createServer();
    servidor.once("error", () => resolver(false));
    servidor.listen(puerto, "127.0.0.1", () => servidor.close(() => resolver(true)));
  });
}

/**
 * El puerto de un universo: libre según el sistema y que no tenga otro
 * universo vivo. El sistema no sabe que lo reservamos —se suelta apenas se
 * pregunta, y la app lo abre recién cuando arranca—, y vuelve a dar el que
 * acaba de liberar: dos universos, o dos siembras de la cola, recibían el
 * mismo y el segundo `npm run dev` caía con EADDRINUSE. Se devuelve con
 * soltarPuerto al cerrar el universo.
 */
export async function puertoParaUniverso(desde = 0): Promise<number> {
  let liberar!: () => void;
  const anterior = colaDePuertos;
  colaDePuertos = new Promise<void>((resolver) => (liberar = resolver));
  await anterior;
  try {
    if (desde < 1) {
      let puerto = await puertoLibre();
      while (entregados.has(puerto)) puerto = await puertoLibre();
      entregados.add(puerto);
      return puerto;
    }

    for (let puerto = desde; puerto <= 65_535; puerto += 1) {
      if (!entregados.has(puerto) && (await puertoDisponible(puerto))) {
        entregados.add(puerto);
        return puerto;
      }
    }
    throw new Error(`no hay un puerto libre desde ${desde}`);
  } finally {
    liberar();
  }
}

export function soltarPuerto(puerto: number | undefined): void {
  if (puerto !== undefined) entregados.delete(puerto);
}

/**
 * Las variables de la base que el repo tiene en su `.env` (o `.env.local`):
 * casi siempre `DATABASE_URL` vive ahí y no en el entorno de quien corre
 * Dolphin, y sin leerla todas las ramas usaban la base de la persona. Lo
 * del entorno manda, como en dotenv.
 */
export async function baseDelRepo(repo: string, entorno: NodeJS.ProcessEnv = process.env): Promise<NodeJS.ProcessEnv> {
  const deArchivos: Record<string, string> = {};
  for (const nombre of [".env", ".env.local"]) {
    const texto = await readFile(join(repo, nombre), "utf8").catch(() => "");
    for (const linea of texto.split(/\r?\n/)) {
      const par = /^\s*(?:export\s+)?(DATABASE_URL|REDIS_URL)\s*=\s*(.*?)\s*$/.exec(linea);
      if (par) deArchivos[par[1]!] = par[2]!.replace(/^(["'])(.*)\1$/, "$2");
    }
  }
  return { ...deArchivos, ...entorno };
}

/**
 * El entorno que ve un universo.
 *
 * `PORT` porque es lo que casi todo framework lee sin que haya que
 * configurar nada, y la base con un sufijo pegado al nombre para que cada
 * universo migre y ensucie la suya. El sufijo es el id, salvo que se pase
 * otro: en el equipo cada compañero es el `u1` de su propia siembra, y con
 * el id solo compartían todos la misma base (ver taller.ts).
 */
export function entornoDelUniverso(
  id: string,
  puerto: number,
  base: NodeJS.ProcessEnv = process.env,
  variable = "PORT",
  sufijo = id,
): Record<string, string> {
  const entorno: Record<string, string> = {
    PORT: String(puerto),
    DOLPHIN_UNIVERSO: id,
    DOLPHIN_PUERTO: String(puerto),
  };
  entorno[variable] = String(puerto);

  const url = base["DATABASE_URL"];
  if (url) entorno["DATABASE_URL"] = conSufijo(url, sufijo);

  const redis = base["REDIS_URL"];
  if (redis) entorno["REDIS_URL"] = redis; // Redis separa por número de base, no por nombre

  return entorno;
}

/**
 * `postgres://u:p@host:5432/app` → `postgres://u:p@host:5432/app_u3`
 * Se respeta lo que venga después (query string de sslmode, pool, etc.).
 */
export function conSufijo(url: string, id: string): string {
  // SQLite (Prisma y compañía): `file:./dev.db` → `file:./dev_u3.db`, relativo como venía.
  // Pasarlo por URL lo volvía `file:///dev.db_u3`: la raíz del disco.
  const archivo = /^file:([^?]*)(\?.*)?$/.exec(url);
  if (archivo) {
    const [, ruta = "", resto = ""] = archivo;
    const conId = ruta.replace(/(\.[^./\\]+)?$/, (ext) => `_${id}${ext}`);
    return `file:${conId}${resto}`;
  }
  try {
    const parsed = new URL(url);
    const nombre = parsed.pathname.replace(/^\//, "");
    if (nombre === "") return url;
    parsed.pathname = `/${nombre}_${id}`;
    return parsed.toString();
  } catch {
    // No es una URL válida: se deja como está antes que romperla.
    return url;
  }
}
