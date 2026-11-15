import { AsyncLocalStorage } from "node:async_hooks";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { accessSync, constants } from "node:fs";
import { basename, delimiter, isAbsolute, join } from "node:path";
import { comandoAislado, entornoAislado, type CajaDeLaRama } from "../nucleo/aislado.js";
import { FalloDelAgente } from "../nucleo/tipos.js";
import { anotarHijo, cortarCorrida, olvidarHijo, type Contenedor } from "./procesos.js";

// Siguen saliendo de acá: medio repo los importa de este archivo.
export { anotarHijo, cortarCorrida, matarArbol, matarHijosYa, olvidarHijo, procesoVivo, type Contenedor, type QuitarContenedor } from "./procesos.js";

/**
 * Correr un CLI de agente desde Node, en Windows, sin que explote.
 *
 * Dos cosas que muerden y no son obvias:
 *
 * 1 · El binario puede no tener extensión. El CLI de Claude se instala como
 *     `~/.local/bin/claude`, que es un .exe sin `.exe`. Node necesita la
 *     ruta completa para arrancarlo; con el nombre suelto tira EINVAL.
 *     Y si fuera un `.cmd`, Node se niega a spawnearlo sin shell desde la
 *     corrección del CVE-2024-27980.
 *
 * 2 · El prompt no va como argumento. La línea de comandos de Windows corta
 *     en 8191 caracteres, y un prompt con el contrato de superficie pegado
 *     se pasa de largo enseguida. Va por stdin, que además evita cualquier
 *     discusión sobre comillas y escapes.
 */

export function resolverEjecutable(nombre: string): string | undefined {
  if (isAbsolute(nombre)) return existe(nombre) ? nombre : undefined;

  const carpetas = (process.env["PATH"] ?? "").split(delimiter).filter(Boolean);
  // En Windows las extensiones reales van PRIMERO: al lado de npx.cmd vive
  // un «npx» sin extensión (el shim de bash) que spawn no puede ejecutar,
  // y con la extensión vacía adelante era lo primero que aparecía.
  const extras =
    process.platform === "win32"
      ? [...(process.env["PATHEXT"] ?? ".EXE;.CMD;.BAT").split(";").filter(Boolean), ""]
      : [""];

  for (const carpeta of carpetas) {
    for (const extension of extras) {
      const candidato = join(carpeta, `${nombre}${extension}`);
      if (existe(candidato)) return candidato;
    }
  }
  return undefined;
}

