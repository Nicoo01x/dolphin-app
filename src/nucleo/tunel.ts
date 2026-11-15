import { spawn, type ChildProcess } from "node:child_process";
import { prepararComando } from "../agentes/ejecutar.js";

/**
 * La consola desde el teléfono, por un túnel de Cloudflare.
 *
 * `cloudflared tunnel --url http://127.0.0.1:<puerto>` abre una dirección pública con HTTPS y la
 * imprime. No pide cuenta ni configuración —es el «quick tunnel»— y muere con el proceso, que es
 * exactamente lo que queremos: una puerta que se abre para mirar el tablero desde el sillón y se
 * cierra sola al apagar la consola.
 *
 * **El túnel NO es la seguridad.** La dirección es pública y adivinable por cualquiera que mire
 * los certificados que Cloudflare publica; lo que protege la consola es el pase (ver puerta.ts).
 * Acá solo se abre el caño y se lee qué nombre le tocó.
 *
 * Por qué cloudflared y no otro: no pide cuenta, da HTTPS (la cookie del pase es `Secure`) y es un
 * binario suelto que se instala con winget, brew o apt. Si no está, se dice cómo instalarlo en vez
 * de levantar la consola al mundo por otro camino.
 */

export interface Tunel {
  /** La dirección pública, con https y sin barra final. */
  readonly url: string;
  /** Solo el host: es lo que la puerta compara contra el Host del pedido. */
  readonly host: string;
  detener(): Promise<void>;
}

/**
 * Qué dirección va a tener el túnel.
 *
 * `al-azar` es el quick tunnel de siempre: no pide cuenta ni configuración, pero la dirección la
 * inventa Cloudflare y cambia en cada arranque. Sirve para mirar el tablero un rato desde el
 * sillón, no para tener una dirección que uno se pueda guardar.
 *
 * `con-nombre` es un túnel registrado en una cuenta de Cloudflare, atado a un host propio que ya
 * existe en el DNS. La dirección es siempre la misma, así que se puede dejar en el teléfono —y es
 * lo que hace falta para poner adelante un login de verdad, porque una política se escribe sobre
 * un host que no cambia.
 */
export type DestinoDelTunel =
  | { readonly tipo: "al-azar" }
  | { readonly tipo: "con-nombre"; readonly nombre: string; readonly host: string };

export interface DepsDelTunel {
  /** Se inyecta en los tests; por defecto, cloudflared de verdad. */
  readonly lanzar?: (puerto: number, destino: DestinoDelTunel) => ChildProcess;
  /** Cuánto se espera a que imprima la dirección. */
  readonly esperaMs?: number;
  /** Por defecto, el de siempre. */
  readonly destino?: DestinoDelTunel;
}

export const TUNEL_A_MEDIAS =
  "para un túnel con nombre hacen falta las dos cosas: el nombre del túnel y el host que apunta a él. Con una sola, cloudflared abriría un túnel que nadie puede alcanzar";

/**
 * El destino que piden estas opciones.
 *
 * Con una sola de las dos NO cae al quick tunnel en silencio: eso daría una dirección al azar
 * cuando la persona pidió la suya, y lo descubriría leyendo el link.
 */
export function destinoDelTunel(opciones: {
  readonly nombre?: string | undefined;
  readonly host?: string | undefined;
}): DestinoDelTunel {
  const nombre = opciones.nombre?.trim();
  const host = opciones.host?.trim().toLowerCase();
  if (!nombre && !host) return { tipo: "al-azar" };
  if (!nombre || !host) throw new Error(TUNEL_A_MEDIAS);
  return { tipo: "con-nombre", nombre, host };
}

/** Con qué argumentos se lanza cloudflared para ese destino. */
export function argumentosDeCloudflared(puerto: number, destino: DestinoDelTunel): string[] {
  const base = ["tunnel", "--no-autoupdate"];
  const url = `http://127.0.0.1:${puerto}`;
  // `run <nombre>` usa las credenciales que dejó `cloudflared tunnel login`; `--url` le dice a
  // dónde mandar lo que llega, igual que en el quick tunnel.
  return destino.tipo === "con-nombre"
    ? [...base, "run", "--url", url, destino.nombre]
    : [...base, "--url", url];
}

/**
 * Cuándo el túnel está listo, y con qué dirección.
 *
 * En el quick tunnel la dirección se lee del log porque es la única forma de saberla. En uno con
 * nombre ya la sabemos —es el host configurado— pero igual hay que esperar: cloudflared tarda en
 * registrar la conexión, y dar el link antes es dar un link que todavía no contesta.
 */
export function direccionDelTunel(salida: string, destino: DestinoDelTunel): string | undefined {
  if (destino.tipo === "al-azar") return urlDeLaSalida(salida);
  return CONECTADO.test(salida) ? `https://${destino.host}` : undefined;
}

/** Las dos formas en que cloudflared avisa que la conexión quedó registrada. */
const CONECTADO = /Registered tunnel connection|Connection [0-9a-f-]+ registered/i;

export const SIN_CLOUDFLARED =
  "para abrir la consola al teléfono hace falta cloudflared: instalalo con «winget install Cloudflare.cloudflared» (Windows), «brew install cloudflared» (Mac) o desde developers.cloudflare.com/cloudflared, y volvé a correr el comando";

/** La dirección que cloudflared imprime, en cualquiera de sus formatos de salida. */
export function urlDeLaSalida(texto: string): string | undefined {
  return /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i.exec(texto)?.[0];
}

function lanzarCloudflared(puerto: number, destino: DestinoDelTunel): ChildProcess {
  const listo = prepararComando("cloudflared", argumentosDeCloudflared(puerto, destino));
  if (!listo) throw new Error(SIN_CLOUDFLARED);
  return spawn(listo.cmd, listo.args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
}

export async function abrirTunel(puerto: number, deps: DepsDelTunel = {}): Promise<Tunel> {
  const destino = deps.destino ?? { tipo: "al-azar" };
  const proceso = (deps.lanzar ?? lanzarCloudflared)(puerto, destino);
  let salida = "";
  let termino = false;

  const mirar = (trozo: Buffer | string) => {
    salida = (salida + String(trozo)).slice(-8000);
  };
  // La dirección sale por stderr, que es donde cloudflared escribe su log.
  proceso.stdout?.on("data", mirar);
  proceso.stderr?.on("data", mirar);
  proceso.on("exit", () => void (termino = true));
  proceso.on("error", (error) => {
    salida += `\n${error.message}`;
    termino = true;
  });

  const detener = async () => {
    if (!termino) proceso.kill();
  };

  const hasta = Date.now() + (deps.esperaMs ?? 30_000);
  while (Date.now() < hasta) {
    const url = direccionDelTunel(salida, destino);
    if (url) return { url, host: new URL(url).host.toLowerCase(), detener };
    if (termino) {
      await detener();
      throw new Error(`cloudflared se cerró sin dar una dirección:\n${salida.trim().slice(-800)}`);
    }
    await new Promise((listo) => setTimeout(listo, 200));
  }
  await detener();
  throw new Error(`cloudflared no dio una dirección en ${Math.round((deps.esperaMs ?? 30_000) / 1000)} s:\n${salida.trim().slice(-800)}`);
}
