import { connect, createServer, type Server, type Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { abrirProxySalida, destinoDelConnect, hostPermitido, hostsPermitidos, type ProxySalida } from "../src/nucleo/proxy-salida.js";

/**
 * El proxy por el que sale la caja aislada, contra un servidor local que hace de api.anthropic.com:
 * nada sale a internet. Lo permitido abre el túnel, lo demás vuelve con 403 y queda anotado.
 */

let proxy: ProxySalida | undefined;
let falso: Server | undefined;
afterEach(async () => {
  await proxy?.cerrar();
  await new Promise<void>((listo) => (falso ? falso.close(() => listo()) : listo()));
  proxy = undefined;
  falso = undefined;
});

/** Un «servidor de la API» que devuelve lo que recibe en mayúsculas. */
async function servidorFalso(): Promise<number> {
  falso = createServer((s) => s.on("data", (d) => s.write(d.toString().toUpperCase())));
  await new Promise<void>((listo) => falso!.listen(0, "127.0.0.1", () => listo()));
  return (falso.address() as { port: number }).port;
}

/** Manda un pedido crudo al proxy y junta lo que vuelve hasta que aparece `hasta` o se corta. */
function pedir(puerto: number, texto: string, hasta = "\r\n\r\n", despues?: string): Promise<{ respuesta: string; socket: Socket }> {
  return new Promise((listo) => {
    const s = connect(puerto, "127.0.0.1");
    let junto = "";
    let mandado = false;
    s.on("data", (d) => {
      junto += d.toString();
      if (despues && !mandado && junto.includes("200 Connection Established")) {
        mandado = true;
        s.write(despues);
        return;
      }
      if (junto.includes(hasta) && (!despues || mandado)) listo({ respuesta: junto, socket: s });
    });
    s.on("close", () => listo({ respuesta: junto, socket: s }));
    s.write(texto);
  });
}

const basica = (token: string) => `Proxy-Authorization: Basic ${Buffer.from(`dolphin:${token}`).toString("base64")}\r\n`;

describe("la lista de hosts", () => {
  it("cada motor trae lo suyo, más lo del repo, y nada de comodines implícitos", () => {
    expect(hostsPermitidos("claude", ["registry.npmjs.org"])).toEqual(["api.anthropic.com", "platform.claude.com", "registry.npmjs.org"]);
    expect(hostsPermitidos("codex")).toContain("api.openai.com");
    expect(hostsPermitidos("otro", ["Mio.Example.com"])).toEqual(["mio.example.com"]);
    expect(hostPermitido("api.anthropic.com", ["api.anthropic.com"])).toBe(true);
    expect(hostPermitido("evil.api.anthropic.com", ["api.anthropic.com"])).toBe(false);
    expect(hostPermitido("api.anthropic.com.evil.io", ["api.anthropic.com"])).toBe(false);
    expect(hostPermitido("o1.ingest.sentry.io", ["*.sentry.io"])).toBe(true);
    expect(hostPermitido("sentry.io", ["*.sentry.io"])).toBe(false);
  });

  it("el destino de un CONNECT se entiende o no se usa", () => {
    expect(destinoDelConnect("api.anthropic.com:443")).toEqual({ host: "api.anthropic.com", puerto: 443 });
    expect(destinoDelConnect("[::1]:443")).toEqual({ host: "::1", puerto: 443 });
    expect(destinoDelConnect("api.anthropic.com")).toBeNull();
    expect(destinoDelConnect("x:99999")).toBeNull();
  });
});

describe("el proxy de salida", () => {
  it("a un host de la lista le abre el túnel, y lo que viaja llega tal cual", async () => {
    const api = await servidorFalso();
    const anotado: string[] = [];
    proxy = await abrirProxySalida({ permitidos: ["api.anthropic.com"], token: "t0k", anotar: (l) => anotado.push(l), conectar: () => connect(api, "127.0.0.1") });
    const { respuesta, socket } = await pedir(proxy.puerto, `CONNECT api.anthropic.com:443 HTTP/1.1\r\nHost: api.anthropic.com:443\r\n${basica("t0k")}\r\n`, "HOLA", "hola");
    socket.destroy();
    expect(respuesta).toContain("200 Connection Established");
    expect(respuesta).toContain("HOLA");
    expect(anotado.some((l) => l.includes("permitido CONNECT api.anthropic.com:443"))).toBe(true);
  });

  it("a cualquier otro host, 403 y queda anotado adónde quiso ir", async () => {
    const api = await servidorFalso();
    const anotado: string[] = [];
    let conecto = false;
    proxy = await abrirProxySalida({
      permitidos: ["api.anthropic.com"],
      anotar: (l) => anotado.push(l),
      conectar: () => {
        conecto = true;
        return connect(api, "127.0.0.1");
      },
    });
    const { respuesta } = await pedir(proxy.puerto, "CONNECT pastebin.com:443 HTTP/1.1\r\nHost: pastebin.com:443\r\n\r\n");
    expect(respuesta).toMatch(/^HTTP\/1\.1 403/);
    expect(conecto).toBe(false);
    expect(anotado.join("\n")).toMatch(/rechazado CONNECT pastebin\.com:443 \(host fuera de la lista\)/);
  });

  it("un host de la lista en otro puerto, o una IP suelta, tampoco", async () => {
    const anotado: string[] = [];
    proxy = await abrirProxySalida({ permitidos: ["api.anthropic.com"], anotar: (l) => anotado.push(l) });
    expect((await pedir(proxy.puerto, "CONNECT api.anthropic.com:22 HTTP/1.1\r\n\r\n")).respuesta).toMatch(/^HTTP\/1\.1 403/);
    expect((await pedir(proxy.puerto, "CONNECT 1.2.3.4:443 HTTP/1.1\r\n\r\n")).respuesta).toMatch(/^HTTP\/1\.1 403/);
    expect(anotado.join("\n")).toContain("puerto 22 fuera de la lista");
    expect(anotado.join("\n")).toContain("una IP suelta");
  });

  it("sin el token del proxy, 407: otro proceso de la máquina no lo usa de puerta", async () => {
    proxy = await abrirProxySalida({ permitidos: ["api.anthropic.com"], token: "t0k" });
    expect((await pedir(proxy.puerto, "CONNECT api.anthropic.com:443 HTTP/1.1\r\n\r\n")).respuesta).toMatch(/^HTTP\/1\.1 407/);
    expect((await pedir(proxy.puerto, `CONNECT api.anthropic.com:443 HTTP/1.1\r\n${basica("otro")}\r\n`)).respuesta).toMatch(/^HTTP\/1\.1 407/);
  });

  it("HTTP en claro no pasa: 403 y anotado", async () => {
    const anotado: string[] = [];
    proxy = await abrirProxySalida({ permitidos: ["api.anthropic.com"], anotar: (l) => anotado.push(l) });
    const { respuesta } = await pedir(proxy.puerto, "GET http://api.anthropic.com/v1 HTTP/1.1\r\nHost: api.anthropic.com\r\n\r\n");
    expect(respuesta).toMatch(/^HTTP\/1\.1 403/);
    expect(anotado.join("\n")).toContain("solo se sale por HTTPS");
  });

  it("si el host permitido no contesta, el agente recibe un 502 y no un corte mudo", async () => {
    const api = await servidorFalso();
    await new Promise<void>((listo) => falso!.close(() => listo()));
    falso = undefined;
    proxy = await abrirProxySalida({ permitidos: ["api.anthropic.com"], conectar: () => connect(api, "127.0.0.1") });
    expect((await pedir(proxy.puerto, "CONNECT api.anthropic.com:443 HTTP/1.1\r\n\r\n")).respuesta).toMatch(/^HTTP\/1\.1 502/);
  });
});
