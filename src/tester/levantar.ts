import { spawn } from "node:child_process";
import { matarArbol } from "../agentes/ejecutar.js";

/**
 * Levantar la app de una rama para mirarla: el comando de siempre del
 * repo (`npm run dev`, un servidor estático, lo que sea), en el worktree de
 * esa rama y en su PROPIO puerto. Dos ramas levantadas a la vez no se
 * pisan: cada universo ya trae su PORT (ver puertos.ts).
 *
 * `{PUERTO}` en el comando y en la URL se reemplaza por el puerto de la
 * rama; además va en la variable PORT, que es la que lee casi todo.
 */

export interface OpcionesLevantar {
  /** El comando, con `{PUERTO}` donde vaya el puerto: «npm run dev -- --port {PUERTO}». */
  readonly comando: string;
  /** Dónde contesta: «http://127.0.0.1:{PUERTO}/». */
  readonly url: string;
  readonly cwd: string;
  readonly puerto: number;
  readonly entorno?: Readonly<Record<string, string>>;
  /** Cuánto esperar a que conteste. */
  readonly esperaMs?: number;
}

export interface AppLevantada {
  readonly url: string;
  /** Lo último que escribió el proceso: si algo sale mal, es lo primero que hay que mirar. */
  salida(): string;
  detener(): Promise<void>;
}

const conPuerto = (texto: string, puerto: number) => texto.replaceAll("{PUERTO}", String(puerto));

export async function levantarApp(opciones: OpcionesLevantar): Promise<AppLevantada> {
  const url = conPuerto(opciones.url, opciones.puerto);
  // Si algo ya contesta ahí ANTES de lanzar, es otra app (un servidor que quedó
  // prendido con ese puerto): la de la rama moría con EADDRINUSE y se juzgaba la vieja.
  if (await contesta(url)) {
    throw new Error(`en ${url} ya contesta otra cosa (un servidor que quedó prendido): no se puede probar esta rama en ese puerto`);
  }
  const proceso = spawn(conPuerto(opciones.comando, opciones.puerto), {
    cwd: opciones.cwd,
    shell: true,
    windowsHide: true,
    // En Linux y macOS, un grupo propio: es lo que deja matar el árbol entero.
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...opciones.entorno, PORT: String(opciones.puerto) },
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
  // Un comando que no existe: el error llega por acá y no por exit.
  proceso.on("error", (error) => {
    salida += `\n${error.message}`;
    termino ??= -1;
  });

  const detener = async () => {
    if (termino !== undefined) return;
    // El árbol entero: `npm run dev` levanta hijos que sobreviven al padre.
    await matarArbol(proceso.pid);
    proceso.kill("SIGKILL");
    await Promise.race([terminado, new Promise((listo) => setTimeout(listo, 3000))]);
  };

  const hasta = Date.now() + (opciones.esperaMs ?? 30_000);
  while (Date.now() < hasta) {
    if (termino !== undefined) {
      throw new Error(`la app se cerró antes de contestar (código ${termino})\n${salida.trim()}`);
    }
    // Contesta, y el que contesta es el nuestro: si murió en el medio, la respuesta es de otro.
    if ((await contesta(url)) && termino === undefined) return { url, salida: () => salida, detener };
    await new Promise((listo) => setTimeout(listo, 250));
  }
  await detener();
  throw new Error(`la app no contestó en ${Math.round((opciones.esperaMs ?? 30_000) / 1000)} s en ${url}\n${salida.trim()}`);
}

/** Contesta = cualquier respuesta HTTP que no sea un error del servidor. */
async function contesta(url: string): Promise<boolean> {
  try {
    const respuesta = await fetch(url, { signal: AbortSignal.timeout(1500), redirect: "manual" });
    return respuesta.status < 500;
  } catch {
    return false;
  }
}
