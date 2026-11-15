import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { MOTORES_DE_CLI, agenteDeCli, fallaDeJson, motorDeCli, type DefinicionDeMotor } from "../src/agentes/motores.js";
import { MOTORES } from "../src/nucleo/router.js";
import { FalloDelAgente, type Universo } from "../src/nucleo/tipos.js";

/**
 * La tabla de motores. Lo que se prueba acá es el argumento exacto que recibe
 * cada CLI, porque es lo único que no se puede verificar sin tenerlos
 * instalados: una bandera de menos no falla ruidosamente, deja una rama vacía.
 */

const correr = promisify(execFile);
const ctx = (extra: Partial<Parameters<DefinicionDeMotor["args"]>[0]> = {}) => ({
  prompt: "hacé X",
  ruta: "/r",
  todo: false,
  ...extra,
});

describe("la tabla de motores de CLI", () => {
  it("todos los de la tabla están en la lista de motores que acepta la línea de comandos", () => {
    for (const m of MOTORES_DE_CLI) expect(MOTORES).toContain(m.nombre);
  });

  it("gemini: headless con -p, salida json, y la carpeta confiada para que edite", () => {
    const gemini = motorDeCli("gemini")!;
    expect(gemini.args(ctx())).toEqual(["-o", "json", "--skip-trust", "--approval-mode", "auto_edit", "-p", "hacé X"]);
    // Medido corriéndolo: sin --skip-trust, en una carpeta nueva gemini descarta
    // auto_edit («the current folder is not trusted») y vuelve a pedir permiso por
    // cada edición. Un worktree recién abierto nunca está confiado: sin esto, el
    // motor no escribe una línea en ninguna rama.
    expect(gemini.args(ctx())).toContain("--skip-trust");
    // Con permisos «todo» no pregunta por nada; siempre dentro de un worktree.
    expect(gemini.args(ctx({ todo: true }))).toContain("yolo");
    expect(gemini.args(ctx({ modelo: "gemini-3.8-flash" }))).toEqual([
      "-o",
      "json",
      "--skip-trust",
      "--approval-mode",
      "auto_edit",
      "-m",
      "gemini-3.8-flash",
      "-p",
      "hacé X",
    ]);
    // La respuesta sale del campo `response` del json, y si no se puede leer, cruda.
    expect(gemini.respuesta!('{"response":"listo","stats":{}}')).toBe("listo");
    expect(gemini.respuesta!("no es json")).toBe("no es json");
  });

  it("opencode: run con el mensaje posicional y la carpeta del worktree", () => {
    expect(motorDeCli("opencode")!.args(ctx())).toEqual(["run", "--format", "json", "--dir", "/r", "hacé X"]);
  });

  it("copilot: -p no interactivo y sin pedir permiso por herramienta", () => {
    // Sin --allow-all-tools, un modo no interactivo se queda esperando un
    // permiso que nadie va a dar.
    expect(motorDeCli("copilot")!.args(ctx())).toEqual(["-p", "hacé X", "--allow-all-tools"]);
  });

  it("cursor: -p con --force, porque sin --force propone los cambios y no escribe ninguno", () => {
    const args = motorDeCli("cursor")!.args(ctx());
    expect(args).toEqual(["-p", "hacé X", "--output-format", "json", "--force"]);
    // Es la bandera que no se puede olvidar: una rama sin un archivo tocado no es una rama.
    expect(args).toContain("--force");
    expect(motorDeCli("cursor")!.respuesta!('{"result":"hecho"}')).toBe("hecho");
  });

  it("droid: exec con --auto, porque sin --auto la corrida es de solo lectura", () => {
    expect(motorDeCli("droid")!.args(ctx())).toEqual(["exec", "-o", "json", "--auto", "medium", "hacé X"]);
    expect(motorDeCli("droid")!.args(ctx({ todo: true }))).toContain("high");
  });

  it("amp: el pedido por la entrada estándar, que es lo que menos supone", () => {
    const amp = motorDeCli("amp")!;
    expect(amp.pedido).toBe("entrada");
    expect(amp.args(ctx({ prompt: "" }))).toEqual(["-x"]);
  });

  it("qwen: las banderas de Gemini CLI, de donde salió", () => {
    expect(motorDeCli("qwen")!.args(ctx())).toEqual(["--skip-trust", "-p", "hacé X"]);
    expect(motorDeCli("qwen")!.args(ctx({ todo: true, modelo: "qwen3-coder" }))).toEqual([
      "--skip-trust",
      "-y",
      "-m",
      "qwen3-coder",
      "-p",
      "hacé X",
    ]);
  });

  it("el motivo de la falla sale del json, no de la última línea de la salida", () => {
    // Lo que de verdad contesta gemini sin clave configurada. Quedarse con la
    // última línea dejaba el mensaje en «salió con 41: }».
    const deGemini = `{
 "session_id": "x",
 "error": {
  "type": "Error",
  "message": "When using Gemini API, you must specify the GEMINI_API_KEY environment variable.",
  "code": 41
 }
}`;
    expect(fallaDeJson(deGemini)).toContain("you must specify the GEMINI_API_KEY");
    expect(fallaDeJson('{"error":"se acabó el cupo"}')).toBe("se acabó el cupo");
    // Sin error en el json no hay falla que informar: decide el código de salida.
    expect(fallaDeJson('{"response":"listo"}')).toBeUndefined();
    expect(fallaDeJson("no es json")).toBeUndefined();
  });

  it("cada fila dice hasta dónde se verificó, y ninguna miente de más", () => {
    const porNombre = Object.fromEntries(MOTORES_DE_CLI.map((m) => [m.nombre, m.probado]));
    // Los dos que están instalados en la máquina donde se escribió esto.
    expect(porNombre["gemini"]).toBe("acá");
    expect(porNombre["opencode"]).toBe("acá");
    // Estos salen de la documentación oficial de cada uno.
    expect([porNombre["copilot"], porNombre["cursor"], porNombre["droid"]]).toEqual([
      "documentación",
      "documentación",
      "documentación",
    ]);
    // Y estos no se pudieron verificar: se dice, no se disimula.
    expect([porNombre["amp"], porNombre["qwen"]]).toEqual(["no", "no"]);
  });
});

