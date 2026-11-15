import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { citarShell, comandoRemoto, correrPorSsh, maquinaDelTurno, type Host } from "../src/nucleo/ssh.js";
import type { Correr } from "../src/nucleo/pr.js";
import { leerDesprendidos } from "../src/nucleo/turnos-desprendidos.js";

/**
 * Un turno en el VPS por SSH, probado con un doble: el comando que se
 * armaría, cómo se escapa la tarea y que la cosecha vuelve a esta máquina.
 */

const vps: Host = { destino: "nico@vps", repo: "/var/www/tienda", dolphin: "/opt/dolphin-app" };

describe("el comando remoto", () => {
  it("las comillas simples de la tarea no rompen el shell de allá", () => {
    expect(citarShell("it's")).toBe("'it'\\''s'");
    expect(citarShell("$(rm -rf /) y `ls`")).toBe("'$(rm -rf /) y `ls`'"); // nada se expande adentro
  });

  it("una tarea va a la siembra, corriendo sola, con la tarea citada entera", () => {
    const cmd = comandoRemoto({ tareas: ["Arreglá el IVA\ndel carrito"], agente: "claude", modelo: "sonnet" }, vps);
    expect(cmd).toBe(
      "cd '/opt/dolphin-app' && node --import tsx src/cli.ts --repo '/var/www/tienda' --agente 'claude' --modelo 'sonnet' --automatico --tarea 'Arreglá el IVA\ndel carrito' --igual",
    );
  });

  it("varias tareas van a la cola", () => {
    const cmd = comandoRemoto({ tareas: ["una", "otra"], agente: "mentira" }, vps);
    expect(cmd).toContain("src/cola-cli.ts");
    expect(cmd).toContain("--tarea 'una' --tarea 'otra'");
  });
});

