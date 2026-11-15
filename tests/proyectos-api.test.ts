import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { crearServidor } from "../src/servidor.js";
import { guardarCosecha } from "../src/nucleo/archivo.js";
import { idDe } from "../src/nucleo/proyectos.js";
import type { Cosecha } from "../src/nucleo/tipos.js";

/**
 * Varios proyectos en una sola consola: la lista, cambiar con `?p=` sin
 * reiniciar el servidor, sumar uno, y lo que no se puede (un proyecto que no
 * está, sacar el del arranque, clonar algo que no es una URL de repo).
 */

const correr = promisify(execFile);

async function repoCon(carpeta: string, tarea: string, archivos: Record<string, string> = {}) {
  await mkdir(carpeta, { recursive: true });
  await writeFile(join(carpeta, "leeme.md"), "hola\n");
  for (const [ruta, contenido] of Object.entries(archivos)) {
    await mkdir(join(carpeta, ruta, ".."), { recursive: true });
    await writeFile(join(carpeta, ruta), contenido);
  }
  for (const args of [["init", "-q", "-b", "main"], ["add", "-A"], ["-c", "user.email=n@n", "-c", "user.name=n", "commit", "-qm", "base"]]) {
    await correr("git", args, { cwd: carpeta, windowsHide: true });
  }
  const cosecha: Cosecha = { tarea, candidatos: [], gastado: 0, muertosGratis: 0, ms: 1 };
  await guardarCosecha(cosecha, carpeta);
}

describe("varios proyectos en una consola", () => {
  let base = "";
  let tienda = "";
  let blog = "";
  let servidor: ReturnType<typeof crearServidor>;
  let url = "";

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), "dolphin-proyectos-api-"));
    tienda = join(base, "tienda");
    blog = join(base, "blog");
    await repoCon(tienda, "Arreglá el carrito", { "public/favicon.svg": "<svg xmlns='http://www.w3.org/2000/svg'/>" });
    await repoCon(blog, "Sumá el RSS");
    servidor = crearServidor({ repo: tienda, calendario: false, proyectos: { hogar: join(base, "hogar") } });
    await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", listo));
    url = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
  });

  afterEach(async () => {
    await new Promise((listo) => servidor.close(listo));
    await borrarCarpeta(base);
  });

  const pase = async () => /name="dolphin-token" content="([0-9a-f]+)"/.exec(await (await fetch(`${url}/`)).text())?.[1];
  const mandar = (cuerpo: unknown, token?: string) =>
    fetch(`${url}/api/proyectos`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { "x-dolphin-token": token } : {}) },
      body: JSON.stringify(cuerpo),
    });
  const lista = async () => (await (await fetch(`${url}/api/proyectos`)).json()) as { delArranque: string; proyectos: { id: string; nombre: string; logo?: string; ultima?: { tarea: string } }[] };

  it("el del arranque entra solo, con su logo y su última siembra", async () => {
    const r = await lista();
    expect(r.delArranque).toBe(idDe(tienda));
    expect(r.proyectos).toMatchObject([{ id: idDe(tienda), nombre: "tienda", ultima: { tarea: "Arreglá el carrito" } }]);
    const logo = await fetch(`${url}${r.proyectos[0]!.logo}`);
    expect(logo.status).toBe(200);
    expect(logo.headers.get("content-type")).toBe("image/svg+xml");
  });

  it("sumar otro y cambiar de proyecto con ?p= sin reiniciar: cada uno con lo suyo", async () => {
    const token = await pase();
    if (!token) return;
    expect((await mandar({ accion: "sumar", ruta: blog })).status).toBe(403);
    const r = await mandar({ accion: "sumar", ruta: blog }, token);
    expect(r.status).toBe(201);
    const { proyecto } = await r.json();

    const deLaTienda = await (await fetch(`${url}/api/historial`)).json();
    const delBlog = await (await fetch(`${url}/api/historial?p=${proyecto.id}`)).json();
    expect(deLaTienda.cosechas.map((c: { tarea: string }) => c.tarea)).toEqual(["Arreglá el carrito"]);
    expect(delBlog.cosechas.map((c: { tarea: string }) => c.tarea)).toEqual(["Sumá el RSS"]);
    expect((await (await fetch(`${url}/api/cosecha?p=${proyecto.id}`)).json()).repo).toBe(blog);
  });

  it("lo que no se puede: un proyecto que no está, sacar el del arranque, clonar algo que no es un repo", async () => {
    expect((await fetch(`${url}/api/historial?p=noexiste`)).status).toBe(404);
    // La página se sirve igual: es la pantalla la que cuenta qué pasó.
    expect((await fetch(`${url}/?p=noexiste`)).status).toBe(200);

    const token = await pase();
    if (!token) return;
    expect((await mandar({ accion: "quitar", id: idDe(tienda) }, token)).status).toBe(409);
    const clon = await mandar({ accion: "clonar", url: "--upload-pack=calc" }, token);
    expect(clon.status).toBe(422);
    expect((await clon.json()).porQue).toContain("no parece la URL de un repo");
  });

  it("un servidor de un solo repo no tiene lista de proyectos (ni toca ~/.dolphin), y lo dice sin un 404", async () => {
    const solo = crearServidor({ repo: tienda, calendario: false });
    await new Promise<void>((listo) => solo.listen(0, "127.0.0.1", listo));
    try {
      const base = `http://127.0.0.1:${(solo.address() as { port: number }).port}`;
      const r = await fetch(`${base}/api/proyectos`);
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ solo: true, delArranque: null, proyectos: [] });
      // Sumar sí necesita la lista.
      expect((await fetch(`${base}/api/proyectos`, { method: "POST", body: "{}" })).status).toBe(404);
    } finally {
      await new Promise((listo) => solo.close(listo));
    }
  });
});