describe("el adaptador, con un proceso de verdad en lugar del CLI", () => {
  let repo = "";
  let guion = "";
  let universo: Universo;

  /** Un motor de juguete: node corriendo el guión que se le diga. */
  const deJuguete = (extra: Partial<DefinicionDeMotor> = {}): DefinicionDeMotor => ({
    nombre: "juguete",
    cmd: process.execPath,
    queEs: "un motor de juguete",
    pedido: "argumento",
    probado: "no",
    args: ({ prompt }) => [guion, prompt],
    ...extra,
  });

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-motores-"));
    guion = join(repo, "..", `motor-${Date.now()}.mjs`);
    await writeFile(join(repo, "leeme.txt"), "hola\n");
    for (const args of [["init", "-q", "-b", "main"], ["add", "-A"], ["-c", "user.email=n@n", "-c", "user.name=n", "commit", "-qm", "base"]]) {
      await correr("git", args, { cwd: repo, windowsHide: true });
    }
    universo = { id: "u1", rama: "dolphin/x", ruta: repo, nacido: Date.now() };
  });

  afterEach(async () => {
    await borrarCarpeta(repo);
    await rm(guion, { force: true });
  });

  it("corre el CLI, mide lo que tocó y no inventa un costo que nadie informó", async () => {
    // El motor de juguete escribe un archivo, como haría un agente de verdad.
    await writeFile(guion, `import {writeFileSync} from "node:fs";\nwriteFileSync("nuevo.txt", process.argv[2] ?? "");\nconsole.log('{"response":"hice lo que pediste"}');\n`);

    const trabajo = await agenteDeCli(deJuguete({ respuesta: (c) => JSON.parse(c.trim()).response as string }), {}).trabajar(universo, "sumá un archivo");

    expect(trabajo.forma.archivos).toBe(1);
    // Ninguno de estos CLI informa plata: un cero haría pasar por gratis lo que no se midió.
    expect(trabajo.gastado).toBe(0);
    expect(trabajo.costoDesconocido).toBe(true);
    expect(trabajo.modelo).toBe("juguete");
    // Y el pedido le llegó de verdad.
    expect(await readFile(join(repo, "nuevo.txt"), "utf8")).toContain("sumá un archivo");
  });

  it("un CLI que contesta sin tocar nada no pasa por agente que trabajó", async () => {
    await writeFile(guion, `console.log("te explico cómo lo harías");\n`);

    await expect(agenteDeCli(deJuguete(), {}).trabajar(universo, "sumá un archivo")).rejects.toThrow(
      /no tocó ningún archivo/,
    );
  });

  it("un CLI que falla dice con qué código salió y lo último que escribió", async () => {
    await writeFile(guion, `console.log("se acabó tu cupo de hoy");\nprocess.exit(3);\n`);

    const error = await agenteDeCli(deJuguete(), {})
      .trabajar(universo, "x")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(FalloDelAgente);
    expect((error as Error).message).toBe("juguete salió con 3: se acabó tu cupo de hoy");
  });

  it("el pedido también puede ir por la entrada estándar", async () => {
    await writeFile(
      guion,
      `import {writeFileSync} from "node:fs";\nlet s="";process.stdin.on("data",d=>s+=d).on("end",()=>{writeFileSync("nuevo.txt",s);console.log("listo")});\n`,
    );

    await agenteDeCli(deJuguete({ pedido: "entrada", args: () => [guion] }), {}).trabajar(universo, "por la entrada");

    expect(await readFile(join(repo, "nuevo.txt"), "utf8")).toContain("por la entrada");
  });

  it("si el CLI no está en el PATH, lo dice con el nombre y qué instalar", async () => {
    const inexistente = deJuguete({ cmd: "no-existe-este-agente-xyz", queEs: "Amp, de Sourcegraph" });

    await expect(agenteDeCli(inexistente, {}).trabajar(universo, "x")).rejects.toThrow(
      /no encontré «no-existe-este-agente-xyz» en el PATH: instalá Amp, de Sourcegraph/,
    );
  });
});
