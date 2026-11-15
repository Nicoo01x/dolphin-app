import { EventEmitter } from "node:events";
import { request as httpRequest } from "node:http";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import type { ChildProcess } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comoEntra, cookieDelPase, hostLocal, mismoPase, paseDelPedido, sinElPase } from "../src/nucleo/puerta.js";
import {
  abrirTunel,
  argumentosDeCloudflared,
  destinoDelTunel,
  direccionDelTunel,
  SIN_CLOUDFLARED,
  urlDeLaSalida,
} from "../src/nucleo/tunel.js";
import { crearServidor } from "../src/servidor.js";
import { borrarCarpeta } from "./ayuda/borrar.js";

/**
 * La consola abierta al teléfono por un túnel.
 *
 * Es el único camino por el que la consola deja de ser «solo esta máquina», así que lo que se
 * prueba acá es lo que la mantiene cerrada: que el host del túnel sea UNO y no cualquiera, que de
 * afuera no se vea nada sin el pase, que el pase no se quede en la dirección, y que lo que escribe
 * siga pidiendo la cabecera (la cookie sola no alcanza, o cualquier sitio haría CSRF).
 */

const TUNEL = "pelicano-azul-9f3.trycloudflare.com";
const PASE = "a".repeat(32);

const pedidoDe = (host: string, cabeceras: Record<string, string> = {}) =>
  ({ headers: { host, ...cabeceras }, url: "/", method: "GET" }) as never;

describe("la puerta", () => {
  it("de esta máquina se entra como siempre, sin pase", () => {
    for (const host of ["127.0.0.1:4700", "localhost:4700", "[::1]:4700"]) {
      expect(hostLocal(pedidoDe(host))).toBe(true);
      expect(comoEntra(pedidoDe(host), new URL("http://local/"), { pase: PASE }).como).toBe("local");
    }
  });

  it("un dominio ajeno que resuelve a esta máquina no entra, con túnel o sin él", () => {
    // El DNS rebinding de siempre: el Host trae SU nombre.
    expect(comoEntra(pedidoDe("maligno.com"), new URL("http://local/"), { pase: PASE }).como).toBe("ajeno");
    expect(comoEntra(pedidoDe("maligno.com"), new URL("http://local/?pase=" + PASE), { pase: PASE, hostDeAfuera: TUNEL }).como).toBe("ajeno");
    // Y otro túnel de Cloudflare que no es el nuestro tampoco: el host permitido es UNO.
    expect(comoEntra(pedidoDe("otro.trycloudflare.com"), new URL("http://local/"), { pase: PASE, hostDeAfuera: TUNEL }).como).toBe("ajeno");
  });

  it("sin túnel abierto, nada de afuera entra aunque traiga el pase", () => {
    expect(comoEntra(pedidoDe(TUNEL), new URL(`http://local/?pase=${PASE}`), { pase: PASE }).como).toBe("ajeno");
  });

  it("por el túnel: sin pase no se ve nada, con pase se entra", () => {
    const puerta = { pase: PASE, hostDeAfuera: TUNEL };
    expect(comoEntra(pedidoDe(TUNEL), new URL("http://local/"), puerta).como).toBe("sin-pase");
    expect(comoEntra(pedidoDe(TUNEL), new URL(`http://local/?pase=${PASE}`), puerta).como).toBe("de-afuera");
    expect(comoEntra(pedidoDe(TUNEL, { cookie: `dolphin_pase=${PASE}` }), new URL("http://local/"), puerta).como).toBe("de-afuera");
    expect(comoEntra(pedidoDe(TUNEL, { "x-dolphin-token": PASE }), new URL("http://local/"), puerta).como).toBe("de-afuera");
    // Un pase parecido no es el pase.
    expect(comoEntra(pedidoDe(TUNEL), new URL(`http://local/?pase=${"a".repeat(31)}b`), puerta).como).toBe("sin-pase");
  });

  it("el pase se lee de la cookie aunque vengan otras al lado", () => {
    const pedido = pedidoDe(TUNEL, { cookie: `tema=oscuro; dolphin_pase=${PASE}; otra=1` });
    expect(paseDelPedido(pedido, new URL("http://local/"))).toBe(PASE);
  });

  it("la cookie no la puede leer un script ni viaja desde otro sitio", () => {
    const cookie = cookieDelPase(PASE);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Strict");
  });

  it("después de entrar, el pase sale de la dirección y lo demás queda igual", () => {
    expect(sinElPase(new URL(`http://x/tablero?pase=${PASE}&p=mi-repo#t1`))).toBe("/tablero?p=mi-repo#t1");
  });

  it("comparar el pase no filtra por cuánto tardó", () => {
    expect(mismoPase(PASE, PASE)).toBe(true);
    expect(mismoPase("a".repeat(31), PASE)).toBe(false);
    expect(mismoPase(undefined, PASE)).toBe(false);
  });
});

