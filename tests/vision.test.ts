import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { argumentosDelJuez, decidir, juzgar, leerVeredicto, pedidoAlJuez, type CorrerJuez } from "../src/agentes/juez.js";
import { aFase, leerRubrica, verificadorDeVision } from "../src/tester/vision.js";
import { abrirNavegadorExplorable } from "../src/tester/explorador-playwright.js";
import type { Universo } from "../src/nucleo/tipos.js";

/**
 * Vision: la app de la rama recorrida como alguien que recién llega, en la
 * compu y en el teléfono, y juzgada por OTRO modelo que mira solo la
 * evidencia. Sin nota no se aprueba, y un criterio sin evidencia no cuenta.
 */

const correr = promisify(execFile);

describe("el juez", () => {
  it("decide el código, no el modelo: sin evidencia no hay «cumple», un no corta y una duda no aprueba", () => {
    expect(decidir([])).toBe("duda");
    expect(decidir([{ criterio: "se ve el botón", cumple: true, evidencia: "1440-inicio.png" }])).toBe("aceptar");
    // Dice que se cumple, pero no muestra dónde: vale como duda.
    expect(decidir([{ criterio: "se ve el botón", cumple: true, evidencia: "" }])).toBe("duda");
    expect(
      decidir([
        { criterio: "se ve el botón", cumple: true, evidencia: "1440-inicio.png" },
        { criterio: "entra en el teléfono", cumple: false, evidencia: "390-inicio.png" },
      ]),
    ).toBe("cortar");
    expect(decidir([{ criterio: "guarda el dato", cumple: null, evidencia: "" }])).toBe("duda");
  });

  it("le pide criterios con evidencia y lee la respuesta aunque venga envuelta", () => {
    const pedido = pedidoAlJuez("Sumá un botón Exportar", {
      capturas: [{ archivo: "1440-inicio.png", que: "/ en 1440 px, recién abierta" }],
      hallazgos: ["«Guardar» se manda vacío — / en 390 px"],
    });
    expect(pedido).toContain("No mirás el código");
    // Sin el antes, «no cambió nada más» no se puede probar: el juez no lo pide (pasó en el modo live).
    expect(pedido).toContain("No tenés cómo era la app antes");
    expect(pedido).toContain("- 1440-inicio.png: / en 1440 px, recién abierta");
    expect(pedido).toContain("- «Guardar» se manda vacío — / en 390 px");
    const leido = leerVeredicto('Listo:\n```json\n{"criterios":[{"criterio":"hay un botón Exportar","cumple":true,"evidencia":"1440-inicio.png"}],"porQue":"se ve"}\n```');
    expect(leido).toEqual({ criterios: [{ criterio: "hay un botón Exportar", cumple: true, evidencia: "1440-inicio.png" }], porQue: "se ve" });
    expect(leerVeredicto("no sé")).toBeUndefined();
  });

  it("con la rúbrica fijada juzga esos criterios y no inventa otros", () => {
    const evidencia = { capturas: [], hallazgos: [] };
    const libre = pedidoAlJuez("Sumá un botón Exportar", evidencia);
    expect(libre).toContain("Escribí de 2 a 5 criterios");
    const fijado = pedidoAlJuez("Sumá un botón Exportar", evidencia, ["hay un botón Exportar", "entra en el teléfono"]);
    expect(fijado).toContain("Juzgá EXACTAMENTE estos criterios");
    expect(fijado).toContain("   1. hay un botón Exportar\n   2. entra en el teléfono");
    expect(fijado).not.toContain("Escribí de 2 a 5 criterios");
  });

  it("un juez que no contesta algo legible no juzgó: la fase se saltea, no corta a la rama", async () => {
    const mudo: CorrerJuez = async () => ({ texto: "Mmm, no estoy seguro.", gastado: 0.01 });
    const veredicto = await juzgar(mudo, "x", { capturas: [], hallazgos: [] }, tmpdir(), "haiku");
    expect(veredicto).toMatchObject({ ilegible: true, gastado: 0.01, modelo: "haiku" });
    // Antes era una duda que cortaba y ponía al agente a «corregir» código que estaba bien.
    expect(aFase(veredicto, [])).toMatchObject({ paso: true, salteada: true });
  });

  it("una llave en la prosa no rompe la lectura del veredicto", () => {
    const texto = 'Miré las capturas {la de 390 sobre todo}. {"criterios":[{"criterio":"se ve el botón","cumple":true,"evidencia":"390-inicio.png"}],"porQue":"ok"}';
    expect(leerVeredicto(texto)?.criterios).toHaveLength(1);
  });

  it("una evidencia inventada no prueba nada, y omitir un criterio de la rúbrica no da «aceptar»", () => {
    const evidencia = { capturas: [{ archivo: "390-inicio-a1b2.png", que: "/ en 390" }], hallazgos: ["el botón no responde al tocarlo"] };
    const cumple = (criterio: string, cita: string) => ({ criterio, cumple: true, evidencia: cita });
    expect(decidir([cumple("se ve el botón", "no-existe.png")], evidencia)).toBe("duda");
    expect(decidir([cumple("se ve el botón", "-")], evidencia)).toBe("duda");
    expect(decidir([cumple("se ve el botón", "390-inicio-a1b2.png")], evidencia)).toBe("aceptar");
    // Con la rúbrica fijada, el que falta queda en duda.
    expect(decidir([cumple("se ve el botón", "390-inicio-a1b2.png")], evidencia, ["se ve el botón", "el formulario avisa"])).toBe("duda");
  });

  it("corre fuera del repo y sin la configuración de nadie, y solo puede abrir las capturas", () => {
    const args = argumentosDelJuez("haiku");
    expect(args.join(" ")).toContain("--setting-sources user --strict-mcp-config");
    expect(args.join(" ")).toContain("--permission-mode dontAsk");
    expect(args.slice(-2)).toEqual(["--tools", "Read,Glob"]);
  });
});

