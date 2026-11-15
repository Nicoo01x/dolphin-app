import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { esperarA } from "./ayuda/esperar.js";
import { escribirParteDeLaManana, htmlDelParte, textoDelParte, ultimaNoche } from "../src/manana.js";
import { correrNoche, pendientesDeLaNoche, type Noche } from "../src/noche.js";
import { abrirCanalTelegram } from "../src/tui/canal-telegram.js";
import { Sesion } from "../src/tui/sesion.js";

/**
 * El ciclo entero de una noche, con git de verdad y el agente de mentira: /noche deja la tarea,
 * dolphin noche la hace, /parte la cuenta, /aprobar la mergea en tu rama y /descartar la tira.
 */

const correr = promisify(execFile);
const git = async (args: string[], cwd: string) => (await correr("git", args, { cwd, windowsHide: true })).stdout.trim();
let repo = "";

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "dolphin-manana-"));
  await mkdir(join(repo, "src"), { recursive: true });
  await writeFile(join(repo, "package.json"), JSON.stringify({ name: "tienda", type: "module", scripts: { sintaxis: "node --check src/a.js" } }));
  await writeFile(join(repo, "src", "a.js"), "export const suma = (a, b) => a + b\n");
  await writeFile(join(repo, ".gitignore"), ".dolphin/\n");
  await git(["init", "-q", "-b", "main"], repo);
  await git(["config", "user.email", "nico@ejemplo.com"], repo);
  await git(["config", "user.name", "Nico"], repo);
  await git(["add", "-A"], repo);
  await git(["commit", "-qm", "base"], repo);
});
afterEach(async () => {
  await git(["worktree", "prune"], repo).catch(() => {});
  await borrarCarpeta(repo);
});

const unaHora = () => new Date(Date.now() + 3_600_000);
// El sondeo lo hace `ayuda/esperar.ts`; el expect queda acá para que, si no pasó, lo diga en vez
// de seguir y romper tres líneas más abajo con un «undefined».
const esperarQue = async (cumple: () => boolean, tope = 20_000) => {
  await esperarA(cumple, { tope });
  expect(cumple(), "no pasó a tiempo").toBe(true);
};

