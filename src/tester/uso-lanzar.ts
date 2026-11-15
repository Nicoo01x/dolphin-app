import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { matarArbol } from "../agentes/ejecutar.js";
import { puertoLibre } from "../nucleo/puertos.js";
import type { Universo } from "../nucleo/tipos.js";
import { levantarApp } from "./levantar.js";
import { entornoDeUso, esperaDe, reemplazar, type ConfigDeUso } from "./uso-config.js";

/**
 * Levantar la app para que un modelo la use: en un perfil descartable y con
 * un puerto de depuración (CDP) por donde se la maneja.
 *
 * - `electron`: se lanza el comando del repo con el puerto y el perfil en las
 *   variables que la persona declaró, y se espera a que `/json/list` liste
 *   una página (la ventana ya existe).
 * - `web`: se levanta el servidor como en la fase de pantalla (levantar.ts) y
 *   se abre un Chrome con depuración remota en esa URL.
 *
 * Quien lanza es responsable de que NO quede nada vivo: si algo sale mal a
 * medio lanzar, se mata acá mismo antes de devolver el motivo. El resto del
 * ciclo (matar al terminar, borrar el perfil) lo asegura uso.ts con un `finally`.
 */

export interface AppDeUso {
  /** Dónde se la maneja: «http://127.0.0.1:9333». Es lo que se le da al servidor MCP del navegador. */
  readonly cdp: string;
  /** Lo último que escribió el proceso: si algo sale mal, es lo primero que hay que mirar. */
  salida(): string;
  /** Mata TODO lo que se lanzó (el árbol entero) y suelta el puerto. No falla si ya estaba muerto. */
  detener(): Promise<void>;
}

export interface PedidoDeLanzamiento {
  readonly config: ConfigDeUso;
  readonly universo: Universo;
  /** Carpeta recién creada para esta corrida; uso.ts la borra al terminar. */
  readonly perfil: string;
}

/** Devuelve la app lista, o por qué no se pudo (en voz humana: es el motivo de que la fase se saltee). */
export type Lanzar = (pedido: PedidoDeLanzamiento) => Promise<AppDeUso | string>;

const ESPERA_POR_DEFECTO_MS = 60_000;

export const lanzarDeVerdad: Lanzar = (pedido) => (pedido.config.tipo === "electron" ? lanzarElectron(pedido) : lanzarWeb(pedido));

/** Las páginas que el puerto de depuración lista (sin las herramientas de desarrollo). 0 si no contesta. */
export async function paginasPorCdp(puerto: number): Promise<number> {
  try {
    const respuesta = await fetch(`http://127.0.0.1:${puerto}/json/list`, { signal: AbortSignal.timeout(1500) });
    const lista = (await respuesta.json()) as unknown;
    if (!Array.isArray(lista)) return 0;
    return lista.filter((p) => typeof p === "object" && p !== null && (p as { type?: unknown }).type === "page" && !String((p as { url?: unknown }).url ?? "").startsWith("devtools://")).length;
  } catch {
    return 0;
  }
}

const pausa = (ms: number) => new Promise((listo) => setTimeout(listo, ms));

/** Un puerto que nadie escucha: lo que prueba que no quedó un huérfano. Hasta `ms`. */
async function esperarQueSeCierre(puerto: number, ms = 3000): Promise<void> {
  const hasta = Date.now() + ms;
  while (Date.now() < hasta) {
    const abierto = await fetch(`http://127.0.0.1:${puerto}/json/version`, { signal: AbortSignal.timeout(500) }).then(
      () => true,
      () => false,
    );
    if (!abierto) return;
    await pausa(150);
  }
}

interface Proceso {
  readonly pid: number | undefined;
  salida(): string;
  /** Su código de salida si ya terminó. */
  termino(): number | null | undefined;
  detener(): Promise<void>;
}

/** Como levantar.ts, pero SIN `PORT`: en electron el puerto que importa es el de depuración, y un `PORT` ajeno lo pisaría. */
function lanzarProceso(comando: string, cwd: string, entorno: Readonly<Record<string, string>>): Proceso {
  const proceso = spawn(comando, {
    cwd,
    shell: true,
    windowsHide: true,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...entorno },
  });
  let salida = "";
  const anotar = (trozo: string) => {
    salida = (salida + trozo).slice(-4000);
  };
  proceso.stdout?.setEncoding("utf8");
  proceso.stderr?.setEncoding("utf8");
  proceso.stdout?.on("data", anotar);
  proceso.stderr?.on("data", anotar);

  let termino: number | null | undefined;
  const terminado = new Promise<void>((listo) =>
    proceso.on("exit", (codigo) => {
      termino = codigo;
      listo();
    }),
  );
  proceso.on("error", (error) => {
    salida += `\n${error.message}`;
    termino ??= -1;
  });

  return {
    pid: proceso.pid,
    salida: () => salida,
    termino: () => termino,
    async detener() {
      // El árbol aunque el padre ya haya salido: `pnpm dev` puede morir y dejar a electron vivo.
      await matarArbol(proceso.pid);
      if (termino === undefined) {
        proceso.kill("SIGKILL");
        await Promise.race([terminado, pausa(3000)]);
      }
    },
  };
}

