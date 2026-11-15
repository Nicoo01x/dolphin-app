import { describe, expect, it } from "vitest";
import { argumentosDeLectura } from "../src/agentes/leer-con-claude.js";

/**
 * El scout se quedó sin web (23/10): `--tools` dejaba WebSearch y WebFetch a mano, pero en
 * `dontAsk` lo que pide permiso y no está aprobado se deniega, y volvía «sin nada nuevo».
 */
describe("lo que puede usar un lector de Claude", () => {
  it("aprueba exactamente las herramientas que deja, y nada más", () => {
    const args = argumentosDeLectura({ vueltas: 40, herramientas: ["WebSearch", "WebFetch", "Read"] });
    const aprobadas = args[args.indexOf("--allowedTools") + 1];
    expect(aprobadas).toBe("WebSearch,WebFetch,Read");
    expect(args.slice(-2)).toEqual(["--tools", "WebSearch,WebFetch,Read"]);
    expect(args.join(" ")).toContain("--permission-mode dontAsk");
  });

  it("la aprobación va antes de --tools, que se lleva todo lo que le sigue", () => {
    const args = argumentosDeLectura({ vueltas: 1, herramientas: ["Read"] });
    expect(args.indexOf("--allowedTools")).toBeLessThan(args.indexOf("--tools"));
  });
});
