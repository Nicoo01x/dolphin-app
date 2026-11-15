import { execFile } from "node:child_process";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { prepararSiembra, sembrarTarea } from "../src/siembra.js";
import { normalizarSuperficie, soloNuevos } from "../src/tester/escalon-pantalla.js";
import { medirForma } from "../src/nucleo/forma.js";
import type { Agente } from "../src/nucleo/tipos.js";

/**
 * La fase de pantalla en una siembra de verdad: cada rama levanta su app,
 * el «pulgar» la mira, y solo corta lo que la rama rompió.
 */

const correr = promisify(execFile);

describe("lo que declara el agente, llevado a rutas", () => {
  it("normaliza el texto libre a una ruta que se pueda pedir", () => {
    // Lo que escribió Sonnet en una siembra real: sin esto se pedía un 404.
    expect(normalizarSuperficie("index.html (página de producto)")).toBe("/");
    expect(normalizarSuperficie("/alta")).toBe("/alta");
    expect(normalizarSuperficie("alta")).toBe("/alta");
    expect(normalizarSuperficie("#cuenta")).toBe("#cuenta");
    expect(normalizarSuperficie("/facturas#nueva")).toBe("/facturas#nueva");
    expect(normalizarSuperficie("http://localhost:3000/alta?x=1#y")).toBe("/alta#y");
    expect(normalizarSuperficie("/panel/index.html")).toBe("/panel/");
    expect(normalizarSuperficie("ninguna")).toBeUndefined();
    expect(normalizarSuperficie("   ")).toBeUndefined();
  });
});

describe("lo nuevo y lo viejo", () => {
  it("se descuenta lo que el repo ya tenía, por persona, tipo y lugar", () => {
    const base = [{ persona: "pulgar", hallazgos: [{ tipo: "target-chico", donde: "a «Ayuda»", detalle: "mide 30×17 px" }] }];
    const rama = [
      {
        persona: "pulgar",
        hallazgos: [
          { tipo: "target-chico", donde: "a «Ayuda»", detalle: "mide 31×17 px" }, // el mismo, aunque mida un px distinto
          { tipo: "target-chico", donde: "button.comprar «Comprar»", detalle: "mide 86×28 px" },
        ],
      },
    ];
    const { informes, yaEstaban } = soloNuevos(rama, base);
    expect(yaEstaban).toBe(1);
    expect(informes[0]!.hallazgos.map((h) => h.donde)).toEqual(["button.comprar «Comprar»"]);
  });
});

async function hayChromeConVideo(): Promise<{ chrome: boolean; video: boolean }> {
  try {
    const { chromium } = await import("playwright-core");
    const navegador = await chromium.launch({ channel: "chrome", headless: true }).catch(() => undefined);
    if (!navegador) return { chrome: false, video: false };
    const carpeta = await mkdtemp(join(tmpdir(), "dolphin-sonda-video-"));
    // Con una página: sin el ffmpeg de Playwright el contexto se crea igual y lo que falla es
    // `newPage`. Sin abrirla, el runner de GitHub decía que había video y no lo había.
    const video = await navegador
      .newContext({ recordVideo: { dir: carpeta } })
      .then(async (c: any) => {
        try {
          await c.newPage();
          return true;
        } finally {
          await c.close();
        }
      })
      .catch(() => false);
    await navegador.close();
    await borrarCarpeta(carpeta);
    return { chrome: true, video };
  } catch {
    return { chrome: false, video: false };
  }
}

const sonda = await hayChromeConVideo();

