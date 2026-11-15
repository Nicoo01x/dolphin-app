import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { quedarseConLosVideos } from "../src/tester/escalon-pantalla.js";
import type { InformeDePantalla } from "../src/tester/pantalla.js";

/** Qué videos quedan de una mirada: los de lo que falló y, si se pide, uno solo de lo que anduvo. */

let carpeta = "";
beforeEach(async () => {
  carpeta = await mkdtemp(join(tmpdir(), "dolphin-videos-"));
});
afterEach(async () => {
  await borrarCarpeta(carpeta);
});

async function informes(): Promise<InformeDePantalla[]> {
  const uno = async (nombre: string, persona: string, roto: boolean): Promise<InformeDePantalla> => {
    await writeFile(join(carpeta, `${nombre}.webm`), "video");
    await writeFile(join(carpeta, `${nombre}.png`), "portada");
    return { persona, superficie: "/alta", video: join(carpeta, `${nombre}.webm`), hallazgos: roto ? [{ tipo: "consola", donde: "la consola", detalle: "TypeError" } as never] : [] };
  };
  return [await uno("a", "pulgar en /alta", false), await uno("b", "lector en /alta", false), await uno("c", "apurado en /alta", true)];
}

describe("los videos de la pantalla", () => {
  it("con lo que anduvo: uno solo de eso, y todos los de lo que falló", async () => {
    const guardados = await quedarseConLosVideos(await informes(), "u1", true);
    expect(guardados).toHaveLength(2);
    expect(guardados[0]).toMatch(/^u1-anda-pulgar-alta-\d+\.webm$/);
    expect(guardados[1]).toMatch(/^u1-apurado-alta-\d+\.webm$/);
    const quedan = (await readdir(carpeta)).sort();
    expect(quedan.filter((n) => n.endsWith(".webm"))).toHaveLength(2);
    expect(quedan).not.toContain("b.webm");
    expect(quedan).not.toContain("b.png");
  });

  it("sin lo que anduvo, como antes: solo lo que falló", async () => {
    const guardados = await quedarseConLosVideos(await informes(), "u2");
    expect(guardados).toHaveLength(1);
    expect(guardados[0]).toMatch(/^u2-apurado-alta-/);
  });
});
