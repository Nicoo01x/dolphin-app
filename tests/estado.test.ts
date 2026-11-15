import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { cerrarAsuntos, firmaDe, leerBandeja, sumarAsuntos } from "../src/nucleo/bandeja.js";
import { leerPerfil, sumarAlPerfil } from "../src/nucleo/perfil.js";
import { leerCola } from "../src/nucleo/cola.js";
import { anotar, leerNotas } from "../src/nucleo/notas.js";
import { sonar } from "../src/nucleo/sueno.js";
import { nuevoId } from "../src/nucleo/ids.js";

/**
 * Lo que guarda Dolphin en `.dolphin/`, contra lo que encontró la revisión
 * del 22/10: un error que vuelve se reabre, la firma no borra otros
 * alfabetos, el perfil no descarta lo que se parece, un archivo roto no se
 * pisa y dos escrituras a la vez no se pierden.
 */

describe("lo que guarda Dolphin", () => {
  let repo = "";
  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-estado-"));
  });
  afterEach(async () => {
    await borrarCarpeta(repo);
  });

  it("un error que se había cerrado y vuelve se reabre, con la evidencia nueva", async () => {
    const error = { tipo: "error" as const, titulo: "Tocar «Guardar» no hace nada", detalle: "x", donde: "/alta", origen: "explorador" };
    await sumarAsuntos(repo, [error]);
    await cerrarAsuntos(repo, () => true, "ya no pasa");
    expect((await leerBandeja(repo)).asuntos[0]?.estado).toBe("hecho");

    const { sumados } = await sumarAsuntos(repo, [{ ...error, evidencia: "otra vez" }]);
    const [asunto] = (await leerBandeja(repo)).asuntos;
    expect(asunto).toMatchObject({ estado: "abierto", evidencia: "otra vez" });
    expect(asunto?.resuelto).toBeUndefined();
    expect(sumados).toHaveLength(1);
  });

  it("dos ideas en ruso o en japonés no tienen la misma firma", () => {
    const idea = (titulo: string) => firmaDe({ tipo: "idea", titulo, detalle: "" });
    expect(idea("Добавить тёмную тему")).not.toBe(idea("Экспорт в PDF"));
    expect(idea("ダークモードを追加")).not.toBe(idea("PDFに書き出す"));
  });

  it("el perfil no descarta una línea por parecerse a otra: tiene que ser la misma", async () => {
    await sumarAlPerfil(repo, "usa pnpm para todo");
    await sumarAlPerfil(repo, "usa pnpm");
    await sumarAlPerfil(repo, "- usa pnpm para todo"); // la misma, con viñeta: no se repite
    expect((await leerPerfil(repo)).split("\n")).toEqual(["- usa pnpm para todo", "- usa pnpm"]);
  });

  it("un archivo de estado que no se entiende se aparta en vez de pisarse", async () => {
    await mkdir(join(repo, ".dolphin"), { recursive: true });
    await writeFile(join(repo, ".dolphin", "cola.json"), '{"tareas": [ {"id": "t1", "tarea": "a me');
    expect(await leerCola(repo)).toEqual({ tareas: [] });
    const archivos = await readdir(join(repo, ".dolphin"));
    const roto = archivos.find((a) => a.startsWith("cola.json.roto-"));
    expect(roto).toBeDefined();
    expect(await readFile(join(repo, ".dolphin", roto!), "utf8")).toContain('"t1"');
  });

  it("soñar mientras se anota no pierde la nota nueva", async () => {
    const vista = (n: number) => ({ cuando: new Date(Date.UTC(2026, 9, 22, 0, n)).toISOString(), tarea: `tarea ${n}` });
    await anotar(repo, [{ texto: "la base de pruebas se levanta con docker", origen: "agente", tipo: "agente" }], vista(0));
    // A la vez: el sueño lee, cambia y escribe las notas mientras otra siembra anota.
    await Promise.all([
      sonar(repo, new Date(Date.UTC(2026, 9, 22, 1))),
      anotar(repo, [{ texto: "el lint corre con eslint 9 y config plana", origen: "agente", tipo: "agente" }], vista(1)),
    ]);
    const textos = (await leerNotas(repo)).map((n) => n.texto);
    expect(textos).toContain("el lint corre con eslint 9 y config plana");
  });

  it("mil ids del mismo milisegundo no se repiten, y la letra dice de qué son", () => {
    const ids = Array.from({ length: 1000 }, () => nuevoId("a", 0));
    expect(new Set(ids).size).toBe(1000);
    expect(ids.every((id) => /^a0[0-9a-f]{8}$/.test(id))).toBe(true);
  });
});
