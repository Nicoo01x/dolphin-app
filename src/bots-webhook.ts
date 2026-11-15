import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { correrRutinaDeEvento } from "./bots/rutinas.js";
import { leerBot } from "./bots/almacen.js";

const LIMITE = 256 * 1024;
const VENTANA = 60_000;
const MAXIMO = 30;

export interface OpcionesWebhook {
  readonly host?: string;
  readonly puerto?: number;
  readonly ahora?: () => Date;
}

export function crearServidorWebhook(opciones: OpcionesWebhook = {}): Server {
  const cuentas = new Map<string, { desde: number; cantidad: number }>();
  const ahora = opciones.ahora ?? (() => new Date());
  const servidor = createServer(async (pedido, respuesta) => {
    try {
      await atender(pedido, respuesta, cuentas, ahora);
    } catch (error) {
      const estado = typeof error === "object" && error && "codigoHttp" in error && typeof error.codigoHttp === "number" ? error.codigoHttp : 500;
      responder(respuesta, estado, { ok: false, porQue: error instanceof Error ? error.message : String(error) });
    }
  });
  return servidor;
}

export async function escucharWebhook(opciones: OpcionesWebhook = {}): Promise<Server> {
  const servidor = crearServidorWebhook(opciones);
  await new Promise<void>((resolver, rechazar) => {
    servidor.once("error", rechazar);
    servidor.listen(opciones.puerto ?? 4890, opciones.host ?? "127.0.0.1", resolver);
  });
  return servidor;
}

async function atender(
  pedido: IncomingMessage,
  respuesta: ServerResponse,
  cuentas: Map<string, { desde: number; cantidad: number }>,
  ahora: () => Date,
): Promise<void> {
  const partes = /^\/evento\/([^/]+)\/([^/]+)$/.exec(pedido.url?.split("?")[0] ?? "");
  if (pedido.method !== "POST" || !partes) return responder(respuesta, 404, { ok: false, porQue: "solo existe POST /evento/<bot>/<rutina>" });
  const bot = await leerBot(decodeURIComponent(partes[1]!)).catch(() => undefined);
  const rutina = bot?.rutinas.find((x) => x.id === decodeURIComponent(partes[2]!));
  if (!bot || !rutina || rutina.cuando.tipo !== "evento" || !rutina.secreto) return responder(respuesta, 404, { ok: false, porQue: "ese evento no existe" });
  const largoDeclarado = Number(pedido.headers["content-length"] ?? 0);
  if (largoDeclarado > LIMITE) return responder(respuesta, 413, { ok: false, porQue: "el cuerpo supera los 256 KB" });
  const cuerpo = await leerCuerpo(pedido);
  const firma = firmaDe(pedido, rutina.secreto, cuerpo);
  if (!firma) return responder(respuesta, 401, { ok: false, porQue: "firma inválida" });
  const llave = `${bot.id}:${rutina.id}`;
  const tiempo = ahora().getTime();
  const anterior = cuentas.get(llave);
  const actual = !anterior || tiempo - anterior.desde >= VENTANA ? { desde: tiempo, cantidad: 0 } : anterior;
  if (actual.cantidad >= MAXIMO) return responder(respuesta, 429, { ok: false, porQue: "demasiados eventos para esta rutina; probá en un minuto" });
  actual.cantidad++;
  cuentas.set(llave, actual);
  const datos = resumenDeEvento(cuerpo);
  const resultado = await correrRutinaDeEvento(bot, rutina, { datos });
  responder(respuesta, resultado.fallo ? 500 : 202, { ok: !resultado.fallo, resultado });
}

function leerCuerpo(pedido: IncomingMessage): Promise<Buffer> {
  return new Promise((resolver, rechazar) => {
    const partes: Buffer[] = [];
    let cantidad = 0;
    pedido.on("data", (parte: Buffer | string) => {
      const buffer = Buffer.isBuffer(parte) ? parte : Buffer.from(parte);
      cantidad += buffer.length;
      if (cantidad > LIMITE) {
        rechazar(Object.assign(new Error("el cuerpo supera los 256 KB"), { codigoHttp: 413 }));
        pedido.destroy();
        return;
      }
      partes.push(buffer);
    });
    pedido.on("end", () => resolver(Buffer.concat(partes)));
    pedido.on("error", rechazar);
  });
}

function firmaDe(pedido: IncomingMessage, secreto: string, cuerpo: Buffer): boolean {
  const esperada = `sha256=${createHmac("sha256", secreto).update(cuerpo).digest("hex")}`;
  const recibidas = [pedido.headers["x-hub-signature-256"], pedido.headers["x-dolphin-firma"]]
    .flatMap((valor) => (Array.isArray(valor) ? valor : valor ? [valor] : []));
  return recibidas.some((texto) => {
    const a = Buffer.from(texto);
    const b = Buffer.from(esperada);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

function resumenDeEvento(cuerpo: Buffer): string {
  const texto = cuerpo.toString("utf8");
  try {
    const dato = JSON.parse(texto) as unknown;
    if (dato && typeof dato === "object" && !Array.isArray(dato)) return JSON.stringify(Object.fromEntries(Object.entries(dato).map(([clave, valor]) => [clave, valor]))).slice(0, 4096);
  } catch {
    // Un webhook puede ser texto: se conserva como dato, no como una instrucción.
  }
  return JSON.stringify({ cuerpo: texto.slice(0, 4090) }).slice(0, 4096);
}

function responder(respuesta: ServerResponse, estado: number, cuerpo: unknown): void {
  respuesta.writeHead(estado, { "content-type": "application/json; charset=utf-8" });
  respuesta.end(JSON.stringify(cuerpo));
}
