import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { anonimizar, exportarBitacora, importarBitacora, marcosDelRepo, patronPeligroso } from "../src/bitacora-compartida.js";
import { leerMemoria, recordar } from "../src/nucleo/memoria.js";

/**
 * La bitácora compartida: lo que sale no lleva nada del proyecto, y lo que entra no se usa sin el
 * visto bueno de la persona.
 */

let tienda = "";
let otro = "";

beforeEach(async () => {
  tienda = await mkdtemp(join(tmpdir(), "tienda-de-ropa-"));
  otro = await mkdtemp(join(tmpdir(), "otro-proyecto-"));
  await writeFile(join(tienda, "package.json"), JSON.stringify({ name: "@acme/tienda-de-ropa", dependencies: { next: "^16.1.0", "@prisma/client": "6.2.0" }, devDependencies: { vitest: "~5.0.5" } }));
  await writeFile(join(otro, "package.json"), JSON.stringify({ name: "otro", dependencies: { next: "15.0.0" } }));
});
afterEach(async () => {
  await Promise.all([tienda, otro].map((r) => borrarCarpeta(r)));
});

describe("lo que sale", () => {
  it("los frameworks del repo, con su versión mayor", async () => {
    expect(await marcosDelRepo(tienda)).toEqual(["next@16", "prisma@6", "vitest@5"]);
  });

  it("sin rutas, URLs, correos, claves, tareas ni el nombre del proyecto", () => {
    const nombres = ["tienda-de-ropa", "@acme/tienda-de-ropa"];
    const limpio = anonimizar(
      "En «subir fotos a S3 de tienda-de-ropa», el build de tienda-de-ropa rompió en C:\\Users\\nico\\tienda\\next.config.js: next 16 ya no acepta images.domains, usá remotePatterns (ver https://nextjs.org/docs y avisá a nico@acme.com, clave sk-live_abcdef1234567890)",
      nombres,
    );
    expect(limpio).toBe(
      "En «una tarea», el build de el proyecto rompió en <ruta> next 16 ya no acepta images.domains, usá remotePatterns (ver <url> y avisá a <correo>, clave <secreto>)",
    );
    expect(anonimizar("«x» en C:\\a\\b", nombres)).toBeNull();
  });

  it("anonimiza rutas relativas y rutas de Windows con barra derecha", () => {
    expect(anonimizar("Falló src/facturacion/lote.ts y también C:/Users/nico/tienda/src/index.ts; corregilo.", ["tienda"])).toBe(
      "Falló <ruta> y también <ruta>; corregilo.",
    );
  });

  it("exporta solo lo aprobado y del proyecto, reglas y errores; el patrón va si no dice nada del proyecto", async () => {
    await recordar(tienda, "No uses console.log en el código de producción: usá el logger.", "console\\.log\\(");
    await recordar(tienda, "En tienda-de-ropa los precios van en centavos, nunca con decimales.", "tienda-de-ropa");
    await recordar(tienda, "Elegimos Postgres porque el cliente ya lo tenía.", undefined, "decision");
    await recordar(tienda, "Una que propuso la sesión y nadie aprobó todavía.", undefined, "regla", { candidato: true });
    await recordar(tienda, "Una que vino de afuera y nunca se aprobó como propia.", undefined, "regla", { origen: "untrusted" });
    const paquete = await exportarBitacora(tienda, new Date("2026-10-27T12:00:00Z"));
    expect(paquete.formato).toBe("dolphin-bitacora/1");
    expect(paquete.marcos).toEqual(["next@16", "prisma@6", "vitest@5"]);
    expect(paquete.lecciones).toEqual([
      { dicho: "No uses console.log en el código de producción: usá el logger.", tipo: "regla", patron: "console\\.log\\(" },
      { dicho: "En el proyecto los precios van en centavos, nunca con decimales.", tipo: "regla" },
    ]);
    expect(JSON.stringify(paquete)).not.toMatch(/tienda-de-ropa|acme/);
  });
});

describe("lo que entra", () => {
  const paquete = (lecciones: unknown[], marcos = ["next@16"]) => ({ formato: "dolphin-bitacora/1", creado: "2026-10-27T00:00:00Z", marcos, lecciones });

  it("entra como candidata de afuera, sin usarse hasta el visto bueno; lo repetido no se duplica", async () => {
    const r = await importarBitacora(otro, paquete([{ dicho: "En next 16 images.domains ya no existe: usá remotePatterns.", tipo: "error" }, { dicho: "No uses console.log en producción: usá el logger.", tipo: "regla", patron: "console\\.log\\(" }]));
    expect(r).toEqual({ sumadas: 2, yaEstaban: 0, descartadas: [] });
    const recuerdos = (await leerMemoria(otro)).recuerdos;
    expect(recuerdos.every((x) => x.candidato && !x.activo && x.origen === "untrusted")).toBe(true);
    expect(recuerdos[0]!.porQue).toBe("de la bitácora compartida (next@16)");
    const otraVez = await importarBitacora(otro, paquete([{ dicho: "En next 16 images.domains ya no existe: usá remotePatterns.", tipo: "error" }]));
    expect(otraVez).toMatchObject({ sumadas: 0, yaEstaban: 1 });
  });

  it("no entran: un patrón que puede colgar el portón, uno roto, lo vacío, ni la bitácora de otro stack", async () => {
    expect(patronPeligroso("(a+)+$")).toBe(true);
    expect(patronPeligroso("(\\w*)*x")).toBe(true);
    expect(patronPeligroso("console\\.log\\(")).toBe(false);
    const r = await importarBitacora(otro, paquete([
      { dicho: "Una regla con un patrón que cuelga todo.", patron: "(a+)+$" },
      { dicho: "Una regla con un patrón que ni compila.", patron: "([" },
      { dicho: "corta" },
    ]));
    expect(r.sumadas).toBe(0);
    expect(r.descartadas).toHaveLength(3);
    expect(r.descartadas[0]).toContain("podría colgar el portón");
    expect(r.descartadas[1]).toContain("no es una expresión regular válida");
    const deOtroStack = await importarBitacora(otro, paquete([{ dicho: "En Django los modelos van en models.py, siempre." }], ["django@5"]));
    expect(deOtroStack.descartadas).toEqual(["es de django@5 y este repo no usa ninguno"]);
    await expect(importarBitacora(otro, { lecciones: [] })).rejects.toThrow("no es una bitácora de Dolphin");
  });
});
