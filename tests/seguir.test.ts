import { mkdir, mkdtemp, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { carpetaDeClaudeCode } from "../src/nucleo/buscar-memorias.js";
import type { Aviso } from "../src/nucleo/avisos.js";
import { estadoDe, limpiarSecretos, PEDIDO_DE_VUELTA, PRIMER_PEDIDO, resumenDe, seguir, sesionesDelRepo, type CorrerVuelta } from "../src/seguir.js";

// Claude nunca se lanza: cada vuelta la contesta esta lista, en orden.
function vueltasDe(respuestas: { texto?: string; error?: string; sesion?: string }[]) {
  const pedidos: Parameters<CorrerVuelta>[0][] = [];
  const correr: CorrerVuelta = async (pedido) => {
    pedidos.push(pedido);
    const r = respuestas[pedidos.length - 1] ?? { texto: "ESTADO: SIGO" };
    return { texto: r.texto ?? "", ...(r.error ? { error: r.error } : {}), ...(r.sesion ? { sesion: r.sesion } : {}) };
  };
  return { correr, pedidos };
}
const avisador = () => {
  const avisos: Aviso[] = [];
  return { avisos, avisar: { avisar: async (a: Aviso) => (avisos.push(a), true) } };
};

describe("seguir", () => {
  let casa = "";
  afterEach(async () => {
    if (casa) await borrarCarpeta(casa);
  });

  it("lee la última línea de estado", () => {
    expect(estadoDe("hice todo\nESTADO: TERMINADO")).toEqual({ que: "termino" });
    expect(estadoDe("ESTADO: NECESITO la clave de Brevo")).toEqual({ que: "necesita", que_falta: "la clave de Brevo" });
    expect(estadoDe("sigo con los tests")).toEqual({ que: "sigue" });
    expect(resumenDe("listo, pasan los tests\nESTADO: TERMINADO")).toBe("listo, pasan los tests");
  });

  it("encuentra las sesiones de Claude Code del repo, la más nueva primero, con su último pedido", async () => {
    casa = await mkdtemp(join(tmpdir(), "dolphin-seguir-casa-"));
    const repo = join(casa, "mi-repo");
    const carpeta = carpetaDeClaudeCode(repo, casa);
    await mkdir(carpeta, { recursive: true });
    const linea = (texto: string) => JSON.stringify({ type: "user", message: { role: "user", content: texto } });
    await writeFile(join(carpeta, "vieja.jsonl"), linea("arreglá el login") + "\n");
    await writeFile(join(carpeta, "nueva.jsonl"), [linea("hacé la web"), linea("seguí con los docs")].join("\n") + "\n");
    await utimes(join(carpeta, "vieja.jsonl"), new Date("2026-10-01"), new Date("2026-10-01"));
    // Una que abrió Dolphin con `claude -p` (la más nueva de todas): no es tuya, no se sigue.
    await writeFile(join(carpeta, "de-dolphin.jsonl"), JSON.stringify({ type: "user", entrypoint: "sdk-cli", message: { role: "user", content: "Sos el planificador de Dolphin" } }) + "\n");
    const sesiones = await sesionesDelRepo(repo, casa);
    expect(sesiones.map((s) => s.id)).toEqual(["nueva", "vieja"]);
    expect(sesiones[0]!.ultimoPedido).toBe("seguí con los docs");
  });

  it("no llama a Claude si una vuelta larga supera el cupo y no se pidió esperar", async () => {
    casa = await mkdtemp(join(tmpdir(), "dolphin-seguir-cupo-"));
    await mkdir(join(casa, ".dolphin"), { recursive: true });
    await writeFile(join(casa, ".dolphin", "plan-uso.json"), JSON.stringify({ escritoEn: new Date().toISOString(), agentes: [{ agente: "claude", ventanas: [{ nombre: "5h", usadoPct: 90, reiniciaEn: new Date(Date.now() + 60_000).toISOString() }] }] }));
    const correr = vi.fn(vueltasDe([{ texto: "no debería" }]).correr);
    const aviso = avisador();
    const r = await seguir({ repo: "/r", sesion: "s", vueltas: 2, prohibidos: [], casa, respaldo: "ninguno", correr, avisar: aviso.avisar });
    expect(r.como).toBe("fallo");
    expect(correr).not.toHaveBeenCalled();
  });

  it("empuja vuelta a vuelta en una copia de la sesión y avisa con el link cuando termina", async () => {
    const { correr, pedidos } = vueltasDe([{ texto: "avancé\nESTADO: SIGO", sesion: "copia-1" }, { texto: "falta poco\nESTADO: SIGO" }, { texto: "listo y verificado\nESTADO: TERMINADO" }]);
    const { avisos, avisar } = avisador();
    const r = await seguir({ repo: "/r", sesion: "original", vueltas: 8, prohibidos: ["Bash(git push:*)"], correr, avisar, levantar: async () => "http://127.0.0.1:5123/" });
    expect(r).toMatchObject({ como: "termino", vueltas: 3, link: "http://127.0.0.1:5123/" });
    // La primera vuelta bifurca la sesión original; las siguientes siguen la copia.
    expect(pedidos.map((p) => [p.sesion, p.bifurcar])).toEqual([["original", true], ["copia-1", false], ["copia-1", false]]);
    expect(pedidos[0]!.prompt).toBe(PRIMER_PEDIDO);
    expect(pedidos[1]!.prompt).toBe(PEDIDO_DE_VUELTA);
    expect(pedidos[0]!.prohibidos).toEqual(["Bash(git push:*)"]);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ tipo: "termino" });
    expect(avisos[0]!.texto).toContain("http://127.0.0.1:5123/");
  });

  it("frena y avisa cuando necesita algo de la persona, cuando falla y al llegar al tope", async () => {
    const necesita = avisador();
    expect((await seguir({ repo: "/r", sesion: "s", vueltas: 5, prohibidos: [], correr: vueltasDe([{ texto: "ESTADO: NECESITO el token de MP" }]).correr, avisar: necesita.avisar })).como).toBe("necesita");
    expect(necesita.avisos[0]).toMatchObject({ tipo: "espera", texto: "el token de MP" });

    const falla = avisador();
    expect((await seguir({ repo: "/r", sesion: "s", vueltas: 5, prohibidos: [], correr: vueltasDe([{ error: "límite de uso" }]).correr, avisar: falla.avisar })).como).toBe("fallo");
    expect(falla.avisos[0]).toMatchObject({ tipo: "fallo", texto: "límite de uso" });

    const tope = avisador();
    const r = await seguir({ repo: "/r", sesion: "s", vueltas: 2, prohibidos: [], correr: vueltasDe([]).correr, avisar: tope.avisar });
    expect(r).toMatchObject({ como: "tope", vueltas: 2 });
    expect(tope.avisos[0]).toMatchObject({ tipo: "espera" });
  });

  it("cortar con Ctrl+C no lanza otra vuelta", async () => {
    const corte = new AbortController();
    corte.abort();
    const { correr, pedidos } = vueltasDe([]);
    const r = await seguir({ repo: "/r", sesion: "s", vueltas: 5, prohibidos: [], correr, avisar: avisador().avisar, senal: corte.signal });
    expect(r.como).toBe("cortado");
    expect(pedidos).toHaveLength(0);
  });

  it("limpia claves, tokens de GitHub/Telegram y archivos .env del paquete", () => {
    const limpio = limpiarSecretos("sk-1234567890 ghp_1234567890 12345:abcdefghijklmnopqrstuvwxyz API_TOKEN=secreto .env.local");
    expect(limpio).not.toContain("1234567890");
    expect(limpio).not.toContain("abcdefghijklmnopqrstuvwxyz");
    expect(limpio).toContain("[CLAVE OMITIDA]");
    expect(limpio).toContain("[ARCHIVO .env OMITIDO]");
  });

  it("si todas las cuentas agotaron el cupo, arma el traspaso y sigue con Codex", async () => {
    const { avisos, avisar } = avisador();
    const claude = vueltasDe([{ error: "usage limit reached" }]);
    const respaldos: string[] = [];
    const r = await seguir({
      repo: "/r",
      sesion: "s",
      vueltas: 3,
      prohibidos: ["Bash(git push:*)"],
      base: "base",
      correr: claude.correr,
      correrRespaldo: async ({ prompt }) => {
        respaldos.push(prompt);
        return { texto: "arreglado y verificado\nESTADO: TERMINADO" };
      },
      avisar,
    });
    expect(r).toMatchObject({ como: "termino", vueltas: 1 });
    expect(respaldos[0]).toContain("Traspaso de Claude a Codex");
    expect(avisos.some((a) => a.titulo === "Cambió de motor")).toBe(true);
  });

  it("pausa al cruzar el aviso de gasto si nadie confirma seguir", async () => {
    const aviso = avisador();
    let llamadas = 0;
    const r = await seguir({
      repo: "/r",
      sesion: "s",
      vueltas: 3,
      prohibidos: [],
      correr: async () => (llamadas++, { texto: "avancé\nESTADO: SIGO", costo: 1 }),
      avisar: aviso.avisar,
      avisoUsd: 0.5,
    });
    expect(r.como).toBe("necesita");
    expect(llamadas).toBe(1);
    expect(aviso.avisos[0]).toMatchObject({ titulo: "Aviso de gasto" });
  });
});
