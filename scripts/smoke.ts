import { execFile } from "node:child_process";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sembrar } from "../src/nucleo/sembrar.js";
import { TallerDeGit } from "../src/nucleo/taller.js";
import { verificadoresDeNpm } from "../src/nucleo/verificadores.js";
import { guardarCosecha, leerUltimaCosecha } from "../src/nucleo/archivo.js";
import { medirLineaBase } from "../src/nucleo/linea-base.js";
import { crearServidor } from "../src/servidor.js";
import { puertoLibre } from "../src/nucleo/puertos.js";
import { medirForma } from "../src/nucleo/forma.js";
import type { Agente } from "../src/nucleo/tipos.js";

/**
 * Smoke de punta a punta, sin LLM y sin red.
 *
 * Arma un repo de verdad, siembra con un agente de mentira, pasa por el
 * portón con `npm test` real, guarda la cosecha, levanta el servidor y
 * comprueba que la pantalla reciba los datos. Es el comando que corre el
 * gate: si esto pasa, el producto hace lo que promete.
 */

const correr = promisify(execFile);
let fallas = 0;

function comprobar(que: string, condicion: boolean, detalle = ""): void {
  console.log(`  ${condicion ? "✓" : "✗"}  ${que}${detalle ? ` · ${detalle}` : ""}`);
  if (!condicion) fallas++;
}

const repo = await mkdtemp(join(tmpdir(), "dolphin-smoke-"));

try {
  console.log(`\n  smoke de dolphin · ${repo}\n`);

  // ── un repo de verdad ──
  await mkdir(join(repo, "src"), { recursive: true });
  await writeFile(
    join(repo, "package.json"),
    JSON.stringify({ name: "smoke", version: "1.0.0", type: "module", scripts: { test: "node --test" } }, null, 2),
  );
  await writeFile(join(repo, "src", "suma.js"), "export const suma = (a, b) => a + b;\n");
  await writeFile(
    join(repo, "src", "suma.test.js"),
    `import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { suma } from "./suma.js";\ntest("suma", () => assert.equal(suma(2, 2), 4));\n`,
  );
  await correr("git", ["init", "-q"], { cwd: repo });
  await correr("git", ["add", "-A"], { cwd: repo });
  await correr("git", ["-c", "user.email=s@s", "-c", "user.name=s", "commit", "-qm", "base"], { cwd: repo });

  // ── la línea base está sana ──
  const verificadores = verificadoresDeNpm(["test"]);
  const linea = await medirLineaBase(repo, verificadores);
  comprobar("la línea base del repo está sana", linea.sana, linea.rotos.map((r) => r.nombre).join(", "));

  // ── sembrar: uno bueno, uno que rompe el test ──
  const agente: Agente = {
    nombre: "smoke",
    async trabajar(universo, _tarea, enfoque) {
      const rompe = universo.id === "u2";
      await writeFile(
        join(universo.ruta, "src", "suma.js"),
        rompe ? "export const suma = (a, b) => a - b;\n" : "export const suma = (a, b) => Number(a) + Number(b);\n",
      );
      return {
        forma: await medirForma(universo.ruta),
        gastado: 0,
        contrato: { superficies: [], resumen: `enfoque ${enfoque?.nombre ?? "—"}` },
      };
    },
  };

  const cosecha = await sembrar({
    tarea: "endurecer la suma",
    cantidad: 3,
    rama: "smoke",
    taller: new TallerDeGit(repo),
    agente,
    verificadores,
  });

  comprobar("se sembraron 3 universos", cosecha.candidatos.length === 3, `${cosecha.candidatos.length}`);
  comprobar("cada universo recibió un enfoque distinto", new Set(cosecha.candidatos.map((c) => c.enfoque)).size === 3);
  comprobar("el que rompe el test murió en el portón", cosecha.candidatos.find((c) => c.universo.id === "u2")?.vivo === false);
  comprobar("quedó un ganador", cosecha.ganador !== undefined, cosecha.ganador?.universo.id ?? "ninguno");
  comprobar("el ganador trae su forma medida", (cosecha.ganador?.forma?.archivos ?? 0) > 0);
  comprobar("el contrato llegó a la cosecha", cosecha.candidatos.every((c) => c.contrato !== undefined));
  comprobar("los universos tienen puerto propio", new Set(cosecha.candidatos.map((c) => c.universo.entorno?.["PORT"])).size === 3);

  // ── guardar y volver a leer ──
  await guardarCosecha(cosecha, repo);
  const guardada = await leerUltimaCosecha(repo);
  comprobar("la cosecha se guardó y se vuelve a leer", guardada?.tarea === "endurecer la suma");

  // ── la pantalla la recibe ──
  const puerto = await puertoLibre();
  const servidor = crearServidor({ repo, puerto });
  await new Promise<void>((listo) => servidor.listen(puerto, "127.0.0.1", listo));

  try {
    const api = await fetch(`http://127.0.0.1:${puerto}/api/cosecha`).then((r) => r.json());
    comprobar("la pantalla recibe la cosecha", api.cosecha?.candidatos?.length === 3);

    const historial = await fetch(`http://127.0.0.1:${puerto}/api/historial`).then((r) => r.json());
    comprobar("la pantalla recibe el historial", historial.cosechas?.length >= 1);

    const { actividad } = await fetch(`http://127.0.0.1:${puerto}/api/actividad`).then((r) => r.json());
    comprobar("la actividad cuenta la siembra", actividad?.[0]?.tipo === "siembra", actividad?.[0]?.titulo);

    const pagina = await fetch(`http://127.0.0.1:${puerto}/`);
    const html = await pagina.text();
    comprobar("la pantalla se sirve", pagina.status === 200 && html.includes("dolphin"));

    const fuera = await fetch(`http://127.0.0.1:${puerto}/../package.json`);
    comprobar("no se puede salir de la carpeta de la UI", fuera.status !== 200, `dio ${fuera.status}`);

    // El worktree del ganador queda abierto: es el único del que la
    // pantalla puede ofrecer el diff sin mentir.
    const ganador = cosecha.ganador?.universo.id;
    comprobar("la pantalla sabe qué worktrees siguen en disco", api.conWorktree?.includes(ganador));

    const diff = await fetch(`http://127.0.0.1:${puerto}/api/diff?u=${ganador}`).then((r) => r.json());
    comprobar("el diff del ganador se lee del worktree", diff.hay === true && diff.texto.includes("diff --git"));

    const fantasma = await fetch(`http://127.0.0.1:${puerto}/api/diff?u=no-existe`);
    comprobar("un universo inventado no abre ningún diff", fantasma.status === 404, `dio ${fantasma.status}`);

    const fuentes = await fetch(`http://127.0.0.1:${puerto}/fuentes/inter-latin.woff2`);
    comprobar(
      "las fuentes se sirven desde la máquina, no de un CDN",
      fuentes.status === 200 && fuentes.headers.get("content-type") === "font/woff2",
    );

    if (ganador) await probarConsola(`http://127.0.0.1:${puerto}/`, ganador);
  } finally {
    await new Promise<void>((listo) => servidor.close(() => listo()));
  }

  console.log(`\n  ${fallas === 0 ? "todo bien" : `${fallas} fallas`}\n`);
} finally {
  await rm(repo, { recursive: true, force: true }).catch(() => {});
}

