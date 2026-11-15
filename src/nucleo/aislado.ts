import { execFile } from "node:child_process";
import { comandoDelLanzador, LOG_DE_SALIDA } from "./caja-filtrada.js";
import { hostsPermitidos } from "./proxy-salida.js";

/**
 * El modo aislado: el agente corre en una caja donde lo único que ve es su worktree. Sin tu home (ni
 * ~/.ssh, ni ~/.aws, ni las sesiones de otras apps), sin las variables de entorno de tu terminal
 * salvo la credencial de SU motor, y sin red salvo que la pidas. Con red, por defecto sale solo a
 * los hosts de su motor (ver caja-filtrada.ts); la red entera hay que pedirla con todas las letras.
 * Lo hace una de tres cajas, la que haya en la máquina: Docker, Podman o bubblewrap (Linux, o una
 * distro de WSL).
 *
 * Si pediste modo aislado y no hay ninguna, el agente NO corre sin caja: se dice qué instalar. Un
 * modo que se apaga solo cuando falta algo no protege nada. Qué cubre cada modo, sin vender de más:
 * docs/aislamiento.md.
 */

export type Caja = "docker" | "podman" | "bwrap";

/**
 * Qué caja y con qué configuración corre UNA rama. Es de la rama y no del proceso: dos siembras a la
 * vez (la cola, el equipo) pueden tener cajas distintas, y hasta el 31/10/2026 la última en prepararse
 * le cambiaba la caja a las que ya estaban corriendo (ver conCaja en agentes/ejecutar.ts).
 */
export interface CajaDeLaRama {
  readonly tipo: Caja;
  readonly config: ConfigAislada;
}

export interface ConfigAislada {
  /** La imagen con el motor instalado (Docker/Podman): la arma quien la usa, ver docs/aislamiento.md. */
  readonly imagen?: string;
  /**
   * Sin red (lo de siempre); `true`: solo a los hosts de su motor y a `hosts`, por el proxy de
   * Dolphin; `"completa"`: a cualquier lado, como antes de que hubiera filtro.
   */
  readonly red?: boolean | "completa";
  /** Hosts de más a los que puede salir, además de los de su motor (`*.ejemplo.com` abre los subdominios). */
  readonly hosts?: readonly string[];
}

/** Las variables que puede ver el agente adentro: las de su motor y lo mínimo para correr. */
const DEL_MOTOR = /^(ANTHROPIC_API_KEY|CLAUDE_CODE_OAUTH_TOKEN|OPENAI_API_KEY|CODEX_API_KEY|GEMINI_API_KEY|GOOGLE_API_KEY)$/;
const BASICAS = /^(LANG|LC_ALL|TERM|TZ)$/;

