import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { levantarApp } from "../src/tester/levantar.js";
import { puertoLibre } from "../src/nucleo/puertos.js";

/**
 * Levantar la app de una rama: arranca, espera a que conteste, dice qué
 * pasó si no levanta, y al apagarla no queda nada escuchando.
 */

describe("levantar la app de una rama", () => {
  let carpeta = "";

  beforeEach(async () => {
    carpeta = await mkdtemp(join(tmpdir(), "dolphin-levantar-"));
    // Un servidor de verdad, que tarda un poco en arrancar como cualquier dev server.
    await writeFile(
      join(carpeta, "servidor.mjs"),
      `import http from "node:http";
setTimeout(() => http.createServer((q, r) => r.end("hola " + process.env.PORT)).listen(Number(process.env.PORT), "127.0.0.1"), 300);
`,
    );
  });

  afterEach(async () => {
    // Con reintentos: en Windows, recién matado el árbol, el sistema tarda un momento
    // en soltar la carpeta del proceso (EBUSY), y más con la máquina cargada.
    await rm(carpeta, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  });

  it("la levanta en su puerto, con {PUERTO} reemplazado, y al apagarla deja de contestar", async () => {
    const puerto = await puertoLibre();
    const app = await levantarApp({ comando: "node servidor.mjs", url: "http://127.0.0.1:{PUERTO}/", cwd: carpeta, puerto });
    expect(app.url).toBe(`http://127.0.0.1:${puerto}/`);
    expect(await (await fetch(app.url)).text()).toBe(`hola ${puerto}`);

    await app.detener();
    await expect(fetch(app.url, { signal: AbortSignal.timeout(1500) })).rejects.toThrow();
  }, 20_000);

  it("si se cierra sin contestar, dice con qué código y qué escribió", async () => {
    await writeFile(join(carpeta, "roto.mjs"), 'console.error("falta la variable DATABASE_URL"); process.exit(3);\n');
    const puerto = await puertoLibre();
    await expect(levantarApp({ comando: "node roto.mjs", url: "http://127.0.0.1:{PUERTO}/", cwd: carpeta, puerto })).rejects.toThrow(
      /se cerró antes de contestar \(código 3\)[\s\S]*DATABASE_URL/,
    );
  }, 20_000);

  it("si nunca contesta, se rinde a tiempo y no deja el proceso colgado", async () => {
    await writeFile(join(carpeta, "mudo.mjs"), "setInterval(() => {}, 1000);\n");
    const puerto = await puertoLibre();
    const desde = Date.now();
    await expect(levantarApp({ comando: "node mudo.mjs", url: "http://127.0.0.1:{PUERTO}/", cwd: carpeta, puerto, esperaMs: 1200 })).rejects.toThrow(
      /no contestó en 1 s/,
    );
    expect(Date.now() - desde).toBeLessThan(8000);
  }, 20_000);
});
