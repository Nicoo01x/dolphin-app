import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { abrirProxySalida, anotarEn, type ProxySalida } from "./proxy-salida.js";

/**
 * La caja con red filtrada (Docker o Podman): el agente corre en una red interna, sin salida
 * directa a ningún lado, y lo único que alcanza es un relevo que lo lleva al proxy de
 * proxy-salida.ts, que corre ACÁ, en esta máquina, y solo deja pasar los hosts de su motor.
 *
 *   agente ──(red interna «dolphin-sin-salida»)──▶ relevo ──(bridge)──▶ proxy en el host ──▶ api.anthropic.com
 *
 * ¿Por qué un relevo y no el proxy directo? Una red `--internal` no tiene ruta al host en Docker
 * Desktop (Windows, macOS), y en Linux depende de la versión. El relevo es un contenedor con un pie
 * en cada red que reenvía bytes a UN solo lugar: el proxy. No decide nada; decide el proxy.
 *
 * Esto corre como un proceso aparte (ejecutar.ts lanza un comando y nada más): levanta el proxy,
 * arma la red y el relevo, corre al agente con la entrada y la salida de siempre, y al terminar
 * desarma todo. Si a este proceso lo matan de golpe, el relevo se va solo: cada 30 s mira si el
 * proxy sigue ahí, y si no, sale (y `--rm` lo borra).
 */

export const RED_SIN_SALIDA = "dolphin-sin-salida";
/** El puerto del relevo adentro de la red interna. */
export const PUERTO_DEL_RELEVO = 3128;
/** Adónde va a parar lo que el proxy rechaza: fuera del worktree, que el agente puede escribir. */
export const LOG_DE_SALIDA = join(homedir(), ".dolphin", "salida.log");

export interface PlanDeCaja {
  readonly caja: "docker" | "podman";
  readonly imagen: string;
  readonly worktree: string;
  readonly cmd: string;
  readonly args: readonly string[];
  /** Las variables que entran a la caja (sus valores vienen en el entorno de este proceso). */
  readonly claves: readonly string[];
  /** Las que van con su valor escrito: HOME y PATH de adentro, que no son secretos. */
  readonly fijas?: Readonly<Record<string, string>>;
  readonly permitidos: readonly string[];
  readonly log: string;
  /**
   * El PATH de Dolphin. ejecutar.ts le pasa a este proceso el entorno de la caja, con el PATH de
   * Linux de adentro: con ese, en Windows, «docker» no se encuentra.
   */
  readonly rutas?: string;
  /**
   * El nombre del contenedor del agente. Si a este proceso lo matan de golpe, el `finally` no corre
   * y el agente seguiría: quien lo lanzó lo borra por nombre (ver cortarCorrida en ejecutar.ts).
   */
  readonly nombre?: string;
}

/** Cómo ve el relevo al host: Docker con `host-gateway`, Podman con su nombre de siempre. */
const hostDesdeLaCaja = (caja: PlanDeCaja["caja"]) => (caja === "podman" ? "host.containers.internal" : "host.docker.internal");

/** El relevo: un reenvío de bytes al proxy del host, que se va solo si el proxy desaparece. */
export const SCRIPT_DEL_RELEVO = [
  'const net=require("net");const puerto=Number(process.argv[1]);const host=process.argv[2];',
  "net.createServer((c)=>{const u=net.connect(puerto,host);c.pipe(u).pipe(c);const fin=()=>{c.destroy();u.destroy()};",
  'c.on("error",fin);u.on("error",fin);c.on("close",fin);u.on("close",fin)}).listen(' + PUERTO_DEL_RELEVO + ',()=>console.log("escuchando"));',
  'setInterval(()=>{const p=net.connect(puerto,host);p.setTimeout(5000,()=>process.exit(0));p.on("connect",()=>p.destroy());p.on("error",()=>process.exit(0))},30000);',
].join("");