function existe(ruta: string): boolean {
  try {
    accessSync(ruta, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export interface Corrida {
  readonly salida: string;
  readonly codigo: number | null;
  /** Lo que dijo por stderr: el motivo real cuando se cae sin escribir su resultado. */
  readonly error?: string;
}

/**
 * El agente corrió hasta el tope y se lo cortó. Es un FalloDelAgente con el
 * costo desconocido: antes era un Error común, y la rama contaba como
 * «muerta gratis» a US$ 0 después de diez minutos de trabajar.
 *
 * Se lleva lo que alcanzó a escribir, igual que el silencio: que el proceso no haya SALIDO no
 * significa que no haya TERMINADO. Basta con que la tarea deje vivo algo de fondo (un `pnpm dev`)
 * para que los pipes no se cierren nunca y el tope lo mate con el trabajo ya hecho y su resultado
 * ya escrito. Tirar esa salida era perder la tarea entera y contestar «no salió».
 */
export class TopeDelAgente extends FalloDelAgente {
  constructor(
    mensaje: string,
    readonly salidaParcial = "",
    readonly errorParcial = "",
  ) {
    super(mensaje, 0, true);
    this.name = "TopeDelAgente";
  }
}

/** El proceso quedó mudo: se puede volver a intentar sin confundirlo con un tope total. */
export class SilencioDelAgente extends FalloDelAgente {
  constructor(
    mensaje: string,
    readonly salidaParcial: string,
    readonly errorParcial: string,
  ) {
    // El proceso sí corrió, pero no alcanzó a informar su costo: no se lo puede contar como gratis.
    super(mensaje, 0, true);
    this.name = "SilencioDelAgente";
  }
}

function sobreElEntorno(entorno: Readonly<Record<string, string | undefined>>): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const [clave, valor] of Object.entries(entorno)) {
    if (valor === undefined) delete env[clave];
    else env[clave] = valor;
  }
  return env;
}

/**
 * La caja por defecto del proceso: la que usa lo que no es una rama (los bots, `dolphin seguir`, un
 * atajo). Es lo último que se mira.
 */
let cajaDelProceso: CajaDeLaRama | null = null;

/**
 * La caja de la rama que está corriendo ACÁ. Viaja con su flujo async, así que cada rama se lleva la
 * suya a todo lo que lance (su turno de escritura, sus correcciones, su revisión).
 *
 * Antes la caja era una sola variable de módulo: con dos ramas a la vez —la cola con
 * `--concurrencia 3`, el equipo— la última que se preparaba le cambiaba la caja a las que ya estaban
 * trabajando. Y como `leerConfig` devuelve `{}` ante cualquier error (un `dolphin.config.json` leído a
 * medio escribir alcanza), una rama podía dejar a las otras corriendo SIN caja, que es lo único que
 * el modo aislado promete que no pasa.
 */
const cajaDeLaRamaDeAhora = new AsyncLocalStorage<CajaDeLaRama | null>();

/** La caja por defecto del proceso (null: afuera, como siempre). No le toca la caja a ninguna rama ya en curso. */
export function aislarAgentes(nueva: CajaDeLaRama | null): void {
  cajaDelProceso = nueva;
}

/**
 * Corre `trabajo` con SU caja: todo lo que lance adentro —aunque sea mucho después y en paralelo con
 * otras ramas— se lanza en esa, y no en la del proceso. `null` es una caja también: significa «esta
 * rama corre afuera», y por eso no se cae a la del proceso.
 */
export function conCaja<T>(caja: CajaDeLaRama | null, trabajo: () => Promise<T>): Promise<T> {
  return cajaDeLaRamaDeAhora.run(caja, trabajo);
}

/** La caja que le toca a este spawn: la de su rama si está adentro de una, y si no la del proceso. */
export function cajaDeAhora(): CajaDeLaRama | null {
  const deLaRama = cajaDeLaRamaDeAhora.getStore();
  return deLaRama === undefined ? cajaDelProceso : deLaRama;
}

/** El comando como corre de verdad: tal cual, o envuelto en la caja con el worktree como única carpeta. */
export function comoCorre(
  cmd: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): { cmd: string; args: readonly string[]; env?: NodeJS.ProcessEnv; contenedor?: Contenedor } {
  const caja = cajaDeAhora();
  if (!caja) return { cmd, args };
  // Adentro de la caja el motor es el de la imagen (o el del sistema, con bubblewrap): por nombre, no por la ruta de acá.
  const motor = basename(cmd).replace(/\.(exe|cmd|bat)$/i, "");
  const contenedor = caja.tipo === "bwrap" ? undefined : { caja: caja.tipo, nombre: `dolphin-agente-${randomBytes(6).toString("hex")}` };
  const comando = comandoAislado(caja.tipo, { worktree: cwd, cmd: motor, args, entorno: env, config: caja.config, ...(contenedor ? { nombre: contenedor.nombre } : {}) });
  // Docker conserva su entorno de conexión, pero recibe los valores permitidos para heredar los
  // `-e CLAVE`; bubblewrap, sin `--clearenv`, arranca con solo el entorno ya filtrado.
  const seguro = entornoAislado(env);
  const entornoDelSpawn = caja.tipo === "bwrap" ? { ...seguro, PATH: env.PATH ?? seguro.PATH } : { ...env, ...seguro };
  return { ...comando, env: entornoDelSpawn, ...(contenedor ? { contenedor } : {}) };
}

export function correrConPrompt(
  cmd: string,
  args: readonly string[],
  prompt: string,
  cwd: string,
  tope: number,
  /** Se pone encima del entorno del proceso; una clave en undefined se saca (ver nucleo/cuentas.ts). */
  entorno?: Readonly<Record<string, string | undefined>>,
  verbatim = false,
  /** Cada trozo de la salida apenas llega: lo que cuenta el agente mientras trabaja (ver nucleo/voces.ts). */
  alLeer?: (trozo: string) => void,
  /** Quien lo pidió ya no espera (cerró la pantalla, tocó «seguir sin»): se mata el árbol y no se gasta más. */
  senal?: AbortSignal,
  /** Milisegundos sin salida antes de considerar que el agente se colgó. Cero lo desactiva. */
  silencio?: number,
): Promise<Corrida> {
  return new Promise((resolver, rechazar) => {
    if (senal?.aborted) return rechazar(new Error("cancelado: nadie esperaba la respuesta"));
    const env = entorno ? sobreElEntorno(entorno) : process.env;
    const corre = comoCorre(cmd, args, cwd, env);
    const proceso = spawn(corre.cmd, [...corre.args], {
      cwd,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: "env" in corre ? corre.env : env,
      windowsVerbatimArguments: verbatim,
      // En POSIX, cabeza de su grupo: el tope mata al agente y a lo que lanzó.
      detached: process.platform !== "win32",
    });
    anotarHijo(proceso.pid);
    // Texto de una vez por flujo: sumar pedazos partía una «ñ» y el contrato salía con «�».
    proceso.stdout.setEncoding("utf8");
    proceso.stderr.setEncoding("utf8");

    let salida = "";
    let error = "";
    let cortado = false;
    let silencioso = false;

    // Hasta que no se borró el contenedor no se avisa: quien retoma lanzaría otro agente encima.
    let desarme: Promise<void> | undefined;
    const cortar = () => {
      desarme ??= cortarCorrida(proceso.pid, corre.contenedor).then(() => void proceso.kill("SIGKILL"));
    };

    let relojDeSilencio: NodeJS.Timeout | undefined;
    const reiniciarSilencio = () => {
      if (!silencio || silencio <= 0) return;
      if (relojDeSilencio) clearTimeout(relojDeSilencio);
      relojDeSilencio = setTimeout(() => {
        silencioso = true;
        cortar();
      }, silencio);
    };
    reiniciarSilencio();

    const reloj = setTimeout(() => {
      cortado = true;
      if (relojDeSilencio) clearTimeout(relojDeSilencio);
      cortar();
    }, tope);
    let cancelado = false;
    const cancelar = () => {
      cancelado = true;
      clearTimeout(reloj);
      if (relojDeSilencio) clearTimeout(relojDeSilencio);
      cortar();
    };
    senal?.addEventListener("abort", cancelar, { once: true });

    proceso.stdout.on("data", (trozo: string) => {
      salida += trozo;
      reiniciarSilencio();
      alLeer?.(trozo);
    });
    proceso.stderr.on("data", (trozo: string) => {
      error += trozo;
      reiniciarSilencio();
    });

    proceso.on("error", (e) => {
      clearTimeout(reloj);
      if (relojDeSilencio) clearTimeout(relojDeSilencio);
      senal?.removeEventListener("abort", cancelar);
      olvidarHijo(proceso.pid);
      rechazar(new Error(`no se pudo correr «${cmd}»: ${e.message}`));
    });

    proceso.on("close", (codigo) => {
      clearTimeout(reloj);
      if (relojDeSilencio) clearTimeout(relojDeSilencio);
      senal?.removeEventListener("abort", cancelar);
      olvidarHijo(proceso.pid);
      const rechazarDesarmado = (motivo: Error) => void (desarme ?? Promise.resolve()).then(() => rechazar(motivo));
      if (cancelado) {
        rechazarDesarmado(new Error("cancelado: nadie esperaba la respuesta"));
        return;
      }
      if (cortado) {
        // Corrió hasta el tope: algo gastó, y no se sabe cuánto. No es una muerte gratis.
        rechazarDesarmado(new TopeDelAgente(`«${cmd}» no terminó en ${Math.round(tope / 1000)} s`, salida, error));
        return;
      }
      if (silencioso) {
        rechazarDesarmado(new SilencioDelAgente(`«${cmd}» no escribió durante ${Math.round((silencio ?? 0) / 1000)} s`, salida, error));
        return;
      }
      resolver({ salida: salida.trim() !== "" ? salida : error, codigo, ...(error.trim() ? { error } : {}) });
    });

    proceso.stdin.on("error", () => {
      /* si el proceso cerró stdin antes de tiempo, lo dirá el close */
    });
    proceso.stdin.write(prompt);
    proceso.stdin.end();
  });
}

/**
 * Un .cmd o .bat no se puede spawnear directo desde Node desde la
 * corrección del CVE-2024-27980: hay que pasar por cmd.exe. Esto afecta a
 * todo lo que venga de npm en Windows (`npm.cmd`, `npx.cmd`, los bin de los
 * paquetes), así que vive acá y lo usan tanto los agentes como el portón.
 */
export interface Preparado {
  readonly cmd: string;
  readonly args: readonly string[];
  readonly verbatim: boolean;
}

export function prepararComando(cmd: string, args: readonly string[]): Preparado | undefined {
  const resuelto = resolverEjecutable(cmd);
  if (!resuelto) return undefined;

  if (porCmd(resuelto)) {
    if (cajaDeAhora()) {
      // La imagen tiene su propio motor Linux: no le pases el cmd.exe de Windows ni su línea
      // envuelta. `claude.cmd` afuera es simplemente `claude` adentro, con los argumentos crudos.
      return { cmd: basename(resuelto).replace(/\.(cmd|bat)$/i, ""), args, verbatim: false };
    }
    // cmd.exe termina la línea en el primer salto, entre comillas o no: lo
    // que sigue se perdía sin aviso. No hay cómo escaparlo, así que se dice.
    if (args.some((a) => /[\r\n]/.test(a))) {
      throw new Error(`un argumento de varias líneas no llega entero a ${resuelto} por cmd.exe: mandalo por la entrada estándar o en un archivo`);
    }
    const linea = [citar(resuelto), ...args.map(citar)].join(" ");
    return {
      cmd: process.env["COMSPEC"] ?? "cmd.exe",
      // verbatim: cmd.exe recibe la línea tal cual la armamos, sin que Node
      // la vuelva a escapar por su cuenta y la rompa. /v:off: un «!» no se
      // expande aunque la máquina tenga la expansión diferida prendida.
      args: ["/d", "/v:off", "/s", "/c", `"${linea}"`],
      verbatim: true,
    };
  }

  return { cmd: resuelto, args, verbatim: false };
}

const porCmd = (resuelto: string) => process.platform === "win32" && /\.(cmd|bat)$/i.test(resuelto);

/**
 * Si un texto no llegaría tal cual como argumento de `cmd`: en Windows, un
 * .cmd pasa por cmd.exe, que corta en el primer salto de línea y cambia
 * `%PATH%` por su valor aunque vaya entre comillas. Quien manda un texto
 * libre (el pedido de Antigravity) lo mira antes, y si da que sí lo manda
 * por otro lado.
 */
export function noPasaTalCual(cmd: string, texto: string): boolean {
  return porCmd(resolverEjecutable(cmd) ?? "") && /[\r\n%]/.test(texto);
}

// Uno vacío también va entre comillas: suelto, desaparece de la línea y el que sigue toma su lugar
// (`--tools ""` sin herramientas quedaba `--tools` comiéndose lo que viniera después).
function citar(valor: string): string {
  return valor === "" || /[\s&|<>^"]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor;
}
