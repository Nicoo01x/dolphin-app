import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { motivoDeAprobacion } from "../src/nucleo/tests-intactos.js";
import { elegir } from "../src/nucleo/elegir.js";
import { hallazgosDeTrampas, asercionesQuitadasDeDiff, trampasDe } from "../src/nucleo/trampas.js";
import { medirForma } from "../src/nucleo/forma.js";

const correr = promisify(execFile);
let repos: string[] = [];

afterEach(async () => {
  await Promise.all(repos.splice(0).map(borrarCarpeta));
});

describe("portón antitrampa", () => {
  it("detecta una rama por cada forma de aflojar el portón y deja limpia la rama honesta", async () => {
    const repo = await repoBase();
    const casos: Record<string, Record<string, string>> = {
      "saltea-test": { "tests/nuevo.test.ts": 'import { it } from "vitest";\nit.skip("nuevo", () => {});\n' },
      "silencia-ts": { "src/suma.ts": "// @ts-ignore\nexport const suma = 2;\n" },
      "excluye-tests": { "vitest.config.ts": 'export default { test: { exclude: ["tests/**"] } };\n' },
      "apaga-script": { "package.json": JSON.stringify({ name: "t", scripts: { test: "echo ok", lint: "oxlint", typecheck: "tsc --noEmit" } }, null, 2) + "\n" },
      "saca-fase": { "dolphin.config.json": '{\n  "guardian": {\n    "fases": [\n      "test"\n    ]\n  }\n}\n' },
      limpia: { "tests/nuevo.test.ts": 'import { it } from "vitest";\nit("nuevo", () => {});\n' },
    };

    for (const [rama, archivos] of Object.entries(casos)) {
      await git(repo, ["checkout", "-q", "-b", rama, "main"]);
      for (const [ruta, contenido] of Object.entries(archivos)) await writeFile(join(repo, ruta), contenido);
      await git(repo, ["add", "-A"]);
      await git(repo, ["commit", "-qm", `caso ${rama}`]);

      const hallazgos = await trampasDe(repo, "main");
      const forma = await medirForma(repo, "main");
      if (rama === "limpia") expect(hallazgos).toEqual([]);
      else expect(hallazgos.length, rama).toBeGreaterThan(0);
      expect(forma.trampas).toHaveLength(hallazgos.length);
      if (rama === "saltea-test") expect(hallazgos[0]).toMatchObject({ tipo: "test-salteado", archivo: "tests/nuevo.test.ts", linea: 2 });
      if (rama === "silencia-ts") expect(hallazgos[0]?.tipo).toBe("silenciador");
      if (rama === "excluye-tests") expect(hallazgos[0]?.tipo).toBe("verificador-aflojado");
      if (rama === "apaga-script") expect(hallazgos[0]?.archivo).toBe("package.json");
      if (rama === "saca-fase") expect(hallazgos[0]?.archivo).toBe("dolphin.config.json");
      await git(repo, ["checkout", "-q", "main"]);
    }
    // Seis casos, y cada uno hace cuatro operaciones de git más el diff de trampas y el de la
    // forma: son unos cuarenta procesos. Con la suite entera en paralelo no le alcanza ni el tope
    // general, que ya está alto por la misma razón (ver vitest.config.ts).
  }, 300_000);

  it("guarda la evidencia en la forma, cuenta asserts borrados y hace perder la rama tramposa", () => {
    const diff = [
      "diff --git a/tests/suma.test.ts b/tests/suma.test.ts",
      "--- a/tests/suma.test.ts",
      "+++ b/tests/suma.test.ts",
      "@@ -1,3 +1,2 @@",
      "-expect(suma()).toBe(4);",
      "-assert.equal(suma(), 4);",
      " tests();",
      "",
    ].join("\n");
    expect(asercionesQuitadasDeDiff(diff).get("tests/suma.test.ts")).toBe(2);
    expect(hallazgosDeTrampas(diff)).toEqual([]);

    const limpia = { universo: { id: "u1", rama: "u1", ruta: "/tmp/u1", nacido: 0 }, vivo: true, pasadas: [], forma: { archivos: 1, agregadas: 2, quitadas: 0, dependenciasNuevas: 0, testsCambiados: [], trampas: [] } };
    const tramposa = { ...limpia, universo: { ...limpia.universo, id: "u2" }, forma: { ...limpia.forma, trampas: [{ tipo: "silenciador", archivo: "src/suma.ts", linea: 1, detalle: "La rama agregó @ts-ignore." }] } };
    expect(elegir([tramposa, limpia]).ganador?.universo.id).toBe("u1");
    expect(motivoDeAprobacion("aprobar", tramposa)).toContain("detectó trampas");
  });
});

async function repoBase(): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), "dolphin-trampas-"));
  repos.push(repo);
  await mkdir(join(repo, "src"));
  await mkdir(join(repo, "tests"));
  await mkdir(join(repo, ".github", "workflows"), { recursive: true });
  await writeFile(join(repo, "package.json"), JSON.stringify({ name: "t", scripts: { test: "vitest run", lint: "oxlint", typecheck: "tsc --noEmit" } }, null, 2) + "\n");
  await writeFile(join(repo, "src", "suma.ts"), "export const suma = 2;\n");
  await writeFile(join(repo, "tests", "suma.test.ts"), 'import { it } from "vitest";\nit("suma", () => {});\n');
  await writeFile(join(repo, "vitest.config.ts"), 'export default { test: { include: ["tests/**/*.test.ts"] } };\n');
  await writeFile(join(repo, "tsconfig.json"), '{ "compilerOptions": { "strict": true, "noImplicitAny": true } }\n');
  await writeFile(join(repo, "dolphin.config.json"), '{\n  "guardian": {\n    "fases": [\n      "test",\n      "lint"\n    ]\n  }\n}\n');
  await writeFile(join(repo, ".github", "workflows", "ci.yml"), "steps:\n  - run: npm test\n");
  await git(repo, ["init", "-q", "-b", "main"]);
  await git(repo, ["add", "-A"]);
  await git(repo, ["commit", "-qm", "base"]);
  return repo;
}

async function git(repo: string, args: readonly string[]): Promise<void> {
  const conIdentidad = args[0] === "commit" ? ["-c", "user.email=n@n", "-c", "user.name=n", ...args] : [...args];
  await correr("git", conIdentidad, { cwd: repo, windowsHide: true });
}
