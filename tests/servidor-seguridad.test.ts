import { execFile } from "node:child_process";
import { appendFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { promisify } from "node:util";
import type { IncomingMessage } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { crearServidor } from "../src/servidor.js";
import { hostLocal, leerCuerpo } from "../src/servidor-comun.js";
import { carpetaDeDolphin } from "../src/nucleo/escritura.js";
import { leerDiff } from "../src/nucleo/diff.js";
import { leerPolitica, POLITICA_POR_DEFECTO } from "../src/nucleo/politica.js";

/**
 * Lo que encontró la revisión del 22/10 en el servidor, cada cosa con su
 * caso: el Host en todo pedido, el cuerpo leído de una vez, un video roto
 * que no tira el proceso, el canal en vivo que no pierde una línea a medio
 * escribir, el diff que no toca el índice y la política de un repo ajeno.
 */

const correr = promisify(execFile);

/** Un GET con el Host que uno quiera: fetch no deja cambiarlo, y es justo lo que manda un dominio ajeno. */
function pedirCon(puerto: number, ruta: string, host: string): Promise<{ status: number; cuerpo: string }> {
  return new Promise((listo, fallar) => {
    const req = request({ host: "127.0.0.1", port: puerto, path: ruta, headers: { host } }, (res) => {
      let cuerpo = "";
      res.setEncoding("utf8");
      res.on("data", (t) => (cuerpo += t));
      res.on("end", () => listo({ status: res.statusCode ?? 0, cuerpo }));
    });
    req.on("error", fallar);
    req.end();
  });
}

describe("quién puede preguntar", () => {
  it("solo los nombres de esta máquina, con cualquier puerto", () => {
    const con = (host: string) => ({ headers: { host } }) as unknown as IncomingMessage;
    expect(hostLocal(con("127.0.0.1:4800"))).toBe(true);
    expect(hostLocal(con("localhost:51234"))).toBe(true);
    expect(hostLocal(con("[::1]:80"))).toBe(true);
    expect(hostLocal(con("rebind.example:4800"))).toBe(false);
    expect(hostLocal(con("127.0.0.1.rebind.example"))).toBe(false);
    expect(hostLocal({ headers: {} } as unknown as IncomingMessage)).toBe(false);
  });
});

describe("el cuerpo de un pedido", () => {
  it("una «ñ» partida entre dos pedazos llega entera", async () => {
    const texto = Buffer.from(JSON.stringify({ perfil: "año compañía ñandú" }), "utf8");
    const corte = texto.indexOf(Buffer.from("ñ", "utf8")) + 1; // en el medio de la «ñ»
    const pedido = Readable.from([texto.subarray(0, corte), texto.subarray(corte)]) as unknown as IncomingMessage;
    expect(JSON.parse((await leerCuerpo(pedido, 10_000))!)).toEqual({ perfil: "año compañía ñandú" });
  });

  it("si pasa el tope, null", async () => {
    const pedido = Readable.from([Buffer.alloc(600), Buffer.alloc(600)]) as unknown as IncomingMessage;
    expect(await leerCuerpo(pedido, 1000)).toBeNull();
  });
});

describe("el servidor, contra lo que no es de esta máquina", () => {
  let repo = "";
  let servidor: ReturnType<typeof crearServidor>;
  let puerto = 0;

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-seguridad-"));
    servidor = crearServidor({ repo, calendario: false });
    await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", listo));
    puerto = (servidor.address() as { port: number }).port;
  });

  afterEach(async () => {
    servidor.closeAllConnections?.();
    await new Promise((listo) => servidor.close(listo));
    await borrarCarpeta(repo);
  });

  it("un GET con un Host ajeno no lee nada: ni la página con el pase ni los datos", async () => {
    for (const ruta of ["/", "/api/cosecha", "/api/memoria", "/api/diff?u=u1", "/en-vivo"]) {
      const r = await pedirCon(puerto, ruta, `rebind.example:${puerto}`);
      expect(r.status, ruta).toBe(403);
      expect(r.cuerpo).not.toContain("dolphin-token");
    }
    // El de esta máquina, igual que siempre.
    expect((await pedirCon(puerto, "/api/cosecha", `127.0.0.1:${puerto}`)).status).toBe(200);
  });

  it("un directorio con nombre de video da 404 y el servidor sigue vivo", async () => {
    await mkdir(join(repo, ".dolphin", "videos", "x.webm"), { recursive: true });
    expect((await fetch(`http://127.0.0.1:${puerto}/videos/x.webm`)).status).toBe(404);
    expect((await fetch(`http://127.0.0.1:${puerto}/api/cosecha`)).status).toBe(200);
  });

  it("el canal en vivo no pierde una línea que se escribió en dos tandas", async () => {
    await carpetaDeDolphin(repo);
    const archivo = join(repo, ".dolphin", "en-vivo.jsonl");
    await writeFile(archivo, "");
    const control = new AbortController();
    const respuesta = await fetch(`http://127.0.0.1:${puerto}/en-vivo`, { signal: control.signal });
    const lector = respuesta.body!.getReader();
    const decodificador = new TextDecoder();

    const linea = JSON.stringify({ t: Date.now(), tipo: "prueba", texto: "año" });
    await appendFile(archivo, linea.slice(0, 10));
    await new Promise((r) => setTimeout(r, 1000)); // más que el reloj del canal (700 ms)
    await appendFile(archivo, `${linea.slice(10)}\n`);

    let leido = "";
    while (!/data: .*\n\n/.test(leido)) {
      const { value, done } = await lector.read();
      if (done) break;
      leido += decodificador.decode(value, { stream: true });
    }
    control.abort();
    const eventos = [...leido.matchAll(/^data: (.*)$/gm)].map((m) => m[1]!);
    expect(eventos).toEqual([linea]);
  });
});