/** El entorno que entra a la caja: lo básico, la credencial del motor y nada más (ni tokens de GitHub, ni de la nube). */
export function entornoAislado(entorno: Readonly<Record<string, string | undefined>>): Record<string, string> {
  const limpio: Record<string, string> = { HOME: "/trabajo", PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" };
  for (const [clave, valor] of Object.entries(entorno)) {
    if (valor !== undefined && (DEL_MOTOR.test(clave) || BASICAS.test(clave))) limpio[clave] = valor;
  }
  return limpio;
}

/**
 * bubblewrap no tiene cómo llegar a un proxy del host sin compartir la red entera: o toda, o nada.
 * Antes de soltarle la red completa en silencio, no corre.
 */
export const BWRAP_SIN_FILTRO =
  'con bubblewrap no puedo filtrar la red a los hosts del motor: o es toda o es nada. Poné "red": "completa" si aceptás que salga a cualquier lado, o usá Docker o Podman (ver docs/aislamiento.md)';

/** Con red filtrada, un motor del que Dolphin no conoce los hosts (Antigravity, un `cmd` propio) no tiene a dónde salir. */
export const sinListaDeHosts = (motor: string) =>
  `con "red": true el agente sale solo a los hosts de su motor, y de «${motor}» no conozco ninguno: se quedaría sin red y fallaría sin decir por qué. Sumá los que necesita en "aislado": { "hosts": [...] }, o poné "red": "completa" si aceptás que salga a cualquier lado (ver docs/aislamiento.md)`;

/** El comando que corre `cmd args` adentro de la caja, con el worktree como única carpeta. */
export function comandoAislado(
  caja: Caja,
  pedido: {
    worktree: string;
    cmd: string;
    args: readonly string[];
    entorno: Readonly<Record<string, string | undefined>>;
    config?: ConfigAislada;
    /** El nombre del contenedor (Docker/Podman): con él se lo borra si hay que cortar al agente. */
    nombre?: string;
  },
): { cmd: string; args: string[] } {
  const entorno = entornoAislado(pedido.entorno);
  const red = pedido.config?.red;
  if (caja === "bwrap") {
    if (red === true) throw new Error(BWRAP_SIN_FILTRO);
    return {
      cmd: "bwrap",
      args: [
        "--unshare-all",
        ...(red === "completa" ? ["--share-net"] : []),
        "--die-with-parent",
        "--new-session",
        "--ro-bind", "/usr", "/usr",
        "--ro-bind-try", "/bin", "/bin",
        "--ro-bind-try", "/lib", "/lib",
        "--ro-bind-try", "/lib64", "/lib64",
        "--ro-bind-try", "/etc/ssl", "/etc/ssl",
        "--ro-bind-try", "/etc/resolv.conf", "/etc/resolv.conf",
        "--proc", "/proc",
        "--dev", "/dev",
        "--tmpfs", "/tmp",
        "--bind", pedido.worktree, "/trabajo",
        "--chdir", "/trabajo",
        pedido.cmd,
        ...pedido.args,
      ],
    };
  }
  if (!pedido.config?.imagen) throw new Error(`el modo aislado con ${caja} necesita una imagen con el motor instalado: "aislado": { "imagen": "…" } en dolphin.config.json (ver docs/aislamiento.md)`);
  if (red === true) {
    // Sin lista no hay a dónde salir: cada CONNECT volvería 403 y el agente fallaría sin decir por qué.
    const permitidos = hostsPermitidos(pedido.cmd, pedido.config.hosts ?? []);
    if (permitidos.length === 0) throw new Error(sinListaDeHosts(pedido.cmd));
    // Con red filtrada lo corre un proceso de Dolphin que levanta el proxy, la red y el relevo.
    return comandoDelLanzador({
      caja,
      imagen: pedido.config.imagen,
      worktree: pedido.worktree,
      cmd: pedido.cmd,
      args: [...pedido.args],
      // HOME y PATH van con su valor: el proceso que lanza la caja necesita su PATH para encontrar docker.
      claves: Object.keys(entorno).filter((k) => k !== "HOME" && k !== "PATH"),
      fijas: { HOME: entorno.HOME!, PATH: entorno.PATH! },
      permitidos,
      log: LOG_DE_SALIDA,
      ...(pedido.nombre ? { nombre: pedido.nombre } : {}),
      ...(process.env.PATH ? { rutas: process.env.PATH } : {}),
    });
  }
  return {
    cmd: caja,
    args: [
      "run", "--rm", "-i",
      "--network", red === "completa" ? "bridge" : "none",
      "--cap-drop", "ALL",
      "--security-opt", "no-new-privileges",
      ...(pedido.nombre ? ["--name", pedido.nombre] : []),
      "-v", `${pedido.worktree}:/trabajo`,
      "-w", "/trabajo",
      // Los valores viajan en el entorno del spawn; no los pongas en los argumentos porque
      // cualquiera que liste procesos podría leer la credencial del motor.
      ...Object.keys(entorno).flatMap((k) => ["-e", k]),
      pedido.config.imagen,
      pedido.cmd,
      ...pedido.args,
    ],
  };
}

const responde = (cmd: string, args: readonly string[]) =>
  new Promise<boolean>((listo) => execFile(cmd, [...args], { windowsHide: true, timeout: 10_000 }, (error) => listo(!error)));

/** La caja que hay en esta máquina, en orden de preferencia; null si no hay ninguna. */
export async function cajaDisponible(probar: (cmd: string, args: readonly string[]) => Promise<boolean> = responde): Promise<Caja | null> {
  if (await probar("docker", ["info", "--format", "{{.ServerVersion}}"])) return "docker";
  if (await probar("podman", ["info", "--format", "{{.Version.Version}}"])) return "podman";
  if (process.platform === "linux" && (await probar("bwrap", ["--version"]))) return "bwrap";
  return null;
}

export const SIN_CAJA =
  "pediste el modo aislado y en esta máquina no hay con qué aislar (ni Docker, ni Podman, ni bubblewrap): no corro el agente sin caja. Instalá Docker Desktop, o una distro de WSL con bubblewrap, o sacá «aislado» de dolphin.config.json (ver docs/aislamiento.md)";
