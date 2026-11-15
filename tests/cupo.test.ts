import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { antesDeArrancar, bloqueoDe } from "../src/nucleo/cupo.js";

describe("cupo antes de arrancar", () => {
  let casa = "";
  afterEach(async () => {
    if (casa) await borrarCarpeta(casa);
    delete process.env.DOLPHIN_CUPO_DIR;
  });
  async function plan(usadoPct: number, escritoEn = "2026-10-28T16:20:00.000Z") {
    casa = await mkdtemp(join(tmpdir(), "dolphin-cupo-"));
    await mkdir(join(casa, ".dolphin"), { recursive: true });
    await writeFile(join(casa, ".dolphin", "plan-uso.json"), JSON.stringify({ escritoEn, agentes: [{ agente: "claude", ventanas: [{ nombre: "5h", usadoPct, reiniciaEn: "2026-10-28T18:00:00.000Z" }] }] }));
  }
  it("aplica 85 % a una tarea larga y 95 % a un mensaje corto", async () => {
    await plan(90);
    const ahora = new Date("2026-10-28T16:30:00.000Z");
    expect((await antesDeArrancar({ agente: "claude", largo: "largo", ahora, casa, codexDisponible: () => false })).sigue).toBe(false);
    expect((await antesDeArrancar({ agente: "claude", largo: "corto", ahora, casa, codexDisponible: () => false })).sigue).toBe(true);
    await plan(96);
    expect((await antesDeArrancar({ agente: "claude", largo: "corto", ahora, casa, codexDisponible: () => false })).sigue).toBe(false);
  });
  it("ignora un plan de uso viejo y no inventa bloqueo sin ventana 5h", async () => {
    await plan(99, "2026-10-28T15:00:00.000Z");
    const ahora = new Date("2026-10-28T16:30:00.000Z");
    expect((await antesDeArrancar({ agente: "claude", largo: "largo", ahora, casa, codexDisponible: () => false })).sigue).toBe(true);
    expect(bloqueoDe(undefined, "claude", 85, ahora)).toBeUndefined();
  });
});
