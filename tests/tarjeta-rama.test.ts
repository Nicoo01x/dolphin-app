import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { git } from "../src/nucleo/git.js";
import { buscarTarjeta, cambiarTarjeta, crearTarjeta, moverTarjeta } from "../src/nucleo/tarjetas.js";
import { objetivoDeTarjeta } from "../src/equipo/con-tarjeta.js";
import { leerMemoria } from "../src/nucleo/memoria.js";
import { crearServidor } from "../src/servidor.js";

/** Revisar la rama de una tarjeta adentro de la tarjeta: ver qué cambió, integrar o devolver. */

describe("la rama de una tarjeta", () => {
  let repo = "";
  let servidor: ReturnType<typeof crearServidor>;
  let base = "";
  let token = "";

  const correr = (args: string[], cwd = repo) => git(args, cwd);

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-rama-"));
    await correr(["init", "-b", "main"]);
    await correr(["config", "user.email", "dolphin@example.com"]);
    await correr(["config", "user.name", "Dolphin"]);
    await writeFile(join(repo, "hola.txt"), "hola\n");
    await correr(["add", "."]);
    await correr(["commit", "-m", "el primero"]);
    // Una rama con un cambio, como la que deja el equipo.
    await correr(["checkout", "-b", "dolphin/exportar"]);
    await writeFile(join(repo, "hola.txt"), "hola\nchau\n");
    await writeFile(join(repo, "nuevo.txt"), "soy nuevo\n");
    await correr(["add", "."]);
    await correr(["commit", "-m", "exportar a CSV"]);
    await correr(["checkout", "main"]);

    servidor = crearServidor({ repo, calendario: false });
    await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", listo));
    base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
    token = /name="dolphin-token" content="([0-9a-f]+)"/.exec(await (await fetch(`${base}/`)).text())?.[1] ?? "";
  });
  afterEach(async () => {
    await new Promise((listo) => servidor.close(listo));
    await borrarCarpeta(repo);
  });

  const mandar = (ruta: string, cuerpo: unknown, pase = token) =>
    fetch(`${base}${ruta}`, { method: "POST", headers: { "content-type": "application/json", "x-dolphin-token": pase }, body: JSON.stringify(cuerpo) });

  /** Una tarjeta en Para revisar con su rama, como la deja el equipo. */
  const paraRevisar = async () => {
    const t = await crearTarjeta(repo, { titulo: "exportar a CSV" });
    await cambiarTarjeta(repo, t.id, (x) => ({ ...x, rama: "dolphin/exportar" }));
    await moverTarjeta(repo, t.id, "para-revisar");
    return t.id;
  };

  it("muestra qué cambió la rama, con sus archivos y su diff", async () => {
    const id = await paraRevisar();
    const { cambios } = await (await fetch(`${base}/api/tablero/${id}/rama`)).json();
    expect(cambios).toMatchObject({ rama: "dolphin/exportar", estado: "probada", commits: 1 });
    expect(cambios.archivos).toEqual([
      { archivo: "hola.txt", agregadas: 1, quitadas: 0 },
      { archivo: "nuevo.txt", agregadas: 1, quitadas: 0 },
    ]);
    expect(cambios.diff).toContain("+chau");
    expect(cambios.diff).toContain("+soy nuevo");
    expect(cambios.recortado).toBe(false);
  });

  it("probar la cruza por el portón sin integrarla, y el veredicto queda en la tarjeta", async () => {
    const id = await paraRevisar();
    const r = await (await mandar(`/api/tablero/${id}/probar`, {})).json();

    expect(r.ok).toBe(true);
    expect(r.rama).toBe("dolphin/exportar");
    // Un repo sin tests ni config no tiene nada que correr: lo que importa es que probó el commit
    // de la rama contra su base y que no tocó nada.
    expect(typeof r.paso).toBe("boolean");
    expect(Array.isArray(r.fases)).toBe(true);

    const tarjeta = await buscarTarjeta(repo, id);
    expect(tarjeta.columna).toBe("para-revisar");
    expect(tarjeta.comentarios.at(-1)?.texto).toContain("Probada");
    // Fase por fase, como la contestó el portón: es lo que dibuja la tira en el escritorio.
    expect(tarjeta.porton ?? []).toHaveLength(r.fases.length + r.sinCorrer.length);
    expect(tarjeta.comentarios.at(-1)?.quien).toBe("dolphin");
    // Probar no integra: main sigue sin el archivo de la rama.
    await expect(git(["show", "main:nuevo.txt"], repo)).rejects.toThrow();
  });

  it("integrar la mergea y la tarjeta queda en Hecho, con el comentario", async () => {
    const id = await paraRevisar();
    const r = await (await mandar(`/api/tablero/${id}/integrar`, {})).json();
    expect(r.ok).toBe(true);
    expect(r.tarjeta.columna).toBe("hecho");
    expect(r.tarjeta.comentarios.at(-1).texto).toContain("entró en main");
    // El cambio está en main de verdad y la rama ya no hace falta.
    expect(await git(["show", "main:nuevo.txt"], repo)).toContain("soy nuevo");
    expect(await git(["branch", "--list", "dolphin/exportar"], repo)).toBe("");
  });

  it("con cambios sin commitear no toca nada y dice por qué", async () => {
    const id = await paraRevisar();
    await writeFile(join(repo, "hola.txt"), "estoy escribiendo\n");
    const r = await mandar(`/api/tablero/${id}/integrar`, {});
    expect(r.status).toBe(409);
    expect((await r.json()).porQue).toContain("sin commitear");
    expect((await buscarTarjeta(repo, id)).columna).toBe("para-revisar");
    // No se mergeó: main sigue como estaba.
    await expect(git(["show", "main:nuevo.txt"], repo)).rejects.toThrow();
  });

  it("devolver tira la rama y la tarjeta vuelve a Para hacer con el porqué", async () => {
    const id = await paraRevisar();
    expect((await mandar(`/api/tablero/${id}/devolver`, { porQue: "  " })).status).toBe(400);

    const r = await (await mandar(`/api/tablero/${id}/devolver`, { porQue: "le falta el encabezado del CSV" })).json();
    expect(r.tarjeta.columna).toBe("para-hacer");
    expect(r.tarjeta.rama).toBeUndefined();
    expect(r.tarjeta.comentarios.at(-1).texto).toBe("Devuelta: le falta el encabezado del CSV");
    expect(await git(["branch", "--list", "dolphin/exportar"], repo)).toBe("");
  });

  it("una tarjeta sin rama no se revisa, y una rama que ya no está se dice", async () => {
    const sinRama = await crearTarjeta(repo, { titulo: "todavía nada" });
    const r = await fetch(`${base}/api/tablero/${sinRama.id}/rama`);
    expect(r.status).toBe(409);
    expect((await r.json()).porQue).toContain("no tiene una rama");

    const id = await paraRevisar();
    await git(["branch", "-D", "dolphin/exportar"], repo);
    const borrada = await (await fetch(`${base}/api/tablero/${id}/rama`)).json();
    expect(borrada.cambios).toBeNull();
    expect(borrada.porQue).toContain("ya no está");
    expect((await mandar(`/api/tablero/${id}/integrar`, {})).status).toBe(409);
  });

  it("marca una línea del diff, y la marca le llega al agente con su archivo y su línea", async () => {
    const id = await paraRevisar();

    const r = await (await mandar(`/api/tablero/${id}/comentario`, { archivo: "hola.txt", linea: 2, texto: "falta el encabezado del CSV" })).json();

    expect(r.ok).toBe(true);
    expect(r.tarjeta.comentarios.at(-1)).toMatchObject({
      quien: "vos",
      texto: "falta el encabezado del CSV",
      donde: { archivo: "hola.txt", linea: 2 },
    });
    // Lo que de verdad importa: el agente lo lee, con el archivo y la línea.
    const objetivo = objetivoDeTarjeta(await buscarTarjeta(repo, id));
    expect(objetivo).toContain("Esta tarjeta ya volvió");
    expect(objetivo).toContain("- hola.txt:2 — falta el encabezado del CSV");
  });

  it("se marcan varias líneas y se devuelve una sola vez, sin repetir el motivo abajo", async () => {
    const id = await paraRevisar();
    await mandar(`/api/tablero/${id}/comentario`, { archivo: "hola.txt", linea: 2, texto: "falta el encabezado" });
    await mandar(`/api/tablero/${id}/comentario`, { archivo: "nuevo.txt", linea: 1, texto: "esto va en otro módulo" });

    // Devolver sin porQue: las marcas SON el motivo.
    const r = await (await mandar(`/api/tablero/${id}/devolver`, {})).json();

    expect(r.ok).toBe(true);
    expect(r.tarjeta.columna).toBe("para-hacer");
    expect(r.tarjeta.rama).toBeUndefined();
    const objetivo = objetivoDeTarjeta(await buscarTarjeta(repo, id));
    expect(objetivo).toContain("- hola.txt:2 — falta el encabezado");
    expect(objetivo).toContain("- nuevo.txt:1 — esto va en otro módulo");
    // La constancia que escribe Dolphin no se le repite al agente como corrección.
    expect(objetivo).not.toContain("líneas marcadas en la revisión");
  });

  it("sin marcas y sin motivo, no se devuelve: algo tiene que leer quien la retome", async () => {
    const id = await paraRevisar();
    const r = await (await mandar(`/api/tablero/${id}/devolver`, {})).json();
    expect(r.ok).toBe(false);
    expect(r.porQue).toContain("decí qué hay que cambiar");
  });

  it("una marca con patrón queda propuesta a la memoria, candidata y no activa", async () => {
    const id = await paraRevisar();

    const r = await (
      await mandar(`/api/tablero/${id}/comentario`, {
        archivo: "hola.txt",
        linea: 2,
        texto: "los CSV se escriben con encabezado",
        patron: "writeFile[(].*[.]csv",
      })
    ).json();

    expect(r.candidata).toMatchObject({ dicho: "los CSV se escriben con encabezado", candidato: true, activo: false });
    // Una regla que corta ramas se aprueba a mano: por eso entra apagada.
    const memoria = await leerMemoria(repo);
    expect(memoria.recuerdos.at(-1)).toMatchObject({ patron: "writeFile[(].*[.]csv", candidato: true, activo: false });
    expect(memoria.recuerdos.at(-1)!.porQue).toContain("hola.txt:2");
  });

  it("un patrón que no es una expresión regular válida se avisa, no se traga", async () => {
    const id = await paraRevisar();

    const r = await (await mandar(`/api/tablero/${id}/comentario`, { archivo: "hola.txt", linea: 2, texto: "x", patron: "sin cerrar(" })).json();

    // El comentario queda igual; lo que no se pudo es volverlo regla, y se dice.
    expect(r.ok).toBe(true);
    expect(r.candidata).toBeUndefined();
    expect(r.porQueNoLaRegla).toContain("no es una expresión regular válida");
  });

  it("un comentario de línea sin archivo o sin línea se rechaza", async () => {
    const id = await paraRevisar();
    for (const cuerpo of [{ linea: 2, texto: "x" }, { archivo: "a.txt", texto: "x" }, { archivo: "a.txt", linea: 0, texto: "x" }, { archivo: "a.txt", linea: 2, texto: "  " }]) {
      const r = await (await mandar(`/api/tablero/${id}/comentario`, cuerpo)).json();
      expect(r.ok).toBe(false);
      expect(r.porQue).toContain("necesita archivo, línea y texto");
    }
  });
});
