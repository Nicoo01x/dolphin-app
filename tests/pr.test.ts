import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { abrirPr, cuerpoDelPr, tareaDeIssue, type Correr } from "../src/nucleo/pr.js";
import type { Candidato, Cosecha } from "../src/nucleo/tipos.js";

/**
 * El PR automático: la descripción es la evidencia del portón. Los comandos
 * se inyectan, así se prueba exactamente qué se correría sin publicar nada.
 */

const elegida: Candidato = {
  universo: { id: "u1", rama: "dolphin/abc/u1", ruta: "/wt/u1", nacido: 0 },
  vivo: true,
  modelo: "claude-sonnet-5-5",
  contrato: { superficies: ["/carrito"], resumen: "Aplica el IVA una sola vez sobre el neto." },
  forma: { archivos: 1, agregadas: 9, quitadas: 2, dependenciasNuevas: 0, tocados: [{ ruta: "src/plata.ts", agregadas: 9, quitadas: 2 }] },
  pasadas: [
    { verificador: "typecheck", costo: "gratis", paso: true, detalle: "typecheck: pasó", gastado: 0, ms: 950 },
    { verificador: "test", costo: "gratis", paso: true, detalle: "test: 41 | 41 pasaron", gastado: 0, ms: 8200 },
  ],
};

const cosecha: Cosecha = {
  tarea: "Arreglá el IVA del carrito\ncon más detalle abajo",
  candidatos: [elegida],
  ganador: elegida,
  porQueGano: "Pasó todas las fases.",
  gastado: 0,
  muertosGratis: 0,
  ms: 9000,
  entregada: { rama: "dolphin/abc/u1", commit: "c0ffee", base: "base1", ramaBase: "main" },
};

/** Un «correr» de mentira que anota todo y contesta lo que le digan. */
function grabadora(respuestas: Record<string, string | Error> = {}) {
  const llamadas: string[][] = [];
  let cuerpo = "";
  const correr: Correr = async (cmd, args) => {
    llamadas.push([cmd, ...args]);
    const clave = `${cmd} ${args[0]}`;
    if (cmd === "gh" && args[0] === "pr") {
      const i = args.indexOf("--body-file");
      cuerpo = await readFile(args[i + 1]!, "utf8");
    }
    const r = respuestas[clave];
    if (r instanceof Error) throw r;
    return r ?? "";
  };
  return { correr, llamadas, cuerpo: () => cuerpo };
}

describe("la descripción del PR", () => {
  it("lleva qué hizo, la tabla de fases y lo que tocó", () => {
    const md = cuerpoDelPr(cosecha);
    expect(md).toContain("## Arreglá el IVA del carrito");
    expect(md).toContain("Aplica el IVA una sola vez sobre el neto.");
    expect(md).toContain("| typecheck | pasó — typecheck: pasó | 950 ms |");
    expect(md).toContain("test: 41 / 41 pasaron"); // un «|» del detalle no rompe la tabla
    expect(md).toContain("- `src/plata.ts` +9 −2");
    expect(md).toContain("**claude-sonnet-5-5**");
  });

  it("sin fases no esconde nada: dice que se entregó sin probar", () => {
    const md = cuerpoDelPr({ ...cosecha, ganador: { ...elegida, pasadas: [] } });
    expect(md).toContain("no pasó por ninguna fase");
  });
});

describe("abrir el PR", () => {
  it("sube la rama y abre un draft contra la rama donde se sembró, con la evidencia de descripción", async () => {
    const g = grabadora({ "git remote": "https://github.com/nico/tienda.git", "gh pr": "https://github.com/nico/tienda/pull/42" });
    const r = await abrirPr("/repo", cosecha, g.correr);

    expect(r).toEqual({ ok: true, url: "https://github.com/nico/tienda/pull/42" });
    expect(g.llamadas[1]).toEqual(["git", "push", "-u", "origin", "dolphin/abc/u1"]);
    const pr = g.llamadas[2]!;
    expect(pr.slice(0, 4)).toEqual(["gh", "pr", "create", "--draft"]);
    expect(pr).toEqual(expect.arrayContaining(["--head", "dolphin/abc/u1", "--base", "main", "--title", "Arreglá el IVA del carrito"]));
    expect(g.cuerpo()).toContain("### Las fases");
  });

  it("sin rama entregada o sin remoto, no intenta nada y dice por qué", async () => {
    const sinEntrega = { ...cosecha };
    delete (sinEntrega as { entregada?: unknown }).entregada;
    expect(await abrirPr("/repo", sinEntrega, grabadora().correr)).toEqual({ ok: false, porQue: "esta cosecha no tiene una rama entregada" });

    const g = grabadora({ "git remote": new Error("no such remote") });
    const r = await abrirPr("/repo", cosecha, g.correr);
    expect(r.ok).toBe(false);
    expect(g.llamadas.some((l) => l[1] === "push")).toBe(false);
  });

  it("si gh falla, la primera línea del error vuelve tal cual", async () => {
    const error = Object.assign(new Error("fallo"), { stderr: "pull request create failed: GraphQL: No commits between main and dolphin/abc/u1\nmás ruido" });
    const g = grabadora({ "git remote": "https://github.com/nico/tienda.git", "gh pr": error });
    const r = await abrirPr("/repo", cosecha, g.correr);
    expect(r).toEqual({ ok: false, porQue: "pull request create failed: GraphQL: No commits between main and dolphin/abc/u1" });
  });
});

describe("de issue a siembra", () => {
  it("el título y el cuerpo del issue son la tarea, con el link para volver", async () => {
    const g = grabadora({ "gh issue": JSON.stringify({ title: "El carrito cobra el IVA dos veces", body: "Pasa con transferencia.", url: "https://github.com/nico/tienda/issues/7" }) });
    const tarea = await tareaDeIssue("/repo", 7, g.correr);
    expect(tarea).toBe("El carrito cobra el IVA dos veces\nPasa con transferencia.\n(issue: https://github.com/nico/tienda/issues/7)");
    expect(g.llamadas[0]).toEqual(["gh", "issue", "view", "7", "--json", "title,body,url"]);
  });

  it("un issue que no existe es un error claro", async () => {
    await expect(tareaDeIssue("/repo", 9, grabadora({ "gh issue": "{}" }).correr)).rejects.toThrow("no encontré el issue #9");
  });
});
