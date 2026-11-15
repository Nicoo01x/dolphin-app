import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { crearServidor } from "../src/servidor.js";
import { guardarCosecha } from "../src/nucleo/archivo.js";
import { recordar } from "../src/nucleo/memoria.js";

/**
 * La actividad por HTTP, contra un repo con cosas de verdad en `.dolphin/`:
 * una siembra guardada, un error en la bandeja y una regla en la memoria.
 */

describe("la actividad desde la consola", () => {
  let repo = "";
  let servidor: ReturnType<typeof crearServidor>;
  let base = "";

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-actividad-api-"));
    servidor = crearServidor({ repo, calendario: false });
    await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", listo));
    base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
  });

  afterEach(async () => {
    await new Promise((listo) => servidor.close(listo));
    await borrarCarpeta(repo);
  });

  it("un repo sin nada devuelve una actividad vacía, no un error", async () => {
    const r = await fetch(`${base}/api/actividad`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ actividad: [], recortada: false });
  });

  it("junta la siembra, la bandeja y la memoria, lo más nuevo primero", async () => {
    await guardarCosecha(
      {
        tarea: "arreglá el IVA",
        candidatos: [{ universo: { id: "u1", rama: "dolphin/u1", ruta: "/tmp/u1", nacido: 0 }, vivo: true, pasadas: [] }],
        gastado: 0,
        muertosGratis: 0,
        ms: 10,
      },
      repo,
    );
    await mkdir(join(repo, ".dolphin"), { recursive: true });
    await writeFile(
      join(repo, ".dolphin", "bandeja.json"),
      JSON.stringify({
        asuntos: [
          { id: "e1", tipo: "error", titulo: "Tocar Guardar no hace nada", detalle: "d", origen: "explorador", firma: "f", estado: "abierto", creado: "2020-01-01T00:00:00.000Z" },
        ],
      }),
    );
    await recordar(repo, "sin markdown para los clientes");

    const { actividad } = (await (await fetch(`${base}/api/actividad`)).json()) as { actividad: { tipo: string; sobre?: string }[] };
    expect(actividad.map((a) => a.tipo).sort()).toEqual(["error", "memoria", "siembra"]);
    // El error es de 2020: queda último.
    expect(actividad.at(-1)).toMatchObject({ tipo: "error", sobre: "Tocar Guardar no hace nada" });
  });
});