describe("el parte de la mañana", () => {
  it("/noche la deja, la noche la hace, /parte la cuenta y /aprobar la mergea en tu rama", async () => {
    const sesion = new Sesion({ repo, agente: "mentira", automatico: true, verificar: ["sintaxis"] });
    await sesion.recibir("/noche exportar los pedidos a CSV");
    expect(sesion.mensajes.at(-1)!.texto).toMatch(/^Queda para esta noche \(1 en total\)/);

    const noche = await correrNoche({ repo, agente: "mentira", hasta: unaHora(), pendientes: await pendientesDeLaNoche(repo), verificar: ["sintaxis"] });
    expect(noche.tareas[0]).toMatchObject({ estado: "lista" });
    expect(noche.tareas[0]!.commit).toBeTruthy();

    await sesion.recibir("/parte");
    expect(sesion.mensajes.at(-1)!.texto).toMatch(/^Esta noche: 1 de 1 quedaron listas\.\n\n1\. exportar los pedidos a CSV · lista: /);
    expect(sesion.mensajes.at(-1)!.texto).toContain("/aprobar 1 la mergea");

    const antes = await git(["rev-parse", "HEAD"], repo);
    await sesion.recibir("/aprobar 1");
    expect(sesion.mensajes.at(-1)!.texto).toBe("Mergeé «exportar los pedidos a CSV» en main.");
    expect(await git(["rev-parse", "HEAD"], repo)).not.toBe(antes);
    expect(await git(["merge-base", "--is-ancestor", noche.tareas[0]!.commit!, "HEAD"], repo)).toBe("");
    expect((await ultimaNoche(repo))!.tareas[0]!.decidida?.accion).toBe("aprobada");

    await sesion.recibir("/aprobar 1");
    expect(sesion.mensajes.at(-1)!.texto).toBe("No pude: la 1 ya la mergeaste.");
    await sesion.recibir("/aprobar 7");
    expect(sesion.mensajes.at(-1)!.texto).toBe("No pude: la noche tuvo 1 tarea(s): no hay una 7.");
    sesion.cerrar();
  }, 120_000);

  it("/descartar n tira la rama de esa tarea y /descartar solo sigue siendo el del equipo", async () => {
    const noche = await correrNoche({ repo, agente: "mentira", hasta: unaHora(), pendientes: [{ id: "s1", titulo: "modo oscuro", tarea: "modo oscuro" }], verificar: ["sintaxis"] });
    const rama = noche.tareas[0]!.rama!;
    expect(await git(["branch", "--list", rama], repo)).not.toBe("");
    const sesion = new Sesion({ repo, agente: "mentira", automatico: true, verificar: ["sintaxis"] });
    await sesion.recibir("/descartar 1");
    expect(sesion.mensajes.at(-1)!.texto).toBe("Descarté «modo oscuro».");
    expect(await git(["branch", "--list", rama], repo)).toBe("");
    sesion.cerrar();
  }, 120_000);

  it("desde el celular: /parte y /aprobar por Telegram mergean la tarea de la noche", async () => {
    const enviados: { chat_id: string; text: string }[] = [];
    const pendientes: unknown[] = [];
    let id = 1;
    const llegar = (texto: string) => pendientes.push({ update_id: id++, message: { chat: { id: 42 }, text: texto } });
    const pedir = (async (url: string, init?: { body?: string }) => {
      if (url.includes("/sendMessage")) {
        enviados.push(JSON.parse(init?.body ?? "{}"));
        return new Response("{}");
      }
      return new Response(JSON.stringify({ ok: true, result: pendientes.splice(0) }));
    }) as unknown as typeof fetch;

    const noche = await correrNoche({ repo, agente: "mentira", hasta: unaHora(), pendientes: [{ id: "s1", titulo: "cupones", tarea: "cupones de descuento" }], verificar: ["sintaxis"] });
    const sesion = new Sesion({ repo, agente: "mentira", automatico: true, verificar: ["sintaxis"] });
    const canal = abrirCanalTelegram({ token: "t", chat: "42", sesion, pedir });
    llegar("/parte");
    await canal.vuelta();
    await esperarQue(() => enviados.some((m) => m.text.startsWith("Esta noche: 1 de 1")));
    llegar("/aprobar 1");
    await canal.vuelta();
    await esperarQue(() => enviados.some((m) => m.text === "Mergeé «cupones» en main."));
    expect(await git(["merge-base", "--is-ancestor", noche.tareas[0]!.commit!, "HEAD"], repo)).toBe("");
    sesion.cerrar();
  }, 120_000);

  it("sin ninguna noche, /parte dice cómo empezar", async () => {
    const sesion = new Sesion({ repo, agente: "mentira", automatico: true, verificar: [] });
    await sesion.recibir("/parte");
    expect(sesion.mensajes.at(-1)!.texto).toContain("Todavía no corrió ninguna noche acá");
    sesion.cerrar();
  });
});

describe("cómo se ve el parte", () => {
  const noche: Noche = {
    id: "n1",
    repo: "",
    agente: "claude",
    desde: "2026-10-27T23:00:00.000Z",
    hasta: "2026-10-28T07:00:00.000Z",
    tareas: [
      { id: "1", titulo: "cupones <script>", tarea: "x", estado: "lista", porQue: "pasó", gastado: 0.4, esperas: 1, rama: "dolphin/a/u1", videos: ["cupones 1.webm"] },
      { id: "2", titulo: "modo oscuro", tarea: "x", estado: "no-salio", porQue: "test: 2 fallan\ndetalle", gastado: 0.2, esperas: 0 },
      { id: "3", titulo: "csv", tarea: "x", estado: "sin-tiempo", porQue: "se hizo la hora antes de empezarla", gastado: 0, esperas: 0 },
    ],
  };

  it("en texto: una línea por tarea y cómo decidir", () => {
    expect(textoDelParte(noche)).toBe(
      [
        "Esta noche: 1 de 3 quedaron listas (US$ 0.60).",
        "",
        "1. cupones <script> · lista: dolphin/a/u1 · 1 video(s)",
        "2. modo oscuro · no salió: test: 2 fallan",
        "3. csv · no llegó: se hizo la hora antes de empezarla",
        "",
        "Decidí cada una: /aprobar 1 la mergea, /descartar 1 la tira.",
      ].join("\n"),
    );
  });

  it("en página: una tarjeta por tarea, con sus videos y sin dejar pasar HTML", async () => {
    const pagina = htmlDelParte(noche);
    expect(pagina.match(/<article class="tarjeta/g)).toHaveLength(3);
    expect(pagina).toContain('<video src="../videos/cupones%201.webm" controls');
    expect(pagina).toContain("cupones &lt;script&gt;");
    expect(pagina).not.toContain("<script>");
    const ruta = await escribirParteDeLaManana({ ...noche, repo });
    expect(await readFile(ruta, "utf8")).toBe(pagina);
  });
});