describe.skipIf(!sonda.chrome)("la fase de pantalla en una siembra", () => {
  let repo = "";

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-escalon-pantalla-"));
    // Un servidor estático mínimo: sirve index.html en el PORT de cada rama.
    await writeFile(
      join(repo, "servidor.mjs"),
      `import http from "node:http";
import { readFile } from "node:fs/promises";
http.createServer(async (q, r) => {
  // Como un servidor de verdad: lo que no existe es un 404.
  if (new URL(q.url, "http://x").pathname !== "/") {
    r.writeHead(404);
    return r.end("no está");
  }
  r.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  r.end(await readFile("index.html", "utf8"));
}).listen(Number(process.env.PORT), "127.0.0.1");
`,
    );
    // La app ya tenía un problema: el enlace «Ayuda», chico para el dedo.
    await writeFile(join(repo, "index.html"), pagina(""));
    await writeFile(
      join(repo, "dolphin.config.json"),
      JSON.stringify({ pantalla: { levantar: "node servidor.mjs", url: "http://127.0.0.1:{PUERTO}/", personas: ["pulgar"] } }),
    );
    for (const args of [["init", "-q", "-b", "main"], ["add", "-A"], ["-c", "user.email=n@n", "-c", "user.name=n", "commit", "-qm", "base"]]) {
      await correr("git", args, { cwd: repo, windowsHide: true });
    }
  });

  afterAll(async () => {
    if (repo) await borrarCarpeta(repo).catch(() => {});
  });

  it("corta a la rama que rompe la pantalla, con su video, y deja pasar a la que no rompió nada", async () => {
    const agente: Agente = {
      nombre: "prueba",
      async trabajar(universo) {
        // u1 agrega un botón de 28 px; u2 solo cambia un texto.
        const extra =
          universo.id === "u1"
            ? '<button class="comprar" style="height:28px;padding:0 16px">Comprar</button>'
            : "<p>Envío gratis en el día.</p>";
        await writeFile(join(universo.ruta, "index.html"), pagina(extra));
        // Como lo declaró un modelo de verdad: texto libre, no una ruta. Y
        // una ruta que no existe, que se descarta en vez de compararse un 404.
        return {
          forma: await medirForma(universo.ruta),
          gastado: 0,
          contrato: { superficies: ["index.html (página de producto)", "/carrito-que-no-existe"] },
        };
      },
    };

    const preparada = await prepararSiembra({ repo, tarea: "sumá el botón de comprar" });
    // La configuración que se ejecuta sola va siempre primero (ver config-ejecutable.ts).
    expect(preparada.verificadores.map((v) => v.nombre)).toEqual(["configuración", "seguridad", "pantalla"]);
    const { cosecha } = await sembrarTarea({ repo, tarea: "sumá el botón de comprar" }, { ...preparada, agente }, { cantidad: 2, limpiar: false });

    const [u1, u2] = cosecha.candidatos;
    // La pasada de pantalla por nombre: la de configuración va antes, siempre.
    const pantallaDe = (u: typeof u1) => u!.pasadas.find((p) => p.verificador === "pantalla")!;
    expect(u1).toMatchObject({ vivo: false, murioEn: "pantalla" });
    expect(u1!.porQue).toBe(
      "pantalla · pulgar en /: button.comprar «Comprar» mide 88×28 px y para el dedo hacen falta 44 (el repo ya tenía 1 que no son de esta rama)",
    );

    expect(u2!.vivo).toBe(true);
    expect(pantallaDe(u2).detalle).toBe("pantalla: 1 miradas, nada roto nuevo (el repo ya tenía 1 que no son de esta rama)");

    if (sonda.video) {
      const videos = pantallaDe(u1).videos ?? [];
      expect(videos).toHaveLength(1);
      expect(videos[0]).toMatch(/^u1-pulgar-\d+\.webm$/);
      expect((await stat(join(repo, ".dolphin", "videos", videos[0]!))).size).toBeGreaterThan(1000);
      // Y su portada: la captura con el problema resaltado.
      expect((await stat(join(repo, ".dolphin", "videos", videos[0]!.replace(/\.webm$/, ".png")))).size).toBeGreaterThan(1000);
      // La rama que anduvo deja UNO, de la app andando con el cambio: es el que se mira a la mañana.
      const queAnda = pantallaDe(u2).videos ?? [];
      expect(queAnda).toHaveLength(1);
      expect(queAnda[0]).toMatch(/^u2-anda-pulgar-\d+\.webm$/);
      expect((await stat(join(repo, ".dolphin", "videos", queAnda[0]!))).size).toBeGreaterThan(1000);
    }
    // La cosecha guardada también los trae: es lo que va a leer el parte.
    const guardada = JSON.parse(await readFile(join(repo, ".dolphin", "ultima.json"), "utf8"));
    expect(guardada.candidatos[0].pasadas.map((p: { verificador: string }) => p.verificador)).toContain("pantalla");
    // Sin tope propio: el general ya está alto por lo mismo que este test necesitaba uno —abre dos
    // ramas, levanta la app en cada una y las mira con Chrome—. Ver vitest.config.ts.
  });
});

function pagina(extra: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Tienda</title><link rel="icon" href="data:,"></head>
<body style="font-family:system-ui;margin:0;padding:24px 16px;background:#fff;color:#111">
<h1>Yerba</h1><p><a href="#ayuda" style="font-size:12px">Ayuda</a></p>${extra}</body></html>`;
}
