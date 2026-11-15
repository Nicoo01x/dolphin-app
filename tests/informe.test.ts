import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { armarInforme, criterioDelPedido, informeEnMarkdown, informeEnTexto } from "../src/nucleo/informe.js";
import { cuerpoDelPr } from "../src/nucleo/pr.js";
import type { Cosecha } from "../src/nucleo/tipos.js";
import { Sesion } from "../src/tui/sesion.js";

/** El informe verificable: qué se pidió, con qué se comprobó y qué quedó SIN comprobar, dicho explícito. */

describe("el criterio del pedido", () => {
  it("las viñetas de «Está terminado cuando:», o la línea del oráculo", () => {
    expect(criterioDelPedido("Arreglá el cupón.\n\nEstá terminado cuando:\n- el cupón descuenta;\n- hay un test.\n\nArreglá la causa.")).toEqual(["el cupón descuenta;", "hay un test."]);
    expect(criterioDelPedido("x\n\nSe da por logrado cuando este comando sale en 0: `npm test`. Correlo vos.")).toEqual(["Se da por logrado cuando este comando sale en 0: `npm test`. Correlo vos."]);
    expect(criterioDelPedido("exportar a CSV")).toEqual([]);
  });
});

describe("lo que quedó sin comprobar", () => {
  it("una fase salteada, sin tests, sin revisión y un cambio que se ve que nadie miró", () => {
    const i = armarInforme({
      tarea: "el botón de exportar",
      fases: [
        { nombre: "typecheck", estado: "paso", ms: 3200 },
        { nombre: "pantalla", estado: "salteada", detalle: "pantalla: no hay navegador, se salteó" },
      ],
      tocados: ["src/Boton.tsx", "src/estilos.css"],
    });
    expect(i.comprobado).toEqual(["typecheck (3.2 s)"]);
    expect(i.sinComprobar).toEqual([
      "pantalla: no corrió (no hay navegador, se salteó)",
      "ningún test: el comportamiento no lo probó nadie, solo que compila y se ve bien el código",
      "nadie más leyó el código: no hubo revisión de otro modelo",
      "cambió lo que se ve (src/Boton.tsx, src/estilos.css) y nadie miró la app andando",
    ]);
    expect(informeEnTexto(i)).toBe(`Comprobado: typecheck (3.2 s).\nSin comprobar: ${i.sinComprobar.join("; ")}.`);
  });

  it("con todo comprobado no inventa faltas, y las pruebas van a la vista", () => {
    const i = armarInforme({
      tarea: "x",
      fases: [
        { nombre: "test", estado: "paso" },
        { nombre: "pantalla", estado: "paso" },
        { nombre: "revisión", estado: "paso" },
      ],
      tocados: ["src/Boton.tsx"],
      videos: ["u1-anda-pulgar-1.webm"],
    });
    expect(i.sinComprobar).toEqual([]);
    expect(informeEnMarkdown(i)).toContain("### Lo que NO se comprobó\n\n- Nada quedó afuera.");
    expect(informeEnMarkdown(i)).toContain("- video: .dolphin/videos/u1-anda-pulgar-1.webm");
  });

  it("los tests intactos no cuentan como una fase de tests corrida", () => {
    const i = armarInforme({ tarea: "x", fases: [{ nombre: "tests intactos", estado: "paso" }] });
    expect(i.comprobado).toEqual(["tests intactos"]);
    expect(i.sinComprobar).toContain("ningún test: el comportamiento no lo probó nadie, solo que compila y se ve bien el código");
  });
});

describe("el informe en el PR", () => {
  it("la fase salteada dice «salteada» (no «pasó») y el PR trae lo que no se comprobó", () => {
    const cosecha = {
      tarea: "el botón de exportar\n\nEstá terminado cuando:\n- baja un CSV con los pedidos",
      candidatos: [],
      ganador: {
        universo: { id: "u1", rama: "dolphin/x/u1", ruta: "/tmp/x", nacido: 0 },
        vivo: true,
        forma: { archivos: 1, agregadas: 10, quitadas: 0, dependenciasNuevas: 0, tocados: [{ ruta: "src/Boton.tsx", agregadas: 10, quitadas: 0 }] },
        pasadas: [
          { verificador: "typecheck", costo: "gratis", paso: true, detalle: "typecheck: pasó", gastado: 0, ms: 1000 },
          { verificador: "pantalla", costo: "gratis", paso: true, salteada: true, detalle: "pantalla: no hay navegador, se salteó", gastado: 0, ms: 5 },
        ],
      },
      gastado: 0,
      muertosGratis: 0,
      ms: 1,
    } as unknown as Cosecha;
    const cuerpo = cuerpoDelPr(cosecha);
    expect(cuerpo).toContain("| pantalla | salteada — pantalla: no hay navegador, se salteó |");
    expect(cuerpo).toContain("### Cómo se sabe que quedó bien\n\n- baja un CSV con los pedidos");
    expect(cuerpo).toContain("- pantalla: no corrió (no hay navegador, se salteó)");
    expect(cuerpo).toContain("- cambió lo que se ve (src/Boton.tsx) y nadie miró la app andando");
  });
});

const correr = promisify(execFile);
const git = (args: string[], cwd: string) => correr("git", args, { cwd, windowsHide: true });
let repo = "";
beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "dolphin-informe-"));
  await mkdir(join(repo, "src"), { recursive: true });
  await writeFile(join(repo, "package.json"), JSON.stringify({ name: "tienda", type: "module", scripts: { sintaxis: "node --check src/a.js" } }));
  await writeFile(join(repo, "src", "a.js"), "export const suma = (a, b) => a + b\n");
  await git(["init", "-q"], repo);
  await git(["config", "user.email", "nico@ejemplo.com"], repo);
  await git(["config", "user.name", "Nico"], repo);
  await git(["add", "-A"], repo);
  await git(["commit", "-qm", "base"], repo);
});
afterEach(async () => {
  await git(["worktree", "prune"], repo).catch(() => {});
  await borrarCarpeta(repo);
});

describe("el informe en el chat", () => {
  it("el equipo cierra diciendo con qué se comprobó y qué no", async () => {
    const sesion = new Sesion({ repo, agente: "mentira", automatico: true, verificar: ["sintaxis"] });
    await sesion.recibir("/equipo exportar los pedidos a CSV");
    const cierre = sesion.mensajes.find((m) => m.texto.startsWith("Listo en"))!.texto;
    expect(cierre).toMatch(
      /\nComprobado: configuración \([\d.]+ s\), política \([\d.]+ s\), seguridad \([\d.]+ s\), sintaxis \([\d.]+ s\), revisión \([\d.]+ s\)\.\nSin comprobar: ningún test: el comportamiento no lo probó nadie/,
    );
    sesion.cerrar();
  }, 120_000);
});