describe("leer la dirección de cloudflared", () => {
  it("la encuentra en el log, que es donde la escribe", () => {
    const log = `2026-11-01T05:00:00Z INF +----------------------------------------+
2026-11-01T05:00:00Z INF |  https://pelicano-azul-9f3.trycloudflare.com  |
2026-11-01T05:00:00Z INF +----------------------------------------+`;
    expect(urlDeLaSalida(log)).toBe("https://pelicano-azul-9f3.trycloudflare.com");
  });

  it("sin dirección no inventa una", () => {
    expect(urlDeLaSalida("failed to connect")).toBeUndefined();
  });

  it("abre el túnel con el host listo para la puerta", async () => {
    const falso = () => {
      const proceso = new EventEmitter() as ChildProcess & EventEmitter;
      const stderr = new Readable({ read() {} });
      Object.assign(proceso, { stdout: new Readable({ read() {} }), stderr, kill: () => true });
      setTimeout(() => stderr.push("INF |  https://pelicano-azul-9f3.trycloudflare.com  |\n"), 10);
      return proceso;
    };
    const tunel = await abrirTunel(4700, { lanzar: falso, esperaMs: 3000 });
    expect(tunel.host).toBe(TUNEL);
    await tunel.detener();
  });

  it("sin cloudflared, el error dice cómo instalarlo en cada sistema", async () => {
    // El camino más común la primera vez. No se lanza nada: el lanzador falla como lo haría el de
    // verdad cuando `prepararComando` no encuentra el binario.
    await expect(
      abrirTunel(4700, {
        lanzar: () => {
          throw new Error(SIN_CLOUDFLARED);
        },
      }),
    ).rejects.toThrow(/winget|brew/);
  });

  it("con nombre y host, lanza el túnel registrado y no el del azar", () => {
    const destino = destinoDelTunel({ nombre: "dolphin", host: "Nico.Dolphin.TECH" });
    expect(destino).toEqual({ tipo: "con-nombre", nombre: "dolphin", host: "nico.dolphin.tech" });
    expect(argumentosDeCloudflared(4700, destino)).toEqual([
      "tunnel",
      "--no-autoupdate",
      "run",
      "--url",
      "http://127.0.0.1:4700",
      "dolphin",
    ]);
  });

  it("sin nada configurado sigue siendo el de siempre", () => {
    const destino = destinoDelTunel({});
    expect(destino).toEqual({ tipo: "al-azar" });
    expect(argumentosDeCloudflared(4700, destino)).toEqual([
      "tunnel",
      "--no-autoupdate",
      "--url",
      "http://127.0.0.1:4700",
    ]);
  });

  it("con una sola de las dos falla: un túnel que nadie puede alcanzar", () => {
    // Caer al quick tunnel en silencio daría una dirección al azar cuando se pidió la propia, y
    // eso se descubre leyendo el link.
    expect(() => destinoDelTunel({ nombre: "dolphin" })).toThrow(/las dos cosas/);
    expect(() => destinoDelTunel({ host: "nico.dolphin.tech" })).toThrow(/las dos cosas/);
  });

  it("el túnel con nombre no da su dirección hasta que la conexión quedó registrada", () => {
    const destino = destinoDelTunel({ nombre: "dolphin", host: "nico.dolphin.tech" });
    // Arrancando: el host ya se sabe, pero el link todavía no contesta.
    expect(direccionDelTunel("INF Starting tunnel", destino)).toBeUndefined();
    for (const log of [
      "INF Registered tunnel connection connIndex=0",
      "INF Connection 0f3a1b2c-1111-4222-8333-444455556666 registered connIndex=1",
    ]) {
      expect(direccionDelTunel(log, destino)).toBe("https://nico.dolphin.tech");
    }
  });

  it("abre el túnel con nombre en cuanto conecta", async () => {
    const falso = () => {
      const proceso = new EventEmitter() as ChildProcess & EventEmitter;
      const stderr = new Readable({ read() {} });
      Object.assign(proceso, { stdout: new Readable({ read() {} }), stderr, kill: () => true });
      setTimeout(() => stderr.push("INF Registered tunnel connection connIndex=0\n"), 10);
      return proceso;
    };
    const tunel = await abrirTunel(4700, {
      lanzar: falso,
      esperaMs: 3000,
      destino: { tipo: "con-nombre", nombre: "dolphin", host: "nico.dolphin.tech" },
    });
    expect(tunel.url).toBe("https://nico.dolphin.tech");
    expect(tunel.host).toBe("nico.dolphin.tech");
    await tunel.detener();
  });

  it("si cloudflared se cae, el error cuenta lo que escribió", async () => {
    const falso = () => {
      const proceso = new EventEmitter() as ChildProcess & EventEmitter;
      const stderr = new Readable({ read() {} });
      Object.assign(proceso, { stdout: new Readable({ read() {} }), stderr, kill: () => true });
      setTimeout(() => {
        stderr.push("ERR failed to request quick Tunnel: 503\n");
        proceso.emit("exit", 1);
      }, 10);
      return proceso;
    };
    await expect(abrirTunel(4700, { lanzar: falso, esperaMs: 3000 })).rejects.toThrow(/failed to request quick Tunnel/);
  });
});

