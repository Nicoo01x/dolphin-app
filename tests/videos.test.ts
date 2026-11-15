import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { crearServidor } from "../src/servidor.js";

/**
 * Los videos del explorador, con Range: sin el 206, el navegador no puede
 * saltar al segundo en que pasó un error.
 */
describe("los videos del explorador", () => {
  let repo = "";
  let servidor: ReturnType<typeof crearServidor>;
  let base = "";

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-videos-"));
    await mkdir(join(repo, ".dolphin", "videos"), { recursive: true });
    await writeFile(join(repo, ".dolphin", "videos", "page@abc123.webm"), Buffer.from("0123456789"));
    servidor = crearServidor({ repo, calendario: false });
    await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", listo));
    base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
  });

  afterEach(async () => {
    await new Promise((listo) => servidor.close(listo));
    await borrarCarpeta(repo);
  });

  it("entero, avisando que acepta rangos", async () => {
    const r = await fetch(`${base}/videos/page@abc123.webm`);
    expect(r.status).toBe(200);
    expect(r.headers.get("accept-ranges")).toBe("bytes");
    expect(r.headers.get("content-type")).toBe("video/webm");
    expect(await r.text()).toBe("0123456789");
  });

  it("un rango devuelve 206 con ese pedazo", async () => {
    const r = await fetch(`${base}/videos/page@abc123.webm`, { headers: { range: "bytes=2-5" } });
    expect(r.status).toBe(206);
    expect(r.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(await r.text()).toBe("2345");
  });

  it("un rango imposible es 416, y nada sale de la carpeta de videos", async () => {
    expect((await fetch(`${base}/videos/page@abc123.webm`, { headers: { range: "bytes=50-60" } })).status).toBe(416);
    expect((await fetch(`${base}/videos/..%2F..%2Fpackage.json`)).status).toBe(404);
    expect((await fetch(`${base}/videos/otro.webm`)).status).toBe(404);
  });
});