describe("lo que el servidor lee no escribe", () => {
  let repo = "";
  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-indice-"));
    await correr("git", ["init", "-q"], { cwd: repo });
    await correr("git", ["config", "user.email", "nico@ejemplo.com"], { cwd: repo });
    await correr("git", ["config", "user.name", "Nico"], { cwd: repo });
    await writeFile(join(repo, "a.txt"), "uno\n");
    await correr("git", ["add", "-A"], { cwd: repo });
    await correr("git", ["commit", "-qm", "base"], { cwd: repo });
  });
  afterEach(async () => {
    await borrarCarpeta(repo);
  });

  it("el diff muestra un archivo nuevo sin marcarlo en el índice de verdad", async () => {
    await writeFile(join(repo, "notas-privadas.txt"), "no es para commitear\n");
    const diff = await leerDiff(repo);
    expect(diff.texto).toContain("notas-privadas.txt");
    // Sigue sin seguir: un `git commit -am` no se lo lleva.
    const { stdout } = await correr("git", ["status", "--porcelain"], { cwd: repo });
    expect(stdout).toContain("?? notas-privadas.txt");
  });
});

describe("la carpeta de Dolphin y la política de un repo ajeno", () => {
  let repo = "";
  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-carpeta-"));
  });
  afterEach(async () => {
    await borrarCarpeta(repo);
  });

  it("nace ignorada desde el primer archivo, y un .gitignore que ya estaba no se pisa", async () => {
    await carpetaDeDolphin(repo, "videos");
    expect(await readFile(join(repo, ".dolphin", ".gitignore"), "utf8")).toBe("*\n");
    await writeFile(join(repo, ".dolphin", ".gitignore"), "*\n!PERFIL.md\n");
    await carpetaDeDolphin(repo);
    expect(await readFile(join(repo, ".dolphin", ".gitignore"), "utf8")).toBe("*\n!PERFIL.md\n");
  });

  it("un repo de afuera no puede aflojar la política: lo suyo solo suma", async () => {
    await writeFile(join(repo, "dolphin.config.json"), JSON.stringify({ politica: { comandosProhibidos: [], archivosProhibidos: ["secretos/**"] } }));
    const propia = await leerPolitica(repo);
    expect(propia.comandosProhibidos).toEqual([]); // en un repo tuyo, decidís vos
    const ajena = await leerPolitica(repo, { deAfuera: true });
    expect(ajena.comandosProhibidos).toEqual(POLITICA_POR_DEFECTO.comandosProhibidos);
    expect(ajena.archivosProhibidos).toEqual([...POLITICA_POR_DEFECTO.archivosProhibidos, "secretos/**"]);
  });
});
