import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { git } from "../src/nucleo/git.js";
import { abrirPreviewDeRama, SIN_PANTALLA } from "../src/nucleo/preview-de-rama.js";
import { cerrarPreview, cerrarTodosLosPreviews, previewsAbiertos, servirPreview } from "../src/nucleo/preview.js";
import { crearServidor } from "../src/servidor.js";
import { borrarCarpeta } from "./ayuda/borrar.js";

/**
 * El preview de una rama, de punta a punta: el worktree de la rama commiteada, la app levantada
 * con el comando del repo, y la pantalla servida por el origen de la consola con el inspector
 * adentro. Lo que prueba este archivo es que el camino entero existe; la lógica del proxy y del
 * selector está en preview.test.ts.
 */

/** Una app de mentira pero de verdad: un servidor de Node que sirve una pantalla con un botón. */
const APP = `
import { createServer } from "node:http";
createServer((_p, r) => {
  r.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  r.end('<html><head><title>La tienda</title></head><body><button data-testid="guardar">Guardar</button></body></html>');
}).listen(Number(process.env.PORT), "127.0.0.1");
`;

describe("el preview de una rama", () => {
  let repo = "";

  beforeEach(async () => {
    // Sin «preview» en el nombre: la carpeta del repo aparece en `git worktree list`, y un test de
    // acá abajo se fija justamente en que no quede ningún worktree de preview en esa lista.
    repo = await mkdtemp(join(tmpdir(), "dolphin-pv-"));
    await writeFile(join(repo, "package.json"), JSON.stringify({ name: "tienda", type: "module" }));
    await writeFile(join(repo, "servidor.mjs"), APP);
    await git(["init", "-q", "-b", "main"], repo);
    await git(["config", "user.email", "nico@ejemplo.com"], repo);
    await git(["config", "user.name", "Nico"], repo);
    await git(["add", "-A"], repo);
    await git(["commit", "-qm", "base"], repo);
    await git(["branch", "dolphin/u1"], repo);
  });

  afterEach(async () => {
    await cerrarTodosLosPreviews();
    await git(["worktree", "prune"], repo).catch(() => {});
    await borrarCarpeta(repo);
  });

  const conPantalla = () =>
    writeFile(
      join(repo, "dolphin.config.json"),
      JSON.stringify({ pantalla: { levantar: "node servidor.mjs", url: "http://127.0.0.1:{PUERTO}/", espera: 20000 } }),
    );

  it("sin «pantalla» en la config no se adivina el comando: se dice cómo configurarlo", async () => {
    await expect(abrirPreviewDeRama(repo, "dolphin/u1")).rejects.toThrow(SIN_PANTALLA);
  });

  it("una rama que no existe no abre nada", async () => {
    await conPantalla();
    await expect(abrirPreviewDeRama(repo, "dolphin/no-existe")).rejects.toThrow(/no existe la rama/);
  });

  it("levanta la app de la rama y la sirve por el origen de la consola, con el inspector", async () => {
    await conPantalla();
    // La consola de verdad, con su proxy: es el servidor el que sirve la app de la rama. Se crea
    // ANTES y se cierra al final porque cerrarlo apaga todos los previews (es su dueño: ver el
    // `close` en servidor.ts), así que un preview abierto antes no sobrevive a este `close`.
    const servidor = crearServidor({ repo, calendario: false, demo: true });
    await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", listo));
    const base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;

    try {
      const preview = await abrirPreviewDeRama(repo, "dolphin/u1");
      expect(preview.enLaConsola).toBe(`/preview/${preview.id}/`);

      const html = await (await fetch(`${base}${preview.enLaConsola}`)).text();
      expect(html).toContain('data-testid="guardar"');
      // Con esto adentro, tocar el botón devuelve su selector.
      expect(html).toContain("__dolphinInspector");
      expect(html).toContain(`<base href="/preview/${preview.id}/">`);

      // Pedirlo dos veces es el mismo, no dos dev servers: alguien recargó la consola.
      expect((await abrirPreviewDeRama(repo, "dolphin/u1")).id).toBe(preview.id);
      expect(await cerrarPreview(preview.id)).toBe(true);
      expect(previewsAbiertos()).toEqual([]);
    } finally {
      await new Promise((listo) => servidor.close(listo));
    }
  }, 60_000);

  it("si la app no levanta, el worktree no queda colgado en disco", async () => {
    await writeFile(
      join(repo, "dolphin.config.json"),
      JSON.stringify({ pantalla: { levantar: "node no-existe-este-archivo.mjs", url: "http://127.0.0.1:{PUERTO}/", espera: 3000 } }),
    );

    await expect(abrirPreviewDeRama(repo, "dolphin/u1")).rejects.toThrow();
    expect(previewsAbiertos()).toEqual([]);
    // El worktree del preview se devolvió: git no lo tiene en su lista.
    const worktrees = await git(["worktree", "list"], repo);
    expect(worktrees).not.toContain("preview");
  }, 30_000);

  it("el proxy no sirve nada si no hay preview: ni con un id inventado", () => {
    let estado = 0;
    const falsa = { writeHead: (c: number) => void (estado = c), end: () => {} } as never;
    expect(servirPreview("/preview/p42/", { url: "/preview/p42/", headers: {}, method: "GET" } as never, falsa)).toBe(true);
    expect(estado).toBe(404);
  });
});
