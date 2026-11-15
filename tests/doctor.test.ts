import { execFile } from "node:child_process";
import { lstat, mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { doctor, textoDelDoctor, worktreesNombrados } from "../src/doctor.js";
import { leerBandeja, sumarAsuntos, tomarAsunto } from "../src/nucleo/bandeja.js";

/** dolphin doctor con cada falla simulada de verdad (git, carpetas, enlaces, bandeja) y procesos inyectados. */

const correr = promisify(execFile);
const git = async (args: string[], cwd: string) => (await correr("git", args, { cwd, windowsHide: true })).stdout.trim();
let repo = "";
let afuera = "";
const sinNada = { procesos: async () => [], casa: "", temporal: "" };

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "dolphin-doctor-"));
  afuera = await mkdtemp(join(tmpdir(), "dolphin-doctor-afuera-"));
  sinNada.casa = afuera;
  sinNada.temporal = afuera;
  await writeFile(join(repo, "a.js"), "export const a = 1\n");
  await git(["init", "-q", "-b", "main"], repo);
  await git(["config", "user.email", "n@n"], repo);
  await git(["config", "user.name", "n"], repo);
  await git(["add", "-A"], repo);
  await git(["commit", "-qm", "base"], repo);
  // Una sesión de Claude, para que no aparezca en todos los casos.
  await mkdir(join(afuera, ".claude"), { recursive: true });
  await writeFile(join(afuera, ".claude", ".credentials.json"), "{}");
});
afterEach(async () => {
  await git(["worktree", "prune"], repo).catch(() => {});
  await Promise.all([repo, afuera].map((r) => borrarCarpeta(r)));
});

describe("lo que el doctor arregla solo", () => {
  it("un repo sano: nada que decir", async () => {
    const h = await doctor(repo, {}, sinNada);
    expect(h).toEqual([]);
    expect(textoDelDoctor(h)).toBe("Todo en orden: no encontré nada roto.");
  });

  it("el worktree de un Dolphin que murió se borra con su rama; uno que git recuerda sin carpeta, se olvida", async () => {
    const huerfano = join(afuera, "u1");
    await git(["worktree", "add", "-q", "-b", "dolphin/x/u1", huerfano], repo);
    await writeFile(join(huerfano, "b.js"), "sin commitear\n");
    await git(["worktree", "lock", "--reason", "dolphin 999999", huerfano], repo);
    const perdido = join(afuera, "perdido");
    await git(["worktree", "add", "-q", "-b", "otra", perdido], repo);
    await borrarCarpeta(perdido);

    const h = await doctor(repo, {}, sinNada);
    expect(h.map((x) => [x.que, x.arreglado])).toEqual([
      ["worktrees perdidos", true],
      ["worktrees huérfanos", true],
    ]);
    const lista = await git(["worktree", "list"], repo);
    expect(lista).not.toContain("u1");
    expect(lista).not.toContain("perdido");
    expect(await git(["branch", "--list", "dolphin/x/u1"], repo)).toBe("");
  });

  it("borra las ramas de Dolphin que ya están en tu rama, y deja las que no", async () => {
    await git(["branch", "dolphin/ya-integrada/u1"], repo);
    await git(["checkout", "-q", "-b", "dolphin/sin-integrar/u1"], repo);
    await writeFile(join(repo, "c.js"), "nuevo\n");
    await git(["add", "-A"], repo);
    await git(["commit", "-qm", "trabajo sin integrar"], repo);
    await git(["checkout", "-q", "main"], repo);
    const [h] = await doctor(repo, {}, sinNada);
    expect(h).toMatchObject({ que: "ramas integradas", arreglado: true, detalle: "borré 1 rama de Dolphin que ya estaba en tu rama" });
    expect(await git(["branch", "--list", "dolphin/*", "--format=%(refname:short)"], repo)).toBe("dolphin/sin-integrar/u1");
  });

  it("un node_modules enlazado a nada se saca", async () => {
    const wt = join(afuera, "con-enlace");
    await git(["worktree", "add", "-q", "-b", "con-enlace", wt], repo);
    const destino = join(afuera, "modulos");
    await mkdir(destino);
    await symlink(destino, join(wt, "node_modules"), "junction");
    await borrarCarpeta(destino);
    const h = await doctor(repo, {}, sinNada);
    expect(h).toEqual([{ que: "enlaces rotos", arreglado: true, detalle: `1 node_modules enlazado apuntaba a nada (node_modules en ${wt.replaceAll("\\", "/")} apuntaba a ${destino}): saqué el enlace` }]);
  });

  it("un node_modules ANIDADO enlazado a nada también se encuentra, dice cuál era y deja en paz al sano", async () => {
    const wt = join(afuera, "con-anidados");
    await git(["worktree", "add", "-q", "-b", "con-anidados", wt], repo);
    const sano = join(afuera, "modulos-sanos");
    const perdido = join(afuera, "modulos-perdidos");
    await mkdir(sano);
    await mkdir(perdido);
    await mkdir(join(wt, "escritorio"), { recursive: true });
    await mkdir(join(wt, "herramientas", "cli"), { recursive: true });
    await symlink(sano, join(wt, "node_modules"), "junction");
    await symlink(perdido, join(wt, "escritorio", "node_modules"), "junction");
    await symlink(sano, join(wt, "herramientas", "cli", "node_modules"), "junction");
    await borrarCarpeta(perdido);

    // Sólo mirando: dice cuál está roto y no toca nada.
    const [mirado] = await doctor(repo, { arreglar: false }, sinNada);
    expect(mirado).toMatchObject({ que: "enlaces rotos", arreglado: false });
    expect(mirado!.detalle).toContain(`escritorio/node_modules en ${wt.replaceAll("\\", "/")} apuntaba a ${perdido}`);
    expect(mirado!.detalle).not.toContain("herramientas");
    expect(await lstat(join(wt, "escritorio", "node_modules")).then(() => true, () => false)).toBe(true);

    // Arreglando: saca sólo el roto.
    const [arreglado] = await doctor(repo, {}, sinNada);
    expect(arreglado).toMatchObject({ que: "enlaces rotos", arreglado: true });
    expect(await lstat(join(wt, "escritorio", "node_modules")).then(() => true, () => false)).toBe(false);
    expect(await lstat(join(wt, "node_modules")).then((d) => d.isSymbolicLink())).toBe(true);
    expect(await lstat(join(wt, "herramientas", "cli", "node_modules")).then((d) => d.isSymbolicLink())).toBe(true);
    expect(await doctor(repo, {}, sinNada)).toEqual([]);
  });

  it("un asunto «implementando» de un proceso muerto vuelve a abierto", async () => {
    const { sumados } = await sumarAsuntos(repo, [{ tipo: "idea", titulo: "cupones", detalle: "cupones", origen: "persona" }]);
    await tomarAsunto(repo, sumados[0]!.id, 999999, new Date(Date.now() - 3_600_000));
    const h = await doctor(repo, {}, { ...sinNada, vivo: () => false });
    expect(h.map((x) => x.que)).toEqual(["asuntos colgados"]);
    expect((await leerBandeja(repo)).asuntos[0]!.estado).toBe("abierto");
  });

  it("corta al agente que sigue corriendo sobre un worktree que ya no existe, y a ningún otro", async () => {
    const vivo = join(afuera, "dolphin-abc123", "u2");
    await mkdir(vivo, { recursive: true });
    const cortados: number[] = [];
    const h = await doctor(repo, {}, {
      ...sinNada,
      procesos: async () => [
        { pid: 4242, comando: `node claude.js -p "hacé algo" --add-dir ${join(afuera, "dolphin-zzz999", "u1")}` },
        { pid: 4343, comando: `codex exec -C ${vivo}` },
        { pid: 4444, comando: `node servidor.js ${join(afuera, "dolphin-zzz999", "u1")}` },
      ],
      matar: async (pid) => void cortados.push(pid),
    });
    expect(cortados).toEqual([4242]);
    expect(h).toEqual([{ que: "agentes huérfanos", arreglado: true, detalle: "1 agente seguía corriendo sobre un worktree que ya no existe: lo corté" }]);
  });
});

