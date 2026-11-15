import { describe, expect, it } from "vitest";
import { argumentosDePregunta, preguntar, PREAMBULO, type PreguntarAClaude } from "../src/preguntar.js";

describe("preguntar a una sesión vieja", () => {
  it("retoma en una copia y en solo lectura: nunca escribe ni pisa la charla", () => {
    const args = argumentosDePregunta("abc-123");
    expect(args).toContain("--fork-session");
    expect(args[args.indexOf("--resume") + 1]).toBe("abc-123");
    expect(args[args.indexOf("--permission-mode") + 1]).toBe("dontAsk");
    expect(args[args.indexOf("--tools") + 1]).toBe("Read,Grep,Glob");
    // --tools se lleva todo lo que le sigue: el --resume tiene que ir antes.
    expect(args.indexOf("--resume")).toBeLessThan(args.indexOf("--tools"));
    expect(args).not.toContain("bypassPermissions");
  });

  it("le manda la pregunta con el preámbulo y devuelve lo que contesta", async () => {
    let recibido = "";
    const correr: PreguntarAClaude = async ({ prompt }) => {
      recibido = prompt;
      return { texto: "porque Mercado Pago no prorratea" };
    };
    const r = await preguntar("/repo", "s1", "  ¿por qué dejaste el pago único?  ", correr);
    expect(r.texto).toBe("porque Mercado Pago no prorratea");
    expect(recibido.startsWith(PREAMBULO)).toBe(true);
    expect(recibido.endsWith("¿por qué dejaste el pago único?")).toBe(true);
  });

  it("sin pregunta no gasta nada", () => {
    let llamado = false;
    expect(() => preguntar("/repo", "s1", "   ", async () => ((llamado = true), { texto: "" }))).toThrow(/falta la pregunta/);
    expect(llamado).toBe(false);
  });
});
