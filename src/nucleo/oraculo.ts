import { spawn } from "node:child_process";
import { join } from "node:path";
import { anotarHijo, matarArbol, olvidarHijo } from "../agentes/ejecutar.js";
import { carpetaDeDolphin, escribirDeUna } from "./escritura.js";
import type { Intento } from "./persistir.js";

/**
 * El oráculo de un objetivo: un comando tuyo que dice si quedó logrado (sale en 0) o no. Con él,
 * «lo logré» deja de ser la palabra del agente y pasa a ser un hecho que se puede volver a correr:
 * `/objetivo que el importador lea los CSV del banco --oraculo npm test -- importador`.
 *
 * El portón dice si la rama está sana (tipos, tests, revisión); el oráculo dice si hace lo que
 * pediste. Mientras no pase, el objetivo no está logrado y lo que imprimió es la pista del intento
 * siguiente. Es el bucle de «especificación → construir → oráculo → reintentar».
 */

export const TOPE_DEL_ORACULO = 10 * 60_000;
const RENGLONES_DE_EVIDENCIA = 20;

export interface VeredictoDelOraculo {
  readonly comando: string;
  readonly paso: boolean;
  /** Los últimos renglones de lo que imprimió: la evidencia. */
  readonly salida: string;
  readonly ms: number;
}

/** El objetivo y su oráculo, de lo que escribió la persona: todo lo que sigue a «--oraculo». */
export function separarOraculo(texto: string): { objetivo: string; oraculo?: string } {
  const m = /^([\s\S]*?)\s+--or[aá]culo\s+([\s\S]+)$/i.exec(texto.trim());
  if (!m) return { objetivo: texto.trim() };
  const oraculo = m[2]!.trim().replace(/^(["'`])([\s\S]*)\1$/, "$2").trim();
  return oraculo ? { objetivo: m[1]!.trim(), oraculo } : { objetivo: m[1]!.trim() };
}

/** El pedido al equipo, sabiendo desde el principio con qué se va a juzgar. */
export function pedidoConOraculo(objetivo: string, oraculo?: string): string {
  if (!oraculo) return objetivo;
  return `${objetivo}\n\nSe da por logrado cuando este comando, corrido en la raíz del repo, sale en 0: \`${oraculo}\`. Correlo vos antes de terminar.`;
}

const colaDe = (texto: string, renglones: number) =>
  texto
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((r) => r.trim() !== "")
    .slice(-renglones)
    .join("\n");

/** Corre el oráculo adentro de la rama que entregó el equipo. Nunca tira: un error es un «no pasó». */
export function correrOraculo(comando: string, cwd: string, tope = TOPE_DEL_ORACULO): Promise<VeredictoDelOraculo> {
  const desde = Date.now();
  return new Promise((resolver) => {
    const proceso = spawn(comando, { cwd, shell: true, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CI: "1" }, detached: process.platform !== "win32" });
    anotarHijo(proceso.pid);
    let stdout = "";
    let stderr = "";
    let cortado = false;
    let terminado = false;
    const guardar = (actual: string, trozo: string) => (actual + trozo).slice(-(8 * 1024 * 1024));
    const reloj = setTimeout(() => {
      cortado = true;
      void matarArbol(proceso.pid).then(() => proceso.kill("SIGKILL"));
    }, tope);
    const terminar = (codigo: number | null, error?: Error) => {
      if (terminado) return;
      terminado = true;
      clearTimeout(reloj);
      olvidarHijo(proceso.pid);
      const salida = colaDe(`${stdout}\n${stderr}${error ? `\n${error.message}` : ""}`, RENGLONES_DE_EVIDENCIA);
      const corte = cortado ? `se cortó a los ${Math.round(tope / 1000)} s` : "";
      resolver({ comando, paso: !cortado && codigo === 0, salida: [salida, corte].filter(Boolean).join("\n"), ms: Date.now() - desde });
    };
    proceso.stdout?.setEncoding("utf8");
    proceso.stderr?.setEncoding("utf8");
    proceso.stdout?.on("data", (trozo: string) => (stdout = guardar(stdout, trozo)));
    proceso.stderr?.on("data", (trozo: string) => (stderr = guardar(stderr, trozo)));
    proceso.once("error", (error) => terminar(null, error));
    proceso.once("close", (codigo) => terminar(codigo));
  });
}

/**
 * El porqué de un intento que el oráculo rechazó. El primer renglón lleva lo último que imprimió:
 * es lo que mira la escalera para saber si hubo progreso (el error cambió) o si está trabado.
 */
export function porQueDelOraculo(v: VeredictoDelOraculo): string {
  const ultimo = v.salida.split("\n").at(-1)?.trim() || "salió distinto de 0 sin decir nada";
  return `el oráculo no pasó: ${ultimo}\n${v.salida}`;
}

/** La evidencia del objetivo en `.dolphin/objetivos/`: qué se pidió, cada intento y lo que dijo el oráculo. */
export async function guardarEvidencia(
  repo: string,
  datos: { objetivo: string; oraculo: string; rama?: string; logrado: boolean; intentos: readonly Intento[]; veredictos: readonly VeredictoDelOraculo[] },
  ahora = new Date(),
): Promise<string> {
  const carpeta = await carpetaDeDolphin(repo, "objetivos");
  const archivo = join(carpeta, `${ahora.toISOString().replace(/[:.]/g, "-")}.json`);
  await escribirDeUna(archivo, `${JSON.stringify({ ...datos, cuando: ahora.toISOString() }, null, 2)}\n`);
  return archivo;
}
