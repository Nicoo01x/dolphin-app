import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

/**
 * Quién puede entrar a la consola.
 *
 * Hasta ahora la respuesta era una sola: esta máquina. El servidor escucha en 127.0.0.1 y rechaza
 * cualquier pedido cuyo Host no sea loopback, que es lo que corta el DNS rebinding —un dominio
 * ajeno que resuelve a 127.0.0.1 llega con SU nombre en el Host—. Con `dolphin ui --tunel` aparece
 * una segunda: el teléfono, por una dirección pública.
 *
 * Y ahí el pase deja de ser un detalle. De local, el pase viaja adentro de la página porque el
 * peligro es otro sitio abierto en el navegador haciendo `fetch` a 127.0.0.1; cualquiera que esté
 * sentado en la máquina ya tiene el repo. Por el túnel, en cambio, **la dirección la puede abrir
 * cualquiera**: si la página saliera con el pase adentro, abrir el link sería tener la consola, y
 * con ella el código, la memoria y el botón de sembrar.
 *
 * Por eso un pedido de afuera tiene que traer el pase él mismo, de dos maneras:
 *
 * - `?pase=…` en la dirección: así es el link que `--tunel` imprime, para abrirlo una vez. El
 *   servidor lo cambia por una cookie y saca el pase de la URL, que es lo que queda en el
 *   historial, en los `Referer` y en la pantalla de quien esté al lado.
 * - La cookie, de ahí en más, y la cabecera `x-dolphin-token` para lo que escribe (que la consola
 *   ya manda: el pase está en el meta de su página). Que escribir pida la CABECERA y no la cookie
 *   es lo que corta el CSRF: un sitio ajeno puede hacer que tu navegador mande la cookie, pero no
 *   puede leer el pase para ponerlo en una cabecera.
 */

/** Cómo entró un pedido. */
export type Entrada =
  /** Desde esta máquina: como siempre. */
  | { readonly como: "local" }
  /** Por el túnel y con el pase: pasa. */
  | { readonly como: "de-afuera" }
  /** Por el túnel sin pase: hay que pedírselo. */
  | { readonly como: "sin-pase" }
  /** Ni local ni el host del túnel: no es para nosotros. */
  | { readonly como: "ajeno" };

export interface Puerta {
  /** El pase de esta corrida del servidor. */
  readonly pase: string;
  /**
   * El host que el túnel publica («algo.trycloudflare.com»), en minúscula. Sin esto no entra nada
   * de afuera: la lista de hosts permitidos nunca es «cualquiera».
   */
  readonly hostDeAfuera?: string;
}

/** El nombre del host del pedido, sin el puerto. */
export function hostDe(pedido: IncomingMessage): string {
  const host = (pedido.headers.host ?? "").toLowerCase();
  // Una IPv6 va entre corchetes: `[::1]:4700`.
  return host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : (host.split(":")[0] ?? "");
}

/**
 * Si el pedido vino a nombre de esta máquina. Un dominio ajeno que resuelve a 127.0.0.1 (DNS
 * rebinding) llega con SU nombre en el Host: así se lo reconoce. Se mira en todo pedido, no solo
 * en los que escriben: un GET le leía a esa página el pase, el código de las ramas y la memoria.
 */
export function hostLocal(pedido: IncomingMessage): boolean {
  const nombre = hostDe(pedido);
  return nombre === "127.0.0.1" || nombre === "localhost" || nombre === "[::1]";
}

/** Comparación en tiempo constante: dos pases de largos distintos no se comparan byte a byte. */
export function mismoPase(a: string | undefined, b: string): boolean {
  if (typeof a !== "string" || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export const COOKIE_DEL_PASE = "dolphin_pase";

/** El pase que trae el pedido, mire donde mire: la cookie, la cabecera o la dirección. */
export function paseDelPedido(pedido: IncomingMessage, url: URL): string | undefined {
  const cabecera = pedido.headers["x-dolphin-token"];
  if (typeof cabecera === "string") return cabecera;
  const enLaUrl = url.searchParams.get("pase");
  if (enLaUrl) return enLaUrl;
  const cookies = pedido.headers.cookie ?? "";
  for (const trozo of cookies.split(";")) {
    const [nombre, ...resto] = trozo.trim().split("=");
    if (nombre === COOKIE_DEL_PASE) return decodeURIComponent(resto.join("="));
  }
  return undefined;
}

/** Cómo entró este pedido. Es la única función que decide: lo demás obedece. */
export function comoEntra(pedido: IncomingMessage, url: URL, puerta: Puerta): Entrada {
  if (hostLocal(pedido)) return { como: "local" };
  if (!puerta.hostDeAfuera || hostDe(pedido) !== puerta.hostDeAfuera) return { como: "ajeno" };
  return mismoPase(paseDelPedido(pedido, url), puerta.pase) ? { como: "de-afuera" } : { como: "sin-pase" };
}

/**
 * La cookie con la que sigue navegando quien entró con el pase en la dirección.
 *
 * `HttpOnly` para que un script no la lea, `SameSite=Strict` para que no viaje desde otro sitio, y
 * `Secure` porque el túnel es HTTPS. De sesión a propósito: cerrar el navegador la borra, que es
 * lo que uno espera de algo que abrió un rato desde el teléfono.
 */
export function cookieDelPase(pase: string): string {
  return `${COOKIE_DEL_PASE}=${encodeURIComponent(pase)}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

/** La misma dirección sin el pase: a eso se redirige después de dejar la cookie. */
export function sinElPase(url: URL): string {
  const limpia = new URL(url.toString());
  limpia.searchParams.delete("pase");
  return `${limpia.pathname}${limpia.search}${limpia.hash}`;
}

/** Lo que ve quien abre la dirección del túnel sin el pase. */
export const PAGINA_SIN_PASE = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>dolphin</title><style>
  :root { color-scheme: dark }
  body { margin: 0; min-height: 100dvh; display: grid; place-items: center; padding: 24px;
         font: 16px/1.6 system-ui, sans-serif; background: #0b0e14; color: #e6edf3 }
  main { max-width: 32rem; text-align: center }
  h1 { font-size: 20px; margin: 0 0 8px }
  p { margin: 0; color: #9aa7b2; font-size: 14px }
  code { background: #161b22; border-radius: 6px; padding: 2px 6px; font-size: 13px }
</style></head>
<body><main>
  <h1>Esta consola pide el pase</h1>
  <p>Abrila con el link completo que te dio <code>dolphin ui --tunel</code>: es el que termina en
  <code>?pase=…</code>. El pase cambia cada vez que arranca el servidor.</p>
</main></body></html>
`;
