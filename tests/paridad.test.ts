import { execFile } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { comparar, comprobar, diferencia, grabar, jsonNormalizado, textoVisible } from "../src/paridad.js";

/**
 * Migrar con paridad: grabar lo que contesta la app vieja y comprobar que la nueva contesta igual,
 * con servidores de verdad. El comando sale en 0 o en 1: es lo que necesita un oráculo de /objetivo.
 */

let carpeta = "";
const servidores: Server[] = [];

beforeEach(async () => {
  carpeta = await mkdtemp(join(tmpdir(), "dolphin-paridad-"));
});
afterEach(async () => {
  await Promise.all(servidores.splice(0).map((s) => new Promise((r) => s.close(r))));
  await borrarCarpeta(carpeta);
});

/** Una app de mentira que contesta lo que le digas por ruta. */
async function app(rutas: Record<string, { tipo: string; cuerpo: string; estado?: number }>): Promise<string> {
  const s = createServer((req, res) => {
    const r = rutas[req.url ?? "/"];
    if (!r) return res.writeHead(404).end("no");
    res.writeHead(r.estado ?? 200, { "content-type": r.tipo }).end(r.cuerpo);
  });
  servidores.push(s);
  await new Promise<void>((listo) => s.listen(0, "127.0.0.1", () => listo()));
  const puerto = (s.address() as { port: number }).port;
  return `http://127.0.0.1:${puerto}/`;
}

const vieja = () =>
  app({
    "/": { tipo: "text/html", cuerpo: "<html><head><style>p{}</style><script>x()</script></head><body><h1>Pedidos</h1><p>2 pendientes</p></body></html>" },
    "/api/pedidos": { tipo: "application/json", cuerpo: JSON.stringify({ fecha: "2026-10-27", pedidos: [{ id: 1, total: 100 }, { id: 2, total: 200 }] }) },
  });

describe("lo que se compara", () => {
  it("el JSON con las claves en orden y sin lo que cambia solo; la página por lo que se ve", () => {
    expect(jsonNormalizado({ b: 1, fecha: "x", a: [{ z: 1, id: 9, y: 2 }] }, new Set(["fecha", "id"]))).toEqual({ a: [{ y: 2, z: 1 }], b: 1 });
    expect(textoVisible("<style>.a{}</style><h1>Hola &amp; chau</h1>\n<script>alert(1)</script><p> mundo </p>")).toBe("Hola & chau mundo");
    expect(diferencia({ estado: 200, tipo: "json", cuerpo: '{"a":[1,2]}' }, { estado: 200, tipo: "json", cuerpo: '{"a":[1,3]}' })).toBe("el JSON cambió: a.1: antes 2, ahora 3");
    expect(diferencia({ estado: 200, tipo: "texto", cuerpo: "x" }, { estado: 404, tipo: "texto", cuerpo: "x" })).toBe("contestaba 200 y ahora 404");
  });
});

describe("grabar y comprobar", () => {
  it("la nueva que contesta igual (otro orden, otra fecha) pasa; la que cambia un total no", async () => {
    const { archivo, grabacion } = await grabar(carpeta, { url: await vieja(), rutas: ["/", "/api/pedidos"], ignorar: ["fecha"] });
    expect(archivo).toMatch(/paridad[\\/]app\.json$/);
    expect(grabacion.rutas["/"]).toEqual({ estado: 200, tipo: "texto", cuerpo: "Pedidos 2 pendientes" });

    const igual = await app({
      "/": { tipo: "text/html; charset=utf-8", cuerpo: "<main><h1>Pedidos</h1>\n  <p>2 pendientes</p></main>" },
      "/api/pedidos": { tipo: "application/json", cuerpo: JSON.stringify({ pedidos: [{ total: 100, id: 1 }, { total: 200, id: 2 }], fecha: "2026-10-28" }) },
    });
    expect(await comparar(grabacion, igual)).toEqual([]);

    const distinta = await app({
      "/": { tipo: "text/html", cuerpo: "<h1>Pedidos</h1><p>2 pendientes</p>" },
      "/api/pedidos": { tipo: "application/json", cuerpo: JSON.stringify({ pedidos: [{ id: 1, total: 100 }, { id: 2, total: 250 }] }) },
    });
    expect(await comparar(grabacion, distinta)).toEqual([{ ruta: "/api/pedidos", que: "el JSON cambió: pedidos.1.total: antes 200, ahora 250" }]);
  });

  it("comprobar levanta la app nueva de la carpeta con su comando y la compara", async () => {
    const { archivo } = await grabar(carpeta, { url: await vieja(), rutas: ["/api/pedidos"], ignorar: ["fecha"] });
    const nueva = join(carpeta, "nueva");
    await import("node:fs/promises").then((fs) => fs.mkdir(nueva));
    await writeFile(
      join(nueva, "servidor.mjs"),
      `import { createServer } from "node:http";
createServer((q, r) => r.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ pedidos: [{ id: 1, total: 100 }, { id: 2, total: 200 }] }))).listen(Number(process.env.PORT), "127.0.0.1");`,
    );
    const r = await comprobar({ grabacion: archivo, cwd: nueva, levantar: "node servidor.mjs", url: "http://127.0.0.1:{PUERTO}/api/pedidos" });
    expect(r).toEqual({ diferencias: [], total: 1 });
  }, 30_000);

  it("el comando sale en 0 si contesta igual y en 1 si no: sirve de oráculo", async () => {
    const { archivo } = await grabar(carpeta, { url: await vieja(), rutas: ["/api/pedidos"], ignorar: ["fecha"] });
    const raiz = resolve(import.meta.dirname, "..");
    const correr = (url: string) =>
      new Promise<{ codigo: number; salida: string }>((listo) =>
        execFile(process.execPath, ["--import", "tsx", join(raiz, "src", "dolphin.ts"), "paridad", "comprobar", "--grabacion", archivo, "--url", url], { cwd: raiz, windowsHide: true }, (error, stdout) =>
          listo({ codigo: error ? ((error as { code?: number }).code ?? 1) : 0, salida: stdout }),
        ),
      );
    const bien = await correr(await vieja());
    expect(bien).toMatchObject({ codigo: 0 });
    expect(bien.salida).toContain("paridad: las 1 ruta(s) contestan igual que antes");
    const mal = await correr(await app({ "/api/pedidos": { tipo: "application/json", cuerpo: '{"pedidos":[]}' } }));
    expect(mal.codigo).toBe(1);
    expect(mal.salida).toContain("/api/pedidos: el JSON cambió: pedidos tenía 2 elementos y ahora 0");
  }, 60_000);
});
