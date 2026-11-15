import type { IncomingMessage, ServerResponse } from "node:http";
import { hostLocal, mismoPase } from "./nucleo/puerta.js";

/**
 * Lo que comparten los pedidos de la consola: cómo se contesta, quién puede
 * preguntar y cómo se lee un cuerpo. Estaba copiado en nueve handlers, y el
 * día que hubo que arreglar la lectura del cuerpo había que arreglarla nueve
 * veces.
 */

/** Quién entra lo decide `nucleo/puerta.ts`; acá se re-exporta porque medio servidor lo usa. */
export { hostLocal } from "./nucleo/puerta.js";

export function json(respuesta: ServerResponse, codigo: number, cuerpo: unknown) {
  // Sin esto el navegador puede servir una cosecha VIEJA desde su caché
  // heurística y la pantalla mezcla dos turnos: pasó de verdad.
  respuesta.writeHead(codigo, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  respuesta.end(JSON.stringify(cuerpo));
}

export function texto(respuesta: ServerResponse, codigo: number, cuerpo: string) {
  respuesta.writeHead(codigo, { "content-type": "text/plain; charset=utf-8" });
  respuesta.end(cuerpo);
}

/**
 * El cuerpo entero, decodificado de una sola vez: sumar los pedazos como
 * texto partía en dos una «ñ» que cayera justo en el corte, y el perfil se
 * guardaba con un «�». `null` si pasa el tope; lo que sobra se deja correr,
 * para que el 413 le llegue a quien preguntó.
 */
export function leerCuerpo(pedido: IncomingMessage, tope: number): Promise<string | null> {
  return new Promise((resolver, fallar) => {
    const trozos: Buffer[] = [];
    let largo = 0;
    let pasado = false;
    pedido.on("data", (trozo: Buffer) => {
      if (pasado) return;
      largo += trozo.length;
      if (largo > tope) {
        pasado = true;
        trozos.length = 0;
        resolver(null);
        return;
      }
      trozos.push(trozo);
    });
    pedido.on("end", () => {
      if (!pasado) resolver(Buffer.concat(trozos).toString("utf8"));
    });
    pedido.on("error", fallar);
  });
}

/**
 * El JSON de un pedido que escribe: desde esta máquina y con el pase que el
 * servidor metió en SU página. Sin el pase, cualquier sitio abierto en el
 * navegador podría correr agentes acá con un fetch a 127.0.0.1. Devuelve
 * `undefined` si ya contestó por qué no.
 */
export async function cuerpoDeLaConsola(
  pedido: IncomingMessage,
  respuesta: ServerResponse,
  token: string,
  tope = 10_000,
): Promise<Record<string, unknown> | undefined> {
  // De esta máquina, o de afuera con el pase en la CABECERA. Lo segundo es el teléfono por el
  // túnel: el handler del servidor ya lo dejó pasar (ver nucleo/puerta.ts) y acá se vuelve a
  // pedir el pase, que es justo lo que un sitio ajeno no puede leer para hacer CSRF —la cookie
  // la manda el navegador solo, la cabecera no—.
  if (!hostLocal(pedido) && !mismoPase(typeof pedido.headers["x-dolphin-token"] === "string" ? pedido.headers["x-dolphin-token"] : undefined, token)) {
    json(respuesta, 403, { ok: false, porQue: "solo desde esta máquina" });
    return undefined;
  }
  if (pedido.headers["x-dolphin-token"] !== token) {
    // Pasa de verdad: el servidor se reinició y la página quedó con el pase de antes.
    json(respuesta, 403, { ok: false, porQue: "falta el pase de la consola: refrescá la página" });
    return undefined;
  }
  const cuerpo = await leerCuerpo(pedido, tope);
  if (cuerpo === null) {
    json(respuesta, 413, { ok: false, porQue: "el pedido es demasiado grande" });
    return undefined;
  }
  try {
    const datos = JSON.parse(cuerpo) as unknown;
    if (datos && typeof datos === "object" && !Array.isArray(datos)) return datos as Record<string, unknown>;
  } catch {
    // abajo
  }
  json(respuesta, 400, { ok: false, porQue: "el cuerpo no es JSON" });
  return undefined;
}