const hayChrome = await abrirNavegadorExplorable({ carpetaCapturas: join(tmpdir(), "dolphin-sonda-vision") }).then(async (n) => {
  if (!n) return false;
  await n.cerrar();
  return true;
});

describe.skipIf(!hayChrome)("la fase Vision, con la app de una rama y un Chrome de verdad", () => {
  let repo = "";
  let registro = "";

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-vision-"));
    registro = join(repo, ".dolphin", "vision");
    await writeFile(
      join(repo, "servidor.mjs"),
      `import http from "node:http";
import { readFile } from "node:fs/promises";
http.createServer(async (q, r) => {
  if (q.method === "POST") { r.writeHead(200, { "content-type": "application/json" }); return r.end("{}"); }
  r.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  r.end(await readFile("index.html", "utf8"));
}).listen(Number(process.env.PORT), "127.0.0.1");
`,
    );
    // La rama sumó un formulario de suscripción que se manda vacío.
    await writeFile(
      join(repo, "index.html"),
      `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Tienda</title></head><body>
<h1>Tienda</h1><form id="avisos"><label>Email <input name="email"></label><button>Avisame</button></form>
<script>document.getElementById("avisos").addEventListener("submit", (e) => { e.preventDefault(); fetch("/suscribir", { method: "POST" }); });</script>
</body></html>`,
    );
    for (const args of [["init", "-q", "-b", "main"], ["add", "-A"], ["-c", "user.email=n@n", "-c", "user.name=n", "commit", "-qm", "base"]]) {
      await correr("git", args, { cwd: repo, windowsHide: true });
    }
  });

  afterEach(async () => {
    await borrarCarpeta(repo).catch(() => {});
  });

  it("recorre en la compu y en el teléfono, le pasa la evidencia al juez y deja el veredicto registrado", async () => {
    const vistos: { prompt: string; archivos: string[]; modelo: string }[] = [];
    // El juez de mentira mira lo que le dieron: las capturas tienen que estar en su carpeta.
    const juez: CorrerJuez = async (prompt, carpeta, modelo) => {
      vistos.push({ prompt, archivos: await readdir(carpeta), modelo });
      return {
        texto: JSON.stringify({
          criterios: [
            { criterio: "hay un formulario para dejar el email", cumple: true, evidencia: "1440-inicio.png" },
            { criterio: "avisa si el email está vacío", cumple: false, evidencia: "«Avisame» se manda vacío" },
          ],
          porQue: "el formulario se manda sin email",
        }),
        gastado: 0.012,
      };
    };
    const vision = verificadorDeVision(
      { levantar: "node servidor.mjs", url: "http://127.0.0.1:{PUERTO}/" },
      { tarea: "Sumá un formulario para que la gente deje su email y le avisemos", modelo: "haiku", carpeta: registro, juez },
    );
    const universo: Universo = { id: "u1", rama: "dolphin/x/u1", ruta: repo, nacido: 0 };
    // La rama la escribió haiku (la que salió a medir): juzga otro.
    const fase = await vision.correr(universo, { modelo: "claude-haiku-5-5" });

    expect(vistos).toHaveLength(1);
    const [visto] = vistos;
    expect(visto!.modelo).not.toBe("haiku");
    // Las dos pantallas recién abiertas, y la del hallazgo, en la carpeta del juez.
    expect(visto!.prompt).toMatch(/- 1440-inicio-[0-9a-f]{6}\.png: \/ en 1440 px, la página entera recién abierta/);
    expect(visto!.prompt).toMatch(/- 390-inicio-[0-9a-f]{6}\.png: \/ en 390 px, la página entera recién abierta/);
    expect(visto!.prompt).toContain("«Avisame» se manda vacío — / en 1440 px. Cómo: Sin completar ningún campo, tocá «Avisame»");
    for (const linea of visto!.prompt.split("\n").filter((l) => /^- .+\.png:/.test(l))) {
      expect(visto!.archivos).toContain(linea.slice(2, linea.indexOf(":")));
    }

    expect(fase).toMatchObject({ paso: false, gastado: 0.012 });
    expect(fase.detalle).toBe(`vision: el juez (${visto!.modelo}) cortó — avisa si el email está vacío («Avisame» se manda vacío)`);
    expect(fase.evidencia).toContain("✓ hay un formulario para dejar el email — 1440-inicio.png");
    expect(fase.evidencia).toContain("✗ avisa si el email está vacío");

    // El veredicto queda con sus capturas: quien corta una rama tiene que poder mostrar por qué.
    const [carpeta] = await readdir(registro);
    expect(carpeta).toMatch(/-u1$/);
    const guardado = JSON.parse(await readFile(join(registro, carpeta!, "veredicto.json"), "utf8"));
    expect(guardado).toMatchObject({ decision: "cortar", modelo: visto!.modelo });
    expect((await readdir(join(registro, carpeta!))).filter((a) => a.endsWith(".png")).length).toBeGreaterThanOrEqual(2);

    // La rúbrica quedó fijada: la vuelta siguiente de la misma tarea juzga los mismos criterios.
    expect(await leerRubrica(registro, "Sumá un formulario para que la gente deje su email y le avisemos")).toEqual([
      "hay un formulario para dejar el email",
      "avisa si el email está vacío",
    ]);
    await vision.correr(universo, { modelo: "claude-sonnet-5-5" });
    expect(vistos[1]!.prompt).toContain("Juzgá EXACTAMENTE estos criterios");
    expect(vistos[1]!.prompt).toContain("   1. hay un formulario para dejar el email\n   2. avisa si el email está vacío");

    // Una rúbrica que dejó al juez en duda no se fija: puede traer un criterio imposible de probar.
    const dudoso: CorrerJuez = async () => ({
      texto: JSON.stringify({ criterios: [{ criterio: "solo cambió el botón", cumple: null, evidencia: "" }], porQue: "no tengo el antes" }),
      gastado: 0.01,
    });
    const otraTarea = "Hacé el botón amarillo";
    const conDuda = verificadorDeVision(
      { levantar: "node servidor.mjs", url: "http://127.0.0.1:{PUERTO}/" },
      { tarea: otraTarea, modelo: "haiku", carpeta: registro, juez: dudoso },
    );
    expect((await conDuda.correr(universo, { modelo: "claude-sonnet-5-5" })).paso).toBe(false);
    expect(await leerRubrica(registro, otraTarea)).toBeUndefined();
  }, 240_000);
});