describe("lo que no se arregla solo", () => {
  it("sin sesión de Claude, o sin cupo, dice qué hacer", async () => {
    await borrarCarpeta(join(afuera, ".claude"));
    await mkdir(join(afuera, ".dolphin"), { recursive: true });
    const ahora = new Date("2026-10-27T22:00:00Z");
    await writeFile(join(afuera, ".dolphin", "plan-uso.json"), JSON.stringify({ escritoEn: "2026-10-27T21:55:00Z", agentes: [{ agente: "claude", ventanas: [{ nombre: "5h", usadoPct: 97, reiniciaEn: null }, { nombre: "semana", usadoPct: 40, reiniciaEn: null }] }] }));
    const h = await doctor(repo, {}, { ...sinNada, ahora: () => ahora });
    expect(h.map((x) => [x.que, x.arreglado])).toEqual([
      ["sesión de Claude", false],
      ["cupo", false],
    ]);
    expect(h[1]!.detalle).toBe("claude está al 97 % de la ventana de 5 h: si tenés otra cuenta, Dolphin pasa a esa sola");
    expect(textoDelDoctor(h)).toMatch(/^Para que mires:\n- no encontré una sesión de Claude/);
  });

  it("con --solo-mirar dice qué arreglaría sin tocar nada", async () => {
    await git(["branch", "dolphin/ya-integrada/u1"], repo);
    const [h] = await doctor(repo, { arreglar: false }, sinNada);
    expect(h).toMatchObject({ que: "ramas integradas", arreglado: false, detalle: "1 rama de Dolphin ya está en tu rama y se puede borrar" });
    expect(await git(["branch", "--list", "dolphin/*"], repo)).not.toBe("");
  });

  it("reconoce los worktrees de Dolphin en una línea de comando, con cualquier barra", () => {
    expect(worktreesNombrados("claude --cwd C:\\Users\\n\\AppData\\Local\\Temp\\dolphin-ab12CD\\u3 -p x", "C:\\Users\\n\\AppData\\Local\\Temp")).toEqual(["C:\\Users\\n\\AppData\\Local\\Temp\\dolphin-ab12CD\\u3"]);
    expect(worktreesNombrados("codex -C /tmp/dolphin-x1/equipo", "/tmp/")).toEqual(["/tmp/dolphin-x1/equipo"]);
    expect(worktreesNombrados("node app.js", "/tmp")).toEqual([]);
  });
});
