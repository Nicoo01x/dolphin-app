import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { esperarA } from "./ayuda/esperar.js";
import { guardarCosecha, leerUltimaCosecha, listarCosechas, leerCosecha } from "../src/nucleo/archivo.js";
import type { Cosecha } from "../src/nucleo/tipos.js";

function cosechaDe(tarea: string): Cosecha {
  const universo = { id: "u1", rama: "x/u1", ruta: "/x/u1", nacido: 0 };
  return {
    tarea,
    candidatos: [
      {
        universo,
        vivo: true,
        pasadas: [{ verificador: "tipos", costo: "gratis", paso: true, detalle: "pasó", gastado: 0, ms: 12 }],
        forma: { archivos: 1, agregadas: 3, quitadas: 1, dependenciasNuevas: 0 },
        enfoque: "mínimo",
        contrato: { superficies: ["/facturas"], resumen: "valida el CUIT" },
      },
    ],
    porQueGano: "pasó uno solo",
    gastado: 0.04,
    muertosGratis: 2,
    ms: 43500,
  };
}

let repo = "";

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "dolphin-test-"));
});

afterEach(async () => {
  await borrarCarpeta(repo);
});

describe("guardar y leer cosechas", () => {
  it("guarda y vuelve a leer sin perder nada", async () => {
    await guardarCosecha(cosechaDe("arreglar el desborde"), repo);
    const ultima = await leerUltimaCosecha(repo);

    expect(ultima?.tarea).toBe("arreglar el desborde");
    expect(ultima?.gastado).toBe(0.04);
    expect(ultima?.candidatos[0]?.enfoque).toBe("mínimo");
    expect(ultima?.candidatos[0]?.contrato?.superficies).toEqual(["/facturas"]);
    expect(ultima?.cuando).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("sin cosechas devuelve nada, no un error: es el estado vacío", async () => {
    expect(await leerUltimaCosecha(repo)).toBeUndefined();
    expect(await listarCosechas(repo)).toEqual([]);
  });

  it("guarda el historial y lo lista de la más nueva a la más vieja", async () => {
    await guardarCosecha(cosechaDe("primera"), repo);
    // El nombre del archivo es el instante con milisegundos: si las dos caen en el mismo, la
    // segunda pisa a la primera y queda una sola. Se espera a que el reloj cambie, no un rato.
    const primera = (await leerUltimaCosecha(repo))!.cuando;
    await esperarA(() => new Date().toISOString() !== primera);
    await guardarCosecha(cosechaDe("segunda"), repo);

    const lista = await listarCosechas(repo);
    expect(lista).toHaveLength(2);
    expect((await leerCosecha(lista[0]!)).tarea).toBe("segunda");
  });

  it("ultima.json queda apuntando siempre a la más reciente", async () => {
    await guardarCosecha(cosechaDe("vieja"), repo);
    await guardarCosecha(cosechaDe("nueva"), repo);
    expect((await leerUltimaCosecha(repo))?.tarea).toBe("nueva");
  });

  it("el archivo es json legible por una persona", async () => {
    await guardarCosecha(cosechaDe("x"), repo);
    const crudo = await readFile(join(repo, ".dolphin", "ultima.json"), "utf8");
    expect(crudo).toContain("\n  ");
  });
});

describe("dolphin no ensucia el repo", () => {
  it("la carpeta .dolphin se ignora a sí misma", async () => {
    await guardarCosecha(cosechaDe("x"), repo);
    const ignore = await readFile(join(repo, ".dolphin", ".gitignore"), "utf8");
    expect(ignore.trim()).toBe("*");
  });
});
