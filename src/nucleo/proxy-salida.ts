import { appendFile, mkdir } from "node:fs/promises";
import { createServer, type IncomingMessage } from "node:http";
import { connect, isIP, type Socket } from "node:net";
import { dirname } from "node:path";
import type { Duplex } from "node:stream";

/**
 * La única puerta de salida de la caja aislada (ver aislado.ts y caja-filtrada.ts).
 *
 * Es un proxy HTTP que solo entiende CONNECT: el agente le pide «abrime un túnel a
 * api.anthropic.com:443» y, si ese host está en la lista de su motor (o en `aislado.hosts`
 * del dolphin.config.json), el proxy abre el túnel y no mira más: el TLS va de punta a punta,
 * Dolphin no ve ni toca lo que viaja. Todo lo demás —otro host, otro puerto, HTTP en claro—
 * vuelve con un 403 y queda anotado en el log, así se ve qué intentó y no pudo.
 *
 * No inyecta credenciales: la del motor sigue entrando a la caja como antes.
 */

/**
 * Los hosts que necesita cada motor para hablar con su API y renovar su sesión, y nada más.
 *
 * Claude: la doc de Claude Code (code.claude.com/docs/en/network-config) pide api.anthropic.com
 * para la API y platform.claude.com para renovar el token OAuth. statsig.anthropic.com y sentry.io
 * ya no figuran (la telemetría va a Datadog y es opcional: se apaga adentro de la caja con
 * CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC). Codex: api.openai.com para la API, chatgpt.com para
 * la sesión de ChatGPT y auth.openai.com para renovarla; OpenAI no publica una lista oficial.
 */
export const HOSTS_DEL_MOTOR: Readonly<Record<string, readonly string[]>> = {
  claude: ["api.anthropic.com", "platform.claude.com"],
  codex: ["api.openai.com", "chatgpt.com", "auth.openai.com"],
};

/** La lista de un motor más la del repo, sin repetidos y en minúscula. */
export function hostsPermitidos(motor: string, delRepo: readonly string[] = []): string[] {
  const propios = HOSTS_DEL_MOTOR[motor.toLowerCase()] ?? [];
  return [...new Set([...propios, ...delRepo].map((h) => h.trim().toLowerCase()).filter((h) => h !== ""))];
}

/**
 * Si un host está en la lista. Exacto por defecto; `*.ejemplo.com` abre los subdominios (no el
 * dominio pelado). Sin comodines implícitos: `sentry.io` abierto entero dejaría mandar datos al
 * proyecto de Sentry de cualquiera.
 */
export function hostPermitido(host: string, lista: readonly string[]): boolean {
  const limpio = host.trim().toLowerCase().replace(/\.$/, "");
  if (limpio === "") return false;
  return lista.some((entrada) => {
    const e = entrada.trim().toLowerCase().replace(/\.$/, "");
    if (e.startsWith("*.")) return limpio.endsWith(e.slice(1)) && limpio.length > e.length - 1;
    return limpio === e;
  });
}

/** El destino de un CONNECT: `host:puerto` o `[ipv6]:puerto`. Null si no se entiende. */
export function destinoDelConnect(pedido: string): { host: string; puerto: number } | null {
  const m = /^\[([^\]]+)\]:(\d{1,5})$/.exec(pedido) ?? /^([^:[\]\s]+):(\d{1,5})$/.exec(pedido);
  if (!m) return null;
  const puerto = Number(m[2]);
  return puerto > 0 && puerto < 65536 ? { host: m[1]!, puerto } : null;
}

export interface OpcionesDelProxy {
  readonly permitidos: readonly string[];
  /** Los puertos a los que se puede ir: 443 y nada más, salvo que se diga otra cosa. */
  readonly puertos?: readonly number[];
  /** Si está, cada pedido trae `Proxy-Authorization: Basic dolphin:<token>` o vuelve con 407. */
  readonly token?: string;
  /** Una línea por pedido rechazado (y por túnel abierto): adónde quiso ir y por qué no. */
  readonly anotar?: (linea: string) => void;
  /** Cómo se abre la conexión de verdad. Los tests la llevan a un servidor local. */
  readonly conectar?: (host: string, puerto: number) => Socket;
}

export interface ProxySalida {
  readonly direccion: string;
  readonly puerto: number;
  cerrar(): Promise<void>;
}

