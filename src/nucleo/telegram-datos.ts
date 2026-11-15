import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { correrConPrompt, prepararComando } from "../agentes/ejecutar.js";

export const TOPE_DE_TELEGRAM = 20 * 1024 * 1024;

export interface ArchivoTelegram {
  readonly file_id: string;
  readonly file_name?: string;
  readonly file_size?: number;
}

export interface FotoTelegram {
  readonly file_id: string;
  readonly file_size?: number;
  readonly width?: number;
  readonly height?: number;
}

export interface ResultadoDeDato {
  readonly ruta?: string;
  readonly error?: string;
}

export function nombreTelegramSeguro(nombre: string, alternativo: string): string {
  const base = basename(nombre || alternativo).normalize("NFKC").replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^\.+/, "_").slice(0, 100);
  return base || alternativo;
}

async function pedirJson(pedir: typeof fetch, url: string): Promise<{ ok?: boolean; result?: { file_path?: string; file_size?: number } }> {
  const respuesta = await pedir(url).catch(() => undefined);
  return respuesta ? ((await respuesta.json().catch(() => ({}))) as { ok?: boolean; result?: { file_path?: string; file_size?: number } }) : {};
}

/** Descarga bytes locales; el contenido sigue siendo dato externo y no una instrucción. */
export async function descargarDatoTelegram(opciones: {
  readonly token: string;
  readonly dato: ArchivoTelegram | FotoTelegram;
  readonly carpeta: string;
  readonly pedir: typeof fetch;
  readonly api: (metodo: string) => string;
  readonly sufijo: string;
}): Promise<ResultadoDeDato> {
  const declarado = opciones.dato.file_size;
  if (typeof declarado === "number" && declarado > TOPE_DE_TELEGRAM) return { error: "El archivo supera el tope de 20 MB." };
  const info = await pedirJson(opciones.pedir, opciones.api(`getFile?file_id=${encodeURIComponent(opciones.dato.file_id)}`));
  const camino = info.result?.file_path;
  const tamano = info.result?.file_size ?? declarado;
  if (!info.ok || !camino) return { error: "Telegram no pudo preparar ese archivo." };
  if (typeof tamano === "number" && tamano > TOPE_DE_TELEGRAM) return { error: "El archivo supera el tope de 20 MB." };
  const respuesta = await opciones.pedir(`https://api.telegram.org/file/bot${opciones.token}/${camino}`).catch(() => undefined);
  if (!respuesta?.ok) return { error: "No pude bajar el archivo desde Telegram." };
  const largo = Number(respuesta.headers.get("content-length") ?? 0);
  if (largo > TOPE_DE_TELEGRAM) return { error: "El archivo supera el tope de 20 MB." };
  const bytes = new Uint8Array(await respuesta.arrayBuffer());
  if (bytes.byteLength > TOPE_DE_TELEGRAM) return { error: "El archivo supera el tope de 20 MB." };
  const carpeta = join(opciones.carpeta, ".dolphin", "entrantes");
  await mkdir(carpeta, { recursive: true });
  const nombre = nombreTelegramSeguro((opciones.dato as ArchivoTelegram).file_name ?? camino.split("/").at(-1) ?? opciones.sufijo, opciones.sufijo);
  const ruta = join(carpeta, `${Date.now()}-${nombre}`);
  await writeFile(ruta, bytes);
  return { ruta };
}

export async function transcribirNotaDeVoz(ruta: string, cwd: string, comando = process.env.DOLPHIN_TRANSCRIBIR): Promise<string> {
  if (!comando) throw new Error("Para transcribir notas de voz configurá DOLPHIN_TRANSCRIBIR con un comando local (por ejemplo whisper.cpp).");
  const listo = prepararComando(comando, [ruta]);
  if (!listo) throw new Error(`No encontré el comando de DOLPHIN_TRANSCRIBIR: ${comando}`);
  const corrida = await correrConPrompt(listo.cmd, listo.args, "", cwd, 120_000, undefined, listo.verbatim);
  if (corrida.codigo !== 0) throw new Error(corrida.error?.trim() || `La transcripción terminó con código ${corrida.codigo ?? "?"}.`);
  return corrida.salida.trim();
}
