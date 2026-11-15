import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { agenteClaude, argumentosDeClaude, pedidoAlRetomar, pedidoDeCorreccion } from "../src/agentes/claude.js";
import { cuentaDelAgente, htmlDelParte } from "../src/nucleo/parte.js";
import { sembrar } from "../src/nucleo/sembrar.js";
import { FalloDelAgente, type Agente, type Falla, type Taller, type Universo } from "../src/nucleo/tipos.js";

/**
 * La corrección retoma la sesión en la que el agente escribió (`--resume`)
 * en vez de arrancar de cero: ya leyó el repo y sabe qué cambió. Y la
 * trampa medida del CLI: en una sesión retomada `total_cost_usd` es el
 * ACUMULADO, así que lo de cada vuelta es la diferencia.
 */

const correr = promisify(execFile);

/**
 * Un CLI de Claude falso que se porta como el real en lo que importa acá:
 * lee el prompt por stdin, guarda sus sesiones con el costo acumulado,
 * contesta «No conversation found» a una sesión que no conoce y deja un
 * cambio en el worktree para que el agente haya «trabajado».
 */
const FALSO = `
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
const args = process.argv.slice(2);
let prompt = "";
process.stdin.on("data", (t) => (prompt += t));
process.stdin.on("end", () => {
  const estado = process.env.FALSO_CLAUDE_ESTADO;
  const sesiones = existsSync(estado) ? JSON.parse(readFileSync(estado, "utf8")) : {};
  appendFileSync(process.env.FALSO_CLAUDE_LOG, JSON.stringify({ args, prompt }) + "\\n");
  const i = args.indexOf("--resume");
  const retomada = i >= 0 ? args[i + 1] : undefined;
  if (retomada && !(retomada in sesiones)) {
    process.stderr.write("No conversation found with session ID: " + retomada + "\\n");
    process.exit(1);
  }
  // Escribir cuesta 0,10; corregir retomando, 0,03; corregir de cero (relee el repo), 0,08.
  const costo = retomada ? 0.03 : prompt.startsWith("Tu cambio en este repo") ? 0.08 : 0.1;
  const id = retomada ?? randomUUID();
  sesiones[id] = Math.round(((sesiones[id] ?? 0) + costo) * 1e6) / 1e6;
  writeFileSync(estado, JSON.stringify(sesiones));
  appendFileSync("trabajo.txt", "una vuelta\\n");
  const result = "listo\\nSUPERFICIES: ninguna\\nRESUMEN: arreglado\\nNOTA: ninguna";
  process.stdout.write(JSON.stringify({ result, is_error: false, total_cost_usd: sesiones[id], session_id: id }));
});
`;

const falla: Falla = { verificador: "test", detalle: "test: ✖ descuento(100, 150) no tira RangeError", evidencia: "AssertionError: Missing expected exception (RangeError)" };

describe("los pedidos y los argumentos", () => {
  it("--resume va antes de --disallowedTools, que se lleva todo lo que le sigue", () => {
    const args = argumentosDeClaude({ prohibidos: ["Bash(git push:*)"] }, "sonnet", "s-1");
    expect(args.join(" ")).toContain("--resume s-1");
    expect(args.indexOf("--resume")).toBeLessThan(args.indexOf("--disallowedTools"));
    expect(argumentosDeClaude({}, "sonnet")).not.toContain("--resume");
  });

  it("al retomar alcanza con el veredicto; de cero viaja también la tarea", () => {
    const corto = pedidoAlRetomar(falla);
    expect(corto).toContain("«test»");
    expect(corto).toContain("Missing expected exception");
    expect(corto).toContain("SUPERFICIES, RESUMEN y NOTA");
    expect(corto).not.toContain("La tarea original");

    const largo = pedidoDeCorreccion("sumá descuento(precio, porcentaje)", falla, [".claude/settings.json"]);
    expect(largo).toContain("La tarea original era: sumá descuento(precio, porcentaje)");
    expect(largo).toContain("Se deshizo lo que cambiaste en .claude/settings.json");
  });
});