describe("correr por SSH", () => {
  let repo = "";
  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-ssh-"));
  });
  afterEach(async () => {
    await borrarCarpeta(repo);
  });

  const INICIO = "2026-10-22T02:00:00Z";
  type Respuesta = string | Error;

  /**
   * Un VPS de mentira: lanza el turno desprendido, contesta las consultas en el orden dado (un Error
   * es un corte de red) y tiene lo que dejó la corrida.
   */
  const vpsDeMentira = (
    dejo: { ultima?: unknown; cola?: unknown; consultas?: Respuesta[]; log?: string; noArranca?: boolean },
    llamadas: string[][] = [],
  ): Correr => {
    const consultas = [...(dejo.consultas ?? [terminado(0)])];
    return async (cmd, args) => {
      llamadas.push([cmd, ...args]);
      const comando = String(args[args.length - 1]);
      if (comando.includes("nohup")) return dejo.noArranca ? "" : JSON.stringify({ pid: 4242, inicio: INICIO, arranque: "b1" });
      if (comando.includes("kill -0")) {
        const r = consultas.length > 1 ? consultas.shift()! : consultas[0]!;
        if (r instanceof Error) throw r;
        return r;
      }
      if (comando.includes("tail -n")) return dejo.log ?? "";
      if (comando.endsWith("ultima.json'")) return dejo.ultima ? JSON.stringify(dejo.ultima) : "";
      if (comando.endsWith("cola.json'")) return dejo.cola ? JSON.stringify(dejo.cola) : "";
      return "";
    };
  };
  const corriendo = () => `${JSON.stringify({ pid: 4242, inicio: INICIO, arranque: "b1" })}\narranque=b1\nvivo\n`;
  const terminado = (codigo: number) => `${JSON.stringify({ pid: 4242, inicio: INICIO, arranque: "b1", codigo, fin: "2026-10-22T03:00:00Z" })}\narranque=b1\nmuerto\n`;
  const sinEsperar = { esperar: async () => undefined, cada: 15_000 };

  it("lanza el turno desprendido con BatchMode, lo sigue y se trae la cosecha", async () => {
    const llamadas: string[][] = [];
    const esperas: number[] = [];
    const cosecha = { cuando: "2026-10-22T03:00:00.000Z", tarea: "Arreglá el IVA", ganador: { universo: { id: "u1" } } };

    const r = await correrPorSsh(repo, { id: "c1", tareas: ["Arreglá el IVA"], agente: "claude" }, vps, vpsDeMentira({ ultima: cosecha, consultas: [corriendo(), terminado(0)] }, llamadas), undefined, {
      ...sinEsperar,
      esperar: async (ms) => void esperas.push(ms),
    });

    expect(r.salio).toBe(true);
    expect(llamadas[0]!.slice(0, 3)).toEqual(["ssh", "-o", "BatchMode=yes"]);
    // El destino va después de `--`: nada que venga del config se lee como una opción de ssh.
    expect(llamadas[0]!.slice(-3, -1)).toEqual(["--", "nico@vps"]);
    // Desprendido: en su sesión, con su log y su estado en .dolphin/turnos/ del repo de allá.
    const lanzar = llamadas[0]!.at(-1)!;
    expect(lanzar).toMatch(/^sh -c /);
    expect(lanzar).toContain("nohup");
    expect(lanzar).toContain("/var/www/tienda/.dolphin/turnos/c1.log");
    expect(esperas).toEqual([15_000]);
    expect(llamadas.map((l) => l[l.length - 1])).toContain("cat '/var/www/tienda/.dolphin/ultima.json'");
    const traida = JSON.parse(await readFile(join(repo, ".dolphin", "cosechas", "2026-10-22T03-00-00-000Z.json"), "utf8"));
    expect(traida.tarea).toBe("Arreglá el IVA");
    expect(JSON.parse(await readFile(join(repo, ".dolphin", "ultima.json"), "utf8")).tarea).toBe("Arreglá el IVA");
    // Y queda tachado en la libreta de acá: el doctor no lo va a reclamar.
    expect((await leerDesprendidos(repo))[0]).toMatchObject({ id: "c1", como: "terminó" });
  });

  it("un corte de red no da el turno por fallado: espera cada vez más, hasta dos minutos, y sigue", async () => {
    const esperas: number[] = [];
    const corte = new Error("ssh: connect to host vps port 22: Network is unreachable");
    const cosecha = { cuando: "2026-10-22T03:00:00.000Z", ganador: { universo: { id: "u1" } } };
    const r = await correrPorSsh(
      repo,
      { id: "c2", tareas: ["x"], agente: "claude" },
      vps,
      vpsDeMentira({ ultima: cosecha, consultas: [corriendo(), corte, corte, corte, corte, corriendo(), terminado(0)] }),
      undefined,
      { ...sinEsperar, esperar: async (ms) => void esperas.push(ms) },
    );
    expect(r.salio).toBe(true);
    expect(esperas).toEqual([15_000, 30_000, 60_000, 120_000, 120_000, 15_000]);
  });

  it("si allá el proceso ya no está y no dejó código (se reinició el VPS), se cortó, con lo último del log", async () => {
    const sinCodigo = `${JSON.stringify({ pid: 4242, inicio: INICIO, arranque: "b1" })}\narranque=b2\nvivo\n`;
    const r = await correrPorSsh(repo, { id: "c3", tareas: ["x"], agente: "claude" }, vps, vpsDeMentira({ consultas: [sinCodigo], log: "fase 2: typecheck\n" }), undefined, sinEsperar);
    expect(r.salio).toBe(false);
    expect(r.porQue).toContain("se cortó en nico@vps");
    expect(r.porQue).toContain("fase 2: typecheck");
  });

  it("pasado el tope total, lo corta allá y lo da por fallado", async () => {
    const llamadas: string[][] = [];
    let reloj = 0;
    const r = await correrPorSsh(repo, { id: "c4", tareas: ["x"], agente: "claude" }, vps, vpsDeMentira({ consultas: [corriendo()] }, llamadas), undefined, {
      cada: 15_000,
      ahora: () => reloj,
      esperar: async () => void (reloj += 60 * 60_000),
    });
    expect(r.porQue).toContain("pasó el tope de 3 h en nico@vps");
    // Corta la sesión de ESE turno, después de mirar que el pid siga siendo suyo.
    expect(llamadas.at(-1)!.at(-1)).toContain("p=4242");
    expect(llamadas.at(-1)!.at(-1)).toContain('pkill -TERM -s "$p"');
    expect(llamadas.at(-1)!.at(-1)).toContain("c4.json");
  });

  it("cancelado mientras corre: lo corta allá también", async () => {
    const llamadas: string[][] = [];
    const control = new AbortController();
    const r = await correrPorSsh(repo, { id: "c5", tareas: ["x"], agente: "claude" }, vps, vpsDeMentira({ consultas: [corriendo()] }, llamadas), control.signal, {
      cada: 15_000,
      esperar: async () => control.abort(),
    });
    expect(r).toEqual({ salio: false, porQue: "se canceló mientras corría en nico@vps (lo corté allá también)" });
    expect(llamadas.at(-1)!.at(-1)).toContain("p=4242");
    expect(llamadas.at(-1)!.at(-1)).toContain('pkill -TERM -s "$p"');
  });

  it("si salió mal allá, dice el código y la última línea del log", async () => {
    const r = await correrPorSsh(repo, { id: "c6", tareas: ["x"], agente: "claude" }, vps, vpsDeMentira({ consultas: [terminado(1)], log: "Error: no encontré «claude»\n" }), undefined, sinEsperar);
    expect(r).toEqual({ salio: false, porQue: "en nico@vps: salió con código 1 (Error: no encontré «claude»)" });
  });

  it("si no llega a arrancar, lo dice sin quedarse esperando", async () => {
    const r = await correrPorSsh(repo, { id: "c7", tareas: ["x"], agente: "claude" }, vps, vpsDeMentira({ noArranca: true, log: "sh: node: not found" }), undefined, sinEsperar);
    expect(r).toEqual({ salio: false, porQue: "en nico@vps: el turno no arrancó (sh: node: not found)" });
  });

  it("si el SSH falla, el motivo dice en qué máquina y qué pasó", async () => {
    const doble: Correr = async () => {
      throw Object.assign(new Error("x"), { stderr: "Permission denied (publickey).\n" });
    };
    const r = await correrPorSsh(repo, { tareas: ["x"], agente: "claude" }, vps, doble);
    expect(r).toEqual({ salio: false, porQue: "en nico@vps: Permission denied (publickey)." });
  });

  it("si corrió pero ninguna rama pasó, vuelve la cosecha igual y dice por qué", async () => {
    const ultima = { cuando: "2026-10-22T03:00:00.000Z", porQueGano: "La rama no pasó el portón." };
    const r = await correrPorSsh(repo, { tareas: ["x"], agente: "claude" }, vps, vpsDeMentira({ ultima }), undefined, sinEsperar);
    expect(r).toMatchObject({ salio: false, porQue: "La rama no pasó el portón." });
    expect(r.cosecha).toBeDefined();
  });

  it("la cosecha de una corrida anterior no se da por buena ni se trae", async () => {
    // La de ayer, con ganador: si el turno de hoy no dejó nada, antes volvía esta y «salía».
    const ultima = { cuando: "2026-10-21T03:00:00.000Z", ganador: { universo: { id: "u1" } } };
    const r = await correrPorSsh(repo, { tareas: ["x"], agente: "claude" }, vps, vpsDeMentira({ ultima }), undefined, sinEsperar);
    expect(r).toEqual({ salio: false, porQue: "corrió en nico@vps pero no dejó una cosecha nueva" });
  });

  it("varias tareas: lo que salió lo dice la cola de allá, contando solo las de esta corrida", async () => {
    const cola = {
      tareas: [
        { creada: "2026-10-21T02:00:00.000Z", estado: "no-salio" }, // de ayer: no cuenta
        { creada: "2026-10-22T02:00:05.000Z", estado: "lista" },
        { creada: "2026-10-22T02:00:05.000Z", estado: "lista" },
      ],
    };
    expect(await correrPorSsh(repo, { tareas: ["una", "otra"], agente: "claude" }, vps, vpsDeMentira({ cola }), undefined, sinEsperar)).toEqual({ salio: true });
  });

  it("un destino que empieza con «-» no se le pasa a ssh: sería una opción", async () => {
    const llamadas: string[][] = [];
    const r = await correrPorSsh(repo, { tareas: ["x"], agente: "claude" }, { ...vps, destino: "-oProxyCommand=calc" }, vpsDeMentira({}, llamadas));
    expect(r.salio).toBe(false);
    expect(r.porQue).toContain("no es un destino de ssh");
    expect(llamadas).toEqual([]);
  });
});

describe("adónde va un turno por SSH", () => {
  it("a la máquina firmada al agendar, si el host del repo sigue siendo esa", () => {
    expect(maquinaDelTurno({ host: "vps", maquina: vps }, { vps })).toEqual({ ok: true, maquina: vps });
  });

  it("si un pull cambió adónde apunta el nombre, a ninguna de las dos", () => {
    const r = maquinaDelTurno({ host: "vps", maquina: vps }, { vps: { ...vps, destino: "otro@atacante" } });
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.porQue).toContain("nico@vps → otro@atacante");
  });

  it("sin la máquina firmada, o sin el host, no corre", () => {
    expect(maquinaDelTurno({ host: "vps" }, { vps }).ok).toBe(false);
    expect(maquinaDelTurno({ host: "vps", maquina: vps }, {})).toMatchObject({ ok: false, porQue: "ya no hay un host «vps» en dolphin.config.json" });
  });
});