/** Anota en un archivo, de a una línea, sin esperar: un log que falla no corta la caja. */
export function anotarEn(ruta: string): (linea: string) => void {
  let fila: Promise<unknown> = mkdir(dirname(ruta), { recursive: true }).catch(() => undefined);
  return (linea) => {
    fila = fila.then(() => appendFile(ruta, `${linea}\n`, "utf8")).catch(() => undefined);
  };
}

const respuesta = (codigo: number, texto: string, extra = "") => `HTTP/1.1 ${codigo} ${texto}\r\n${extra}Content-Length: 0\r\nConnection: close\r\n\r\n`;

function autorizado(pedido: IncomingMessage, token: string | undefined): boolean {
  if (!token) return true;
  const cabecera = pedido.headers["proxy-authorization"] ?? "";
  const m = /^Basic\s+(.+)$/i.exec(cabecera);
  return !!m && Buffer.from(m[1]!, "base64").toString("utf8") === `dolphin:${token}`;
}

/** Levanta el proxy en `direccion` (puerto 0: el que dé el sistema). */
export function abrirProxySalida(opciones: OpcionesDelProxy, direccion = "127.0.0.1", puerto = 0): Promise<ProxySalida> {
  const puertos = opciones.puertos ?? [443];
  const anotar = opciones.anotar ?? (() => undefined);
  const conectar = opciones.conectar ?? ((host: string, p: number) => connect(p, host));
  const abiertos = new Set<Duplex>();
  const cuando = () => new Date().toISOString();

  const servidor = createServer((pedido, res) => {
    // HTTP en claro: la credencial viajaría sin cifrar, y ningún motor lo necesita.
    anotar(`${cuando()} rechazado ${pedido.method ?? "?"} ${pedido.url ?? ""} (solo se sale por HTTPS)`);
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8", Connection: "close" }).end("dolphin: la caja solo sale por HTTPS a los hosts de su motor\n");
  });

  servidor.on("connect", (pedido: IncomingMessage, cliente: Duplex, cabeza: Buffer) => {
    abiertos.add(cliente);
    cliente.on("close", () => abiertos.delete(cliente));
    cliente.on("error", () => cliente.destroy());
    if (!autorizado(pedido, opciones.token)) {
      cliente.end(respuesta(407, "Proxy Authentication Required", 'Proxy-Authenticate: Basic realm="dolphin"\r\n'));
      return;
    }
    const destino = destinoDelConnect(pedido.url ?? "");
    const porQueNo = !destino
      ? "no se entiende el destino"
      : !puertos.includes(destino.puerto)
        ? `puerto ${destino.puerto} fuera de la lista`
        : isIP(destino.host) !== 0 && !opciones.permitidos.includes(destino.host)
          ? "una IP suelta no es un host de la lista"
          : !hostPermitido(destino.host, opciones.permitidos)
            ? "host fuera de la lista"
            : null;
    if (porQueNo || !destino) {
      anotar(`${cuando()} rechazado CONNECT ${pedido.url ?? ""} (${porQueNo})`);
      cliente.end(respuesta(403, "Forbidden"));
      return;
    }
    const afuera = conectar(destino.host, destino.puerto);
    abiertos.add(afuera);
    let establecido = false;
    afuera.once("connect", () => {
      establecido = true;
      anotar(`${cuando()} permitido CONNECT ${destino.host}:${destino.puerto}`);
      cliente.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (cabeza.length > 0) afuera.write(cabeza);
      afuera.pipe(cliente);
      cliente.pipe(afuera);
    });
    afuera.on("error", (error) => {
      // Si el host permitido no contesta, el agente recibe un 502 y no un corte mudo.
      if (!establecido) {
        anotar(`${cuando()} falló CONNECT ${destino.host}:${destino.puerto} (${error.message})`);
        if (cliente.writable) cliente.end(respuesta(502, "Bad Gateway"));
      }
      afuera.destroy();
      if (establecido) cliente.destroy();
    });
    afuera.on("close", () => {
      abiertos.delete(afuera);
      if (establecido) cliente.destroy();
    });
    cliente.on("close", () => afuera.destroy());
  });

  return new Promise((listo, fallo) => {
    servidor.once("error", fallo);
    servidor.listen(puerto, direccion, () => {
      servidor.off("error", fallo);
      const dir = servidor.address();
      listo({
        direccion,
        puerto: typeof dir === "object" && dir ? dir.port : puerto,
        cerrar: () =>
          new Promise((cerrado) => {
            for (const s of abiertos) s.destroy();
            servidor.close(() => cerrado());
          }),
      });
    });
  });
}