describe("el servidor con el túnel abierto", () => {
  let repo = "";
  let base = "";
  let servidor: ReturnType<typeof crearServidor>;

  beforeAll(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-tunel-"));
    servidor = crearServidor({ repo, calendario: false, demo: true, token: PASE, hostDeAfuera: () => TUNEL });
    await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", listo));
    base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
  });

  afterAll(async () => {
    if (servidor) await new Promise((listo) => servidor.close(listo));
    if (repo) await borrarCarpeta(repo);
  });

  /**
   * Un pedido como el que llega por el túnel: Cloudflare pone SU host en el Host.
   *
   * Va con `node:http` y no con `fetch` a propósito: `Host` es una cabecera prohibida para fetch,
   * así que undici la descarta sin avisar y el pedido llega como local. Con eso, este archivo
   * entero pasaba sin probar nada.
   */
  const pedir = (ruta: string, opciones: { metodo?: string; host?: string; cabeceras?: Record<string, string>; cuerpo?: string } = {}) =>
    new Promise<{ estado: number; cabeceras: NodeJS.Dict<string | string[]>; cuerpo: string }>((listo, fallar) => {
      const url = new URL(`${base}${ruta}`);
      const pedido = httpRequest(
        {
          hostname: url.hostname,
          port: url.port,
          path: `${url.pathname}${url.search}`,
          method: opciones.metodo ?? "GET",
          headers: { host: opciones.host ?? TUNEL, ...(opciones.cabeceras ?? {}) },
        },
        (r) => {
          let cuerpo = "";
          r.setEncoding("utf8");
          r.on("data", (t: string) => (cuerpo += t));
          r.on("end", () => listo({ estado: r.statusCode ?? 0, cabeceras: r.headers, cuerpo }));
        },
      );
      pedido.on("error", fallar);
      if (opciones.cuerpo) pedido.write(opciones.cuerpo);
      pedido.end();
    });

  it("sin pase, ni la página ni los datos: una pantalla que lo pide", async () => {
    const pagina = await pedir("/");
    expect(pagina.estado).toBe(401);
    expect(pagina.cuerpo).toContain("pide el pase");

    const datos = await pedir("/api/tablero");
    expect(datos.estado).toBe(401);
    // Y lo que contesta no es el tablero: ni una tarjeta se filtra.
    expect(datos.cuerpo).not.toContain("tarjetas");
  });

  it("con el pase en la dirección entra, deja la cookie y saca el pase de la URL", async () => {
    const r = await pedir(`/?pase=${PASE}`);
    expect(r.estado).toBe(302);
    expect(r.cabeceras.location).toBe("/");
    expect(String(r.cabeceras["set-cookie"])).toContain("dolphin_pase=");
    expect(String(r.cabeceras["set-cookie"])).toContain("HttpOnly");
  });

  it("con la cookie ya puesta, los datos se leen", async () => {
    const r = await pedir("/api/tablero", { cabeceras: { cookie: `dolphin_pase=${PASE}` } });
    expect(r.estado).toBe(200);
    expect(JSON.parse(r.cuerpo)).toHaveProperty("tarjetas");
  });

  it("la cookie NO alcanza para escribir: eso pide la cabecera, que un sitio ajeno no puede leer", async () => {
    const soloCookie = await pedir("/api/tablero", {
      metodo: "POST",
      cabeceras: { cookie: `dolphin_pase=${PASE}`, "content-type": "application/json" },
      cuerpo: JSON.stringify({ titulo: "una tarjeta por CSRF" }),
    });
    expect(soloCookie.estado).toBe(403);

    const conCabecera = await pedir("/api/tablero", {
      metodo: "POST",
      cabeceras: { "x-dolphin-token": PASE, "content-type": "application/json" },
      cuerpo: JSON.stringify({ titulo: "una tarjeta desde el teléfono" }),
    });
    expect(conCabecera.estado).toBe(201);
  });

  it("otro host sigue siendo 403, no 401: no es que le falte el pase, es que no es para él", async () => {
    const r = await pedir(`/api/tablero?pase=${PASE}`, { host: "maligno.com" });
    expect(r.estado).toBe(403);
  });
});
