import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { enFila, escribirDeUna } from "../src/nucleo/escritura.js";
import { agendar, actualizarTurno, leerCalendario } from "../src/nucleo/calendario.js";
import { encolar, leerCola } from "../src/nucleo/cola.js";
import { cambiarEstado, leerBandeja, sumarAsuntos } from "../src/nucleo/bandeja.js";

/**
 * Los archivos de estado de `.dolphin/` se releen mientras se escriben: la
 * consola cada pocos segundos, el programador, la cola. Con writeFile a
 * secas, una lectura en el medio veía el archivo vacío —el turno
 * desaparecía de la agenda— y un cambio en ese momento borraba los demás.
 */

describe("escribir el estado sin que se lea a medias", () => {
  let carpeta = "";

  beforeEach(async () => {
    carpeta = await mkdtemp(join(tmpdir(), "dolphin-escritura-"));
  });

  afterEach(async () => {
    await borrarCarpeta(carpeta);
  });

  it("quien lee mientras se escribe ve el archivo de antes o el de después, nunca uno a medias", async () => {
    const ruta = join(carpeta, "estado.json");
    const grande = (n: number) => `${JSON.stringify({ n, relleno: "x".repeat(100_000) })}\n`;
    await escribirDeUna(ruta, grande(0));

    // El lector no para: en Windows el reemplazo tiene que encontrar el hueco entre dos lecturas.
    let escribiendo = true;
    const escritor = (async () => {
      for (let n = 1; n <= 25; n++) await escribirDeUna(ruta, grande(n));
    })().finally(() => {
      escribiendo = false;
    });
    const vistos: number[] = [];
    while (escribiendo) {
      // Si alguna lectura agarrara el archivo truncado, JSON.parse tiraría y el test se cae acá.
      vistos.push((JSON.parse(await readFile(ruta, "utf8")) as { n: number }).n);
    }
    await escritor;

    expect(vistos.length).toBeGreaterThan(0);
    expect((JSON.parse(await readFile(ruta, "utf8")) as { n: number }).n).toBe(25);
    // Ningún temporal queda tirado en la carpeta.
    expect(await readdir(carpeta)).toEqual(["estado.json"]);
  });

  it("cien cambios a la vez sobre el mismo archivo quedan los cien", async () => {
    const ruta = join(carpeta, "cuenta.json");
    await writeFile(ruta, '{"n":0}\n');
    const sumarUno = () =>
      enFila(ruta, async () => {
        const { n } = JSON.parse(await readFile(ruta, "utf8")) as { n: number };
        await escribirDeUna(ruta, `${JSON.stringify({ n: n + 1 })}\n`);
      });
    await Promise.all(Array.from({ length: 100 }, sumarUno));
    expect(JSON.parse(await readFile(ruta, "utf8"))).toEqual({ n: 100 });
  });

  it("un trabajo que falla no traba la fila", async () => {
    const ruta = join(carpeta, "x.json");
    await expect(enFila(ruta, async () => Promise.reject(new Error("se rompió")))).rejects.toThrow("se rompió");
    await expect(enFila(ruta, async () => "sigue")).resolves.toBe("sigue");
  });

  it("la agenda, la cola y la bandeja no pierden lo que entra a la vez", async () => {
    const repo = carpeta;
    const cuando = new Date(Date.now() + 86_400_000).toISOString();

    // Veinte turnos agendados juntos: los veinte, y uno cambiado mientras tanto no se lleva a nadie.
    const turnos = await Promise.all(Array.from({ length: 20 }, (_, i) => agendar(repo, { tareas: [`tarea ${i}`], cuando, agente: "mentira" })));
    await Promise.all([actualizarTurno(repo, turnos[3]!.id, { estado: "cancelado" }), agendar(repo, { tareas: ["una más"], cuando, agente: "mentira" })]);
    const agenda = await leerCalendario(repo);
    expect(agenda.turnos).toHaveLength(21);
    expect(agenda.turnos.find((t) => t.id === turnos[3]!.id)?.estado).toBe("cancelado");

    await Promise.all(Array.from({ length: 10 }, (_, i) => encolar(repo, [`cola ${i}`])));
    expect((await leerCola(repo)).tareas).toHaveLength(10);

    const [{ sumados }] = await Promise.all([
      sumarAsuntos(repo, [{ tipo: "error", origen: "explorador", titulo: "«Guardar» no hace nada", detalle: "lo toqué y no pasó nada", donde: "/" }]),
      sumarAsuntos(repo, [{ tipo: "idea", origen: "scout", titulo: "Exportar a PDF", detalle: "lo tiene la competencia" }]),
    ]);
    await cambiarEstado(repo, sumados[0]!.id, "rechazado");
    expect((await leerBandeja(repo)).asuntos.map((a) => a.titulo).sort()).toEqual(["Exportar a PDF", "«Guardar» no hace nada"]);
  });
});