describe("el agente retoma su sesión para corregir", () => {
  let carpeta = "";
  let repo = "";
  let cmd = "";
  let log = "";
  const universo = (): Universo => ({ id: "u1", rama: "dolphin/c1", ruta: repo, nacido: 0 });
  const llamadas = async () =>
    (await readFile(log, "utf8"))
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as { args: string[]; prompt: string });

  beforeEach(async () => {
    carpeta = await mkdtemp(join(tmpdir(), "dolphin-sesion-"));
    repo = join(carpeta, "repo");
    await mkdir(join(repo, ".claude"), { recursive: true });
    await writeFile(join(repo, "precio.js"), "export const conIva = (n) => n * 1.21;\n");
    await writeFile(join(repo, ".claude", "settings.json"), "{}\n");
    for (const args of [["init", "-q", "-b", "main"], ["add", "-A"], ["-c", "user.email=n@n", "-c", "user.name=n", "commit", "-qm", "base"]]) {
      await correr("git", args, { cwd: repo, windowsHide: true });
    }
    await writeFile(join(carpeta, "claude-falso.mjs"), FALSO);
    if (process.platform === "win32") {
      cmd = join(carpeta, "claude-falso.cmd");
      await writeFile(cmd, `@node "%~dp0claude-falso.mjs" %*\r\n`);
    } else {
      cmd = join(carpeta, "claude-falso");
      await writeFile(cmd, `#!/bin/sh\nexec node "$(dirname "$0")/claude-falso.mjs" "$@"\n`);
      await chmod(cmd, 0o755);
    }
    log = join(carpeta, "llamadas.jsonl");
    process.env.FALSO_CLAUDE_LOG = log;
    process.env.FALSO_CLAUDE_ESTADO = join(carpeta, "sesiones.json");
  });

  afterEach(async () => {
    delete process.env.FALSO_CLAUDE_LOG;
    delete process.env.FALSO_CLAUDE_ESTADO;
    await borrarCarpeta(carpeta);
  });

  it("con el mismo modelo retoma, y cada vuelta cuesta lo suyo, no el acumulado de la sesión", async () => {
    const agente = agenteClaude({ cmd, modelo: "sonnet" });
    const escrito = await agente.trabajar(universo(), "sumá descuento(precio, porcentaje)");
    expect(escrito.gastado).toBe(0.1);

    const primera = await agente.corregir!(universo(), "sumá descuento(precio, porcentaje)", falla);
    expect(primera.reanudada).toBe(true);
    // El CLI informa 0,13 (lo de toda la sesión): esta vuelta costó 0,03.
    expect(primera.gastado).toBe(0.03);

    const segunda = await agente.corregir!(universo(), "sumá descuento(precio, porcentaje)", falla);
    expect(segunda).toMatchObject({ reanudada: true, gastado: 0.03 });

    const [escribir, corregir1, corregir2] = await llamadas();
    const sesion = JSON.parse(await readFile(join(carpeta, "sesiones.json"), "utf8")) as Record<string, number>;
    const [id] = Object.keys(sesion);
    expect(escribir!.args).not.toContain("--resume");
    expect(corregir1!.args.join(" ")).toContain(`--resume ${id}`);
    expect(corregir1!.prompt.startsWith("El portón rebotó tu cambio")).toBe(true);
    expect(corregir2!.args.join(" ")).toContain(`--resume ${id}`);
  });

  it("si corrige otro modelo, de cero: el caché es por modelo y retomar reenviaría la charla entera", async () => {
    const agente = agenteClaude({ cmd, modelo: "sonnet", modeloCorrector: "opus" });
    await agente.trabajar(universo(), "sumá descuento(precio, porcentaje)");
    const corregido = await agente.corregir!(universo(), "sumá descuento(precio, porcentaje)", falla);
    expect(corregido.reanudada).toBeUndefined();
    expect(corregido.gastado).toBe(0.08);
    const [, corregir] = await llamadas();
    expect(corregir!.args).not.toContain("--resume");
    expect(corregir!.prompt).toContain("La tarea original era");
  });

  it("si la sesión ya no está, corrige de cero sin cobrar el intento fallido", async () => {
    const agente = agenteClaude({ cmd, modelo: "sonnet" });
    await agente.trabajar(universo(), "sumá descuento(precio, porcentaje)");
    // Se perdió la sesión (otra máquina, el historial borrado).
    await writeFile(join(carpeta, "sesiones.json"), "{}");

    const corregido = await agente.corregir!(universo(), "sumá descuento(precio, porcentaje)", falla);
    expect(corregido.reanudada).toBeUndefined();
    expect(corregido.gastado).toBe(0.08);
    const [, intento, deCero] = await llamadas();
    expect(intento!.args).toContain("--resume");
    expect(deCero!.args).not.toContain("--resume");
  });

  it("la configuración que la tarea pidió no se deshace antes de corregir", async () => {
    const agente = agenteClaude({ cmd, modelo: "sonnet" });
    await agente.trabajar(universo(), "sumá un hook en .claude/settings.json");
    await writeFile(join(repo, ".claude", "settings.json"), '{"hooks":{}}\n');
    await agente.corregir!(universo(), "sumá un hook en .claude/settings.json", falla);
    expect(await readFile(join(repo, ".claude", "settings.json"), "utf8")).toBe('{"hooks":{}}\n');

    // La que no la pidió, sí: y el agente se entera de que se deshizo.
    await agente.corregir!(universo(), "sumá descuento(precio, porcentaje)", falla);
    expect((await readFile(join(repo, ".claude", "settings.json"), "utf8")).replace(/\r\n/g, "\n")).toBe("{}\n");
    const ultima = (await llamadas()).at(-1)!;
    expect(ultima.prompt).toContain("Se deshizo lo que cambiaste en .claude/settings.json");
  });
});