/**
 * La consola en un Chrome de verdad, con el teclado: Cosechas, ↓ y ↑
 * recorren las ramas llevando el foco, Enter abre el diff en grande,
 * Escape lo cierra, R vuelve a pedir la cosecha, y la consola del
 * navegador queda sin un error. Sin Chrome ni Edge se saltea y lo dice:
 * no es una falla del producto.
 */
async function probarConsola(url: string, ganador: string): Promise<void> {
  let chromium: any;
  try {
    chromium = (await import("playwright-core")).chromium;
  } catch {
    console.log("  ·  la consola en el navegador: salteada, falta playwright-core");
    return;
  }

  let navegador: any;
  for (const canal of ["chrome", "msedge"]) {
    try {
      navegador = await chromium.launch({ channel: canal, headless: true });
      break;
    } catch {
      /* el próximo canal */
    }
  }
  if (!navegador) {
    console.log("  ·  la consola en el navegador: salteada, no hay Chrome ni Edge");
    return;
  }

  try {
    const pagina = await navegador.newPage({ viewport: { width: 1440, height: 900 } });
    const errores: string[] = [];
    pagina.on("console", (m: any) => {
      if (m.type() === "error") errores.push(String(m.text()));
    });
    pagina.on("pageerror", (e: Error) => errores.push(e.message));

    await pagina.goto(url, { waitUntil: "load" });
    await pagina.getByRole("button", { name: "Cosechas", exact: true }).click();
    const elegida = pagina.locator("[data-rama][aria-pressed='true']");
    await elegida.waitFor({ timeout: 10_000 });
    comprobar("la consola abre la cosecha con el ganador elegido", (await elegida.getAttribute("data-rama")) === ganador);

    // Lo que se tocó con el mouse queda con el foco: así lo haría una persona.
    await pagina.keyboard.press("ArrowDown");
    const otra = await elegida.getAttribute("data-rama");
    const conFoco = await pagina.locator(":focus").getAttribute("data-rama");
    comprobar("↓ pasa a la rama siguiente y lleva el foco", otra !== ganador && conFoco === otra, `${otra} · foco en ${conFoco}`);

    await pagina.keyboard.press("ArrowUp");
    comprobar("↑ vuelve a la anterior", (await elegida.getAttribute("data-rama")) === ganador);

    // El código de la elegida está acá mismo, sin abrir nada: cada archivo con su fila.
    const codigo = pagina.getByRole("region", { name: "Lo que escribió" });
    await codigo.locator("[data-archivo]").first().waitFor({ timeout: 5000 });
    comprobar("el código de la elegida se ve en la misma pantalla", (await codigo.boundingBox())!.height >= 200);

    await pagina.keyboard.press("Enter");
    const visor = pagina.getByRole("dialog");
    await visor.waitFor({ timeout: 5000 });
    comprobar("Enter abre el diff en grande", await visor.isVisible());

    // Se abrió desde la rama (el foco estaba ahí): al cerrar, el foco vuelve a esa rama.
    await pagina.keyboard.press("Escape");
    await visor.waitFor({ state: "detached", timeout: 5000 });
    comprobar("Escape lo cierra y el foco vuelve a la rama", (await pagina.locator(":focus").getAttribute("data-rama")) === ganador);

    const pedido = pagina.waitForRequest((r: any) => r.url().includes("/api/cosecha"), { timeout: 3000 });
    await pagina.keyboard.press("r");
    comprobar("R vuelve a pedir la cosecha", await pedido.then(() => true, () => false));

    comprobar("la consola del navegador quedó sin errores", errores.length === 0, errores.slice(0, 2).join(" | "));
  } catch (error) {
    comprobar("la consola en el navegador", false, error instanceof Error ? error.message.split("\n")[0] : String(error));
  } finally {
    await navegador.close();
  }
}

// `process.exit()` con handles todavía cerrándose hace crashear a libuv en
// Windows ("UV_HANDLE_CLOSING"). El código de salida alcanza: Node se va
// solo cuando no queda nada abierto, que además es la prueba de que el
// smoke no dejó procesos colgados.
process.exitCode = fallas === 0 ? 0 : 1;
