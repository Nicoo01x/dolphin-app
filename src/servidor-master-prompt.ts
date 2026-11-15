import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { leerConClaude } from "./agentes/leer-con-claude.js";
import { carpetaDeDolphin } from "./nucleo/escritura.js";
import {
  armarPrompt,
  guardarCaptura,
  mejoradorDeDemo,
  mejorarPrompt,
  TOPE_DE_CAPTURA,
  type CapturaDelPrompt,
  type Mejorador,
  type PinDelPrompt,
} from "./nucleo/master-prompt.js";
import { cuerpoDeLaConsola, json } from "./servidor-comun.js";

/**
 * Master Prompt desde la consola (ver nucleo/master-prompt.ts):
 *   POST /api/prompt/captura  {id, png (base64)}: la guarda y devuelve su ruta. Con `marcaDe` (la ruta
 *                             de una captura de ese prompt) guarda la versión con los puntos dibujados.
 *   GET  /api/prompt/captura?ruta=…: la devuelve, solo si es una de `.dolphin/prompts`.
 *   POST /api/prompt/mejorar  {pedido, capturas: [{ruta, nota, pines, marcada}]}: reescrito por un modelo.
 *   POST /api/prompt/armar    lo mismo, armado sin modelo: no gasta nada.
 */

export interface OpcionesDelMasterPrompt {
  readonly mejorador?: Mejorador;
  /** En la demo no se llama a nadie: el mejorador de mentira lo arma con una estructura fija. */
  readonly demo?: boolean;
}

/** El de siempre: Claude del medio, mirando las capturas y el repo, sin poder escribir nada. */
const mejoradorConClaude: Mejorador = (prompt, repo) =>
  leerConClaude(prompt, { modelo: "sonnet", vueltas: 12, herramientas: ["Read", "Grep", "Glob"], cwd: repo, tope: 180_000 });

/** La ruta, si es una captura de este repo. Lo que llega del navegador no es de fiar: nada fuera de la carpeta. */
async function capturaDelRepo(repo: string, ruta: unknown): Promise<string | undefined> {
  if (typeof ruta !== "string" || !ruta.endsWith(".png")) return undefined;
  const carpeta = resolve(await carpetaDeDolphin(repo), "prompts") + sep;
  const pedida = resolve(ruta);
  const adentro = process.platform === "win32" ? pedida.toLowerCase().startsWith(carpeta.toLowerCase()) : pedida.startsWith(carpeta);
  return adentro ? pedida : undefined;
}

/** Los puntos como vienen del navegador: solo los que tienen una posición de 0 a 100, con tope. */
function pinesDe(crudo: unknown): PinDelPrompt[] {
  if (!Array.isArray(crudo)) return [];
  const bien = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100;
  return (crudo as unknown[]).slice(0, 50).flatMap((p) => {
    const { x, y, nota } = (p ?? {}) as Record<string, unknown>;
    return bien(x) && bien(y) ? [{ x, y, nota: typeof nota === "string" ? nota.slice(0, 2000) : "" }] : [];
  });
}

export async function rutaDelMasterPrompt(
  ruta: string,
  url: URL,
  pedido: IncomingMessage,
  respuesta: ServerResponse,
  repo: string,
  token: string,
  opciones: OpcionesDelMasterPrompt = {},
): Promise<boolean> {
  if (!ruta.startsWith("/api/prompt/")) return false;

  if (ruta === "/api/prompt/captura" && pedido.method === "GET") {
    const pedida = await capturaDelRepo(repo, url.searchParams.get("ruta"));
    if (!pedida) {
      json(respuesta, 404, { ok: false, porQue: "esa captura no es de este proyecto" });
      return true;
    }
    try {
      const png = await readFile(pedida);
      respuesta.writeHead(200, { "content-type": "image/png", "cache-control": "no-store" });
      respuesta.end(png);
    } catch {
      json(respuesta, 404, { ok: false, porQue: "esa captura ya no está" });
    }
    return true;
  }

  if (pedido.method !== "POST") return false;

  if (ruta === "/api/prompt/captura") {
    // El base64 pesa un tercio más que el PNG.
    const datos = await cuerpoDeLaConsola(pedido, respuesta, token, Math.ceil(TOPE_DE_CAPTURA * 1.4) + 1024);
    if (!datos) return true;
    const base64 = typeof datos.png === "string" ? datos.png.replace(/^data:image\/png;base64,/, "") : "";
    const marcaDe = datos.marcaDe === undefined ? undefined : await capturaDelRepo(repo, datos.marcaDe);
    if (datos.marcaDe !== undefined && !marcaDe) {
      json(respuesta, 400, { ok: false, porQue: "la captura marcada tiene que ser de una captura de este proyecto" });
      return true;
    }
    try {
      const guardada = await guardarCaptura(repo, typeof datos.id === "string" ? datos.id : "", Buffer.from(base64, "base64"), marcaDe);
      json(respuesta, 200, { ok: true, ruta: guardada });
    } catch (error) {
      json(respuesta, 400, { ok: false, porQue: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  if (ruta === "/api/prompt/mejorar" || ruta === "/api/prompt/armar") {
    const datos = await cuerpoDeLaConsola(pedido, respuesta, token, 400_000);
    if (!datos) return true;
    const capturas: CapturaDelPrompt[] = [];
    for (const c of Array.isArray(datos.capturas) ? (datos.capturas as unknown[]).slice(0, 30) : []) {
      const { ruta: suya, nota, pines, marcada } = (c ?? {}) as Record<string, unknown>;
      const valida = await capturaDelRepo(repo, suya);
      if (!valida) {
        json(respuesta, 400, { ok: false, porQue: "una de las capturas no es de este proyecto: sacala y volvé a sumarla" });
        return true;
      }
      // Una marcada que no es de acá no se nombra: el prompt sigue con la original y sus puntos.
      const marcadaValida = marcada === undefined ? undefined : await capturaDelRepo(repo, marcada);
      capturas.push({
        ruta: valida,
        nota: typeof nota === "string" ? nota.slice(0, 4000) : "",
        pines: pinesDe(pines),
        ...(marcadaValida ? { marcada: marcadaValida } : {}),
      });
    }
    const borrador = { pedido: typeof datos.pedido === "string" ? datos.pedido.slice(0, 20_000) : "", capturas };
    // Armarlo es el mismo prompt sin pasar por nadie: no gasta.
    if (ruta === "/api/prompt/armar") {
      json(respuesta, 200, { ok: true, texto: armarPrompt(borrador), gastado: 0 });
      return true;
    }
    const mejorador = opciones.mejorador ?? (opciones.demo ? mejoradorDeDemo : mejoradorConClaude);
    try {
      json(respuesta, 200, { ok: true, ...(await mejorarPrompt(borrador, repo, mejorador)) });
    } catch (error) {
      json(respuesta, 502, { ok: false, porQue: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }
  return false;
}
