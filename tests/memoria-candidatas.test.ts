import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import {
  aprobarCandidato,
  contextoDeMemoria,
  descartarCandidato,
  fueDescartado,
  leerMemoria,
  leerUsos,
  registrarUsos,
  recordar,
  recordarCandidato,
  sinUsoEn30Dias,
  verificadoresDeMemoria,
} from "../src/nucleo/memoria.js";

describe("candidatas e higiene de la memoria", () => {
  let repo = "";

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-memoria-candidata-"));
  });

  afterEach(async () => {
    await borrarCarpeta(repo);
  });

  it("una candidata se conserva, pero no viaja ni corta el portón; aprobarla sí", async () => {
    const candidata = await recordarCandidato(repo, "No uses console.log", "lo corregiste en la sesión", "console\\.log");
    expect(candidata).toMatchObject({ activo: false, candidato: true, origen: "sesion", porQue: "lo corregiste en la sesión" });
    expect(contextoDeMemoria(await leerMemoria(repo), "console.log")).not.toContain("No uses console.log");
    expect(verificadoresDeMemoria(await leerMemoria(repo))).toHaveLength(0);

    const aprobado = await aprobarCandidato(repo, candidata!.id, "No uses console.log en código nuevo");
    expect(aprobado).toMatchObject({ activo: true, dicho: "No uses console.log en código nuevo" });
    expect(aprobado).not.toHaveProperty("candidato");
    expect(verificadoresDeMemoria(await leerMemoria(repo))).toHaveLength(1);
  });

  it("descartar guarda el texto normalizado y evita volver a proponerlo", async () => {
    const candidata = await recordarCandidato(repo, "Usá la coma decimal", "corrección de la persona");
    expect(await descartarCandidato(repo, candidata!.id)).toBe(true);
    expect(await fueDescartado(repo, "usá LA coma decimal")).toBe(true);
    expect(await recordarCandidato(repo, "Usa la coma decimal", "otra sesión")).toBeNull();
    expect(JSON.parse(await readFile(join(repo, ".dolphin", "memoria-descartes.json"), "utf8"))).toEqual(["usa coma decimal"]);
  });

  it("no duplica por normalización/Jaccard y marca las contradicciones", async () => {
    const original = await recordar(repo, "Siempre usa la coma decimal");
    const duplicado = await recordar(repo, "siempre usá la coma decimal");
    expect(duplicado.id).toBe(original.id);

    const contrario = await recordar(repo, "Nunca usa la coma decimal");
    expect(contrario.conflictoCon).toBe(original.id);
  });

  it("marca sin uso si nunca se usó o si el último uso pasó los 30 días", () => {
    const ahora = new Date("2026-10-26T00:00:00.000Z");
    expect(sinUsoEn30Dias(undefined, ahora)).toBe(true);
    expect(sinUsoEn30Dias({ usos: 1, ultimoUso: "2026-09-20T00:00:00.000Z" }, ahora)).toBe(true);
    expect(sinUsoEn30Dias({ usos: 4, ultimoUso: "2026-10-20T00:00:00.000Z" }, ahora)).toBe(false);
    // Una regla nueva que todavía no se usó no está «sin uso»: cuenta desde que entró.
    expect(sinUsoEn30Dias(undefined, ahora, "2026-10-25T00:00:00.000Z")).toBe(false);
    expect(sinUsoEn30Dias({ usos: 0 }, ahora, "2026-09-01T00:00:00.000Z")).toBe(true);
  });

  it("guarda usos y último uso por recuerdo", async () => {
    const recuerdo = await recordar(repo, "los tests van en tests/");
    const ahora = new Date("2026-10-26T00:00:00.000Z");
    await registrarUsos(repo, [recuerdo.id, recuerdo.id], ahora);
    await registrarUsos(repo, [recuerdo.id], ahora);
    expect(await leerUsos(repo)).toEqual({ [recuerdo.id]: { usos: 2, ultimoUso: ahora.toISOString() } });
  });
});
