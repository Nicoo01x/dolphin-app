import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { git } from "../src/nucleo/git.js";
import { compartirTablero, traerTablero, ultimoToque } from "../src/nucleo/tablero-compartido.js";
import { buscarTarjeta, cambiarTarjeta, comentarTarjeta, crearTarjeta, leerTablero, moverTarjeta } from "../src/nucleo/tarjetas.js";

/** Compartir el tablero por una rama de git, sin tocar tu árbol de trabajo ni tu rama. */

describe("el tablero compartido", () => {
  let repo = "";

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-compartir-"));
    await git(["init", "-b", "main"], repo);
    await git(["config", "user.email", "dolphin@example.com"], repo);
    await git(["config", "user.name", "Dolphin"], repo);
    await writeFile(join(repo, "hola.txt"), "hola\n");
    await git(["add", "."], repo);
    await git(["commit", "-m", "el primero"], repo);
  });
  afterEach(async () => {
    await borrarCarpeta(repo);
  });

  it("escribe las tarjetas en su rama sin tocar la tuya ni lo que estés escribiendo", async () => {
    await crearTarjeta(repo, { titulo: "exportar a CSV" });
    await crearTarjeta(repo, { titulo: "el cupón no descuenta", tipo: "bug" });
    // A mitad de algo: un archivo cambiado y otro preparado.
    await writeFile(join(repo, "hola.txt"), "estoy escribiendo\n");
    await writeFile(join(repo, "nuevo.txt"), "nuevo\n");
    await git(["add", "nuevo.txt"], repo);
    const antes = await git(["status", "--porcelain"], repo);

    const r = await compartirTablero(repo);
    expect(r).toMatchObject({ rama: "dolphin/tablero", tarjetas: 2, sinCambios: false });

    // Tu rama, tu árbol y lo que tenías preparado, intactos.
    expect((await git(["rev-parse", "--abbrev-ref", "HEAD"], repo)).trim()).toBe("main");
    expect(await git(["status", "--porcelain"], repo)).toBe(antes);
    // La rama tiene SOLO las tarjetas: nada del código.
    const enLaRama = (await git(["ls-tree", "--name-only", "dolphin/tablero"], repo)).split(/\r?\n/).filter(Boolean);
    expect(enLaRama).toHaveLength(2);
    expect(enLaRama.every((n) => n.endsWith(".json"))).toBe(true);
    expect(await git(["log", "-1", "--format=%s", "dolphin/tablero"], repo)).toContain("2 tarjetas");
  });

  it("compartir dos veces sin cambios no escribe un commit nuevo; con un cambio, sí", async () => {
    const t = await crearTarjeta(repo, { titulo: "exportar a CSV" });
    const primera = await compartirTablero(repo);
    const igual = await compartirTablero(repo);
    expect(igual).toMatchObject({ commit: primera.commit, sinCambios: true });

    await moverTarjeta(repo, t.id, "haciendo");
    const otra = await compartirTablero(repo);
    expect(otra.sinCambios).toBe(false);
    expect(otra.commit).not.toBe(primera.commit);
    // Queda la historia: el commit nuevo cuelga del anterior.
    expect((await git(["rev-parse", `${otra.commit}^`], repo)).trim()).toBe(primera.commit);
  });

  it("traer trae lo que avanzó allá y no pisa lo que tocaste vos", async () => {
    const vieja = await crearTarjeta(repo, { titulo: "la de allá" });
    const mia = await crearTarjeta(repo, { titulo: "la mía" });
    // Allá la avanzaron y después se compartió.
    await comentarTarjeta(repo, vieja.id, "esto lo movieron en la otra máquina");
    await compartirTablero(repo);

    // Acá quedó la copia de antes de ese comentario, que es lo que pasa cuando te atrasaste.
    await writeFile(join(repo, ".dolphin", "tablero", `${vieja.id}.json`), `${JSON.stringify(vieja, null, 2)}\n`);
    // Y de este lado tocaste la tuya después de compartir.
    await comentarTarjeta(repo, mia.id, "esto lo escribí yo recién");
    const soloMia = await crearTarjeta(repo, { titulo: "esta no está allá" });

    const r = await traerTablero(repo);
    expect(r.actualizadas).toEqual([vieja.id]);
    expect(r.mias).toEqual([mia.id]);
    expect(r.nuevas).toEqual([]);

    // La de allá llegó con su comentario; la mía quedó con el mío; la que solo existe acá sigue.
    expect((await buscarTarjeta(repo, vieja.id)).comentarios.at(-1)!.texto).toBe("esto lo movieron en la otra máquina");
    expect((await buscarTarjeta(repo, mia.id)).comentarios.at(-1)!.texto).toBe("esto lo escribí yo recién");
    expect((await leerTablero(repo)).map((t) => t.id)).toContain(soloMia.id);
  });

  it("en un empate gana lo tuyo: traer nunca te pisa algo que no avanzó allá", async () => {
    const t = await crearTarjeta(repo, { titulo: "igual de los dos lados" });
    await compartirTablero(repo);
    const r = await traerTablero(repo);
    expect(r.mias).toEqual([t.id]);
    expect(r.actualizadas).toEqual([]);
  });

  it("traer una tarjeta que no tenías la crea", async () => {
    const t = await crearTarjeta(repo, { titulo: "la que viene de allá" });
    await compartirTablero(repo);
    await rm(join(repo, ".dolphin", "tablero", `${t.id}.json`));
    expect(await leerTablero(repo)).toHaveLength(0);

    const r = await traerTablero(repo);
    expect(r.nuevas).toEqual([t.id]);
    expect((await buscarTarjeta(repo, t.id)).titulo).toBe("la que viene de allá");
  });

  it("sin la rama, lo dice en vez de romper", async () => {
    await expect(traerTablero(repo)).rejects.toThrow("no hay una rama");
  });

  it("el último toque es lo más nuevo entre moverla, crearla y comentarla", async () => {
    const t = await crearTarjeta(repo, { titulo: "x" });
    await comentarTarjeta(repo, t.id, "un comentario");
    const con = await buscarTarjeta(repo, t.id);
    expect(ultimoToque(con)).toBe(con.comentarios.at(-1)!.cuando);
  });
});