describe("cada corrección queda en la cosecha y en el parte", () => {
  const taller: Taller = {
    async abrir(id, rama) {
      return { id, rama: `${rama}/${id}`, ruta: `/juguete/${id}`, nacido: 0 };
    },
    async cerrar() {},
  };
  const forma = { archivos: 1, agregadas: 3, quitadas: 0, dependenciasNuevas: 0 };

  it("cuánto costó escribir, cuánto cada vuelta y si retomó la sesión", async () => {
    const arreglados = new Set<string>();
    const agente: Agente = {
      nombre: "de mentira",
      async trabajar() {
        return { forma, gastado: 0.1, modelo: "sonnet" };
      },
      async corregir(u) {
        if (u.id === "u2") throw new FalloDelAgente("se le terminaron las vueltas", 0.04);
        arreglados.add(u.id);
        return { forma, gastado: 0.03, modelo: "sonnet", reanudada: true };
      },
    };
    const cosecha = await sembrar({
      tarea: "sumá descuento",
      cantidad: 2,
      rama: "dolphin",
      taller,
      agente,
      reintentos: 1,
      verificadores: [
        {
          nombre: "test",
          costo: "gratis",
          async correr(u) {
            const paso = arreglados.has(u.id);
            return { paso, detalle: paso ? "test: pasa" : "test: ✖ falta el RangeError", gastado: 0 };
          },
        },
      ],
    });

    const [u1, u2] = cosecha.candidatos;
    expect(u1).toMatchObject({ vivo: true, gastadoAgente: 0.13 });
    expect(u1!.correcciones).toEqual([expect.objectContaining({ fase: "test", gastado: 0.03, reanudada: true, modelo: "sonnet" })]);
    // La corrección que se cayó se paga igual: en la rama, en el total y en el «muerto gratis».
    expect(u2).toMatchObject({ vivo: false, gastadoAgente: 0.14 });
    expect(u2!.correcciones).toEqual([expect.objectContaining({ fase: "test", gastado: 0.04, cayo: true })]);
    expect(cosecha.gastado).toBe(0.27);
    expect(cosecha.muertosGratis).toBe(0);

    expect(cuentaDelAgente(u1!, true)).toBe("escribió por US$ 0,10; corrigió «test» retomando su sesión por US$ 0,03");
    expect(cuentaDelAgente(u1!, false)).toBe("escribió; corrigió «test» retomando su sesión");
    // Si la escritura salió de la memoria de respuestas, no fue «por US$ 0»: fue un ahorro.
    const deMemoria = { ...u1!, deCache: true, ahorro: 0.1, gastadoAgente: 0.16, correcciones: [{ fase: "test", gastado: 0.16, ms: 900 }] };
    expect(cuentaDelAgente(deMemoria, true)).toBe("escribió de memoria (ahorró US$ 0,10); corrigió «test» de cero por US$ 0,16");
    const html = htmlDelParte({ cosecha, cuando: "2026-10-22T06:00:00.000Z", repo: "/juguete" });
    expect(html).toContain("retomó su sesión · US$ 0,03");
    expect(html).toContain("escribió por US$ 0,10; corrigió «test» retomando su sesión por US$ 0,03");
    // Con suscripción, sin plata.
    expect(htmlDelParte({ cosecha: { ...cosecha, suscripcion: true }, cuando: "2026-10-22T06:00:00.000Z", repo: "/juguete" })).not.toContain("US$ 0,03");
  });
});