/** El relevo: en el bridge de siempre (para llegar al host), sin privilegios, con node de la misma imagen. */
export function argumentosDelRelevo(plan: PlanDeCaja, nombre: string, puertoDelProxy: number): string[] {
  return [
    "run", "-d", "--rm",
    "--name", nombre,
    "--network", plan.caja === "podman" ? "podman" : "bridge",
    ...(plan.caja === "docker" ? ["--add-host", "host.docker.internal:host-gateway"] : []),
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges",
    "--entrypoint", "node",
    plan.imagen,
    "-e", SCRIPT_DEL_RELEVO,
    String(puertoDelProxy),
    hostDesdeLaCaja(plan.caja),
  ];
}

/**
 * El agente: en la red interna, sin más salida que el relevo. El token del proxy va en los
 * argumentos a propósito: solo abre ese proxy, que solo lleva a la lista; no es la credencial del
 * motor, que sigue viajando por el entorno.
 */
export function argumentosDelAgente(plan: PlanDeCaja, relevo: string, token: string): string[] {
  const proxy = `http://dolphin:${token}@${relevo}:${PUERTO_DEL_RELEVO}`;
  const delProxy = ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"].flatMap((k) => ["-e", `${k}=${proxy}`]);
  return [
    "run", "--rm", "-i",
    "--network", RED_SIN_SALIDA,
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges",
    ...(plan.nombre ? ["--name", plan.nombre] : []),
    "-v", `${plan.worktree}:/trabajo`,
    "-w", "/trabajo",
    ...plan.claves.flatMap((k) => ["-e", k]),
    ...Object.entries(plan.fijas ?? {}).flatMap(([k, v]) => ["-e", `${k}=${v}`]),
    ...delProxy,
    // La telemetría de Claude Code iría a Datadog: rechazada igual, pero llenaría el log de ruido.
    "-e", "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1",
    plan.imagen,
    plan.cmd,
    ...plan.args,
  ];
}

/** El plan viaja en un solo argumento, en base64url: sin comillas ni espacios que un shell pueda tocar. */
export const plan64 = (plan: PlanDeCaja) => Buffer.from(JSON.stringify(plan), "utf8").toString("base64url");
export const planDe64 = (texto: string) => JSON.parse(Buffer.from(texto, "base64url").toString("utf8")) as PlanDeCaja;

export interface DepsDeLaCaja {
  /** `docker …` o `podman …`: devuelve la salida, o rechaza si falla. */
  readonly caja: (args: readonly string[]) => Promise<string>;
  /** Corre al agente con la entrada y la salida de este proceso; devuelve su código. */
  readonly agente: (cmd: string, args: readonly string[]) => Promise<number>;
  readonly abrirProxy?: typeof abrirProxySalida;
  readonly esperar?: (ms: number) => Promise<void>;
}

export const RED_CON_SALIDA = `ya hay una red «${RED_SIN_SALIDA}» y no es interna: el agente saldría a cualquier lado sin pasar por el proxy. No corro. Borrala (docker network rm ${RED_SIN_SALIDA}, o podman) y Dolphin la vuelve a crear con --internal`;

/**
 * La red interna existe o se crea. Dos agentes a la vez pueden crearla juntos: el segundo falla y no
 * importa. Una que ya estaba se mira: con el mismo nombre pero sin `--internal` no filtra nada.
 */
async function asegurarRed(deps: DepsDeLaCaja): Promise<void> {
  const interna = () => deps.caja(["network", "inspect", RED_SIN_SALIDA, "--format", "{{.Internal}}"]).then((s) => s.trim(), () => null);
  let estado = await interna();
  if (estado === null) {
    estado = await deps.caja(["network", "create", "--internal", RED_SIN_SALIDA]).then(
      () => "true",
      async (error: unknown) => {
        const otra = await interna();
        if (otra === null) throw error;
        return otra;
      },
    );
  }
  if (estado === "false") throw new Error(RED_CON_SALIDA);
}

/**
 * Dónde escucha el proxy: en la puerta del bridge, que es adonde llega el relevo en Linux. En Docker
 * Desktop esa IP es de su máquina virtual, no de esta: ahí `host.docker.internal` llega al localhost.
 */