async function lanzarElectron({ config, universo, perfil }: PedidoDeLanzamiento): Promise<AppDeUso | string> {
  const puerto = await puertoLibre();
  const valores = { perfil, puerto };
  const carpeta = config.cwd ? resolve(universo.ruta, config.cwd) : universo.ruta;
  const proceso = lanzarProceso(reemplazar(config.levantar, valores), carpeta, { ...universo.entorno, ...entornoDeUso(config, valores) });

  const app: AppDeUso = {
    cdp: `http://127.0.0.1:${puerto}`,
    salida: proceso.salida,
    async detener() {
      await proceso.detener();
      await esperarQueSeCierre(puerto);
    },
  };

  const hasta = Date.now() + (config.espera ?? ESPERA_POR_DEFECTO_MS);
  const quiereHttp = esperaDe(config) === "http" && config.url !== undefined;
  while (Date.now() < hasta) {
    if (proceso.termino() !== undefined) {
      await app.detener();
      return `la app se cerró antes de abrir su ventana (código ${proceso.termino()})\n${proceso.salida().trim()}`;
    }
    const ventana = (await paginasPorCdp(puerto)) > 0;
    const sirviendo = !quiereHttp || (await contesta(reemplazar(config.url!, valores)));
    // Lista, y la que contesta es la nuestra: si murió en el medio, esa respuesta ya no es de nadie.
    if (ventana && sirviendo && proceso.termino() === undefined) return app;
    await pausa(300);
  }
  const salida = proceso.salida().trim();
  await app.detener();
  return `la app no abrió una ventana con depuración remota en ${Math.round((config.espera ?? ESPERA_POR_DEFECTO_MS) / 1000)} s (puerto ${puerto})\n${salida}`;
}

async function lanzarWeb({ config, universo, perfil }: PedidoDeLanzamiento): Promise<AppDeUso | string> {
  const puertoApp = Number(universo.entorno?.["PORT"]) || (await puertoLibre());
  const valores = { perfil, puerto: puertoApp };
  const url = reemplazar(config.url ?? "", valores);
  const carpeta = config.cwd ? resolve(universo.ruta, config.cwd) : universo.ruta;
  let servidor;
  try {
    servidor = await levantarApp({
      comando: reemplazar(config.levantar, valores),
      url,
      cwd: carpeta,
      puerto: puertoApp,
      entorno: { ...universo.entorno, ...entornoDeUso(config, valores) },
      ...(config.espera ? { esperaMs: config.espera } : {}),
    });
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  // playwright-core es opcional: sin él (o sin Chrome) la fase se saltea, y el servidor no queda prendido.
  const chromium = await import("playwright-core").then((m) => m.chromium, () => undefined);
  if (!chromium) {
    await servidor.detener();
    return "falta playwright-core: instalalo para que el modelo pueda abrir la app web";
  }
  const puertoCdp = await puertoLibre();
  let contexto: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined;
  for (const canal of ["chrome", "msedge"]) {
    try {
      contexto = await chromium.launchPersistentContext(join(perfil, "navegador"), {
        channel: canal,
        headless: true,
        args: [`--remote-debugging-port=${puertoCdp}`],
      });
      break;
    } catch {
      /* el próximo canal */
    }
  }
  if (!contexto) {
    await servidor.detener();
    return "no hay Chrome ni Edge en esta máquina";
  }

  const abierto = contexto;
  const app: AppDeUso = {
    cdp: `http://127.0.0.1:${puertoCdp}`,
    salida: servidor.salida,
    async detener() {
      await abierto.close().catch(() => {});
      await servidor.detener();
      await esperarQueSeCierre(puertoCdp);
    },
  };
  try {
    const pagina = abierto.pages()[0] ?? (await abierto.newPage());
    await pagina.goto(url, { waitUntil: "load", timeout: 30_000 });
    if ((await paginasPorCdp(puertoCdp)) === 0) throw new Error("el Chrome no listó la página por el puerto de depuración");
    return app;
  } catch (error) {
    await app.detener();
    return `no se pudo abrir ${url}: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/** Contesta = cualquier respuesta HTTP que no sea un error del servidor (igual que levantar.ts). */
async function contesta(url: string): Promise<boolean> {
  try {
    const respuesta = await fetch(url, { signal: AbortSignal.timeout(1500), redirect: "manual" });
    return respuesta.status < 500;
  } catch {
    return false;
  }
}