async function abrirDondeLlegue(plan: PlanDeCaja, deps: DepsDeLaCaja, token: string): Promise<ProxySalida> {
  const abrir = deps.abrirProxy ?? abrirProxySalida;
  const opciones = { permitidos: plan.permitidos, token, anotar: anotarEn(plan.log) };
  const formato = plan.caja === "podman" ? "{{range .Subnets}}{{.Gateway}}{{end}}" : "{{range .IPAM.Config}}{{.Gateway}}{{end}}";
  const puerta = (await deps.caja(["network", "inspect", plan.caja === "podman" ? "podman" : "bridge", "--format", formato]).catch(() => "")).trim();
  if (/^[\d.]+$/.test(puerta)) {
    const ahi = await abrir(opciones, puerta).catch(() => null);
    if (ahi) return ahi;
  }
  return abrir(opciones, "127.0.0.1");
}

/** Arma todo, corre al agente y desarma. Devuelve el código del agente (o 1 si no llegó a correr). */
export async function correrCajaFiltrada(plan: PlanDeCaja, deps: DepsDeLaCaja): Promise<number> {
  const esperar = deps.esperar ?? ((ms: number) => new Promise<void>((listo) => setTimeout(listo, ms)));
  const token = randomBytes(18).toString("base64url");
  const relevo = `dolphin-salida-${randomBytes(6).toString("hex")}`;
  const proxy = await abrirDondeLlegue(plan, deps, token);
  try {
    await asegurarRed(deps);
    await deps.caja(argumentosDelRelevo(plan, relevo, proxy.puerto));
    await deps.caja(["network", "connect", RED_SIN_SALIDA, relevo]);
    // Hasta 5 s a que el relevo escuche: el agente arranca más lento, pero no hay por qué apostar.
    for (let i = 0; i < 25; i++) {
      if ((await deps.caja(["logs", relevo]).catch(() => "")).includes("escuchando")) break;
      await esperar(200);
    }
    return await deps.agente(plan.caja, argumentosDelAgente(plan, relevo, token));
  } finally {
    await deps.caja(["rm", "-f", relevo]).catch(() => undefined);
    await proxy.cerrar();
  }
}

/** Con qué se lanza este archivo como proceso: node (con tsx si corre desde el código fuente). */
export function comandoDelLanzador(plan: PlanDeCaja): { cmd: string; args: string[] } {
  const propio = fileURLToPath(import.meta.url);
  const deFuente = propio.endsWith(".ts");
  let tsx = "tsx";
  if (deFuente) {
    try {
      // Absoluto: el proceso arranca en el worktree, donde «tsx» puede no resolver.
      tsx = import.meta.resolve("tsx");
    } catch {
      // Sin import.meta.resolve (un runner de tests): queda el nombre.
    }
  }
  // Adentro de la app de escritorio process.execPath es Electron, que sin su variable abre una ventana.
  const node = process.versions.electron ? "node" : process.execPath;
  return { cmd: node, args: [...(deFuente ? ["--import", tsx] : []), propio, plan64(plan)] };
}

const lanzadoDirecto = process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (lanzadoDirecto) {
  const plan = planDe64(process.argv[2] ?? "");
  // En Windows la clave puede venir como «Path»: dos claves distintas y el hijo elige cualquiera.
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !plan.rutas || k.toUpperCase() !== "PATH"));
  if (plan.rutas) env.PATH = plan.rutas;
  const caja = (args: readonly string[]) =>
    new Promise<string>((listo, fallo) =>
      execFile(plan.caja, [...args], { windowsHide: true, timeout: 60_000, env }, (error, stdout, stderr) => (error ? fallo(Object.assign(error, { stderr })) : listo(`${stdout}${stderr}`))),
    );
  const agente = (cmd: string, args: readonly string[]) =>
    new Promise<number>((listo) => {
      const hijo = spawn(cmd, [...args], { stdio: "inherit", windowsHide: true, env });
      const cortar = () => hijo.kill("SIGTERM");
      process.once("SIGTERM", cortar);
      process.once("SIGINT", cortar);
      hijo.on("error", (error) => {
        process.stderr.write(`dolphin: no pude correr ${cmd}: ${error.message}\n`);
        listo(1);
      });
      hijo.on("close", (codigo) => listo(codigo ?? 1));
    });
  correrCajaFiltrada(plan, { caja, agente }).then(
    (codigo) => process.exit(codigo),
    (error: unknown) => {
      process.stderr.write(`dolphin: no pude armar la caja con red filtrada: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(1);
    },
  );
}
