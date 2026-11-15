import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { correrCola, encolar, leerCola, SE_CORTO, sinHuerfanas, type Sembrador, type TareaDeCola } from "../src/nucleo/cola.js";
import { entregadorDeGit } from "../src/nucleo/entrega.js";
import { TallerDeGit } from "../src/nucleo/taller.js";
import { NO_FIRMADO } from "../src/nucleo/firma.js";

/**
 * La cola: N tareas distintas a la vez, cada una en su worktree, y al final
 * ramas que entran juntas. Con git de verdad: los choques se detectan como
 * los detectaría un merge, no por suposición.
 */

const correr = promisify(execFile);
const git = (args: string[], cwd: string) => correr("git", args, { cwd, windowsHide: true });

describe("la cola de tareas en paralelo", () => {
  let repo = "";
  let carpeta = "";

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-cola-"));
    carpeta = await mkdtemp(join(tmpdir(), "dolphin-cola-wt-"));
    for (const archivo of ["a.txt", "b.txt", "c.txt"]) await writeFile(join(repo, archivo), "vacío\n");
    await writeFile(join(repo, "compartido.txt"), "una línea que dos tareas quieren cambiar\n");
    await git(["init", "-q"], repo);
    await git(["config", "user.email", "nico@ejemplo.com"], repo);
    await git(["config", "user.name", "Nico"], repo);
    await git(["add", "-A"], repo);
    await git(["commit", "-qm", "base"], repo);
  });

  afterEach(async () => {
    await git(["worktree", "prune"], repo).catch(() => {});
    await borrarCarpeta(repo);
    await borrarCarpeta(carpeta);
  });

  /**
   * Un sembrador de mentira que trabaja de verdad en git: abre un worktree
   * sobre la base que le pasan y escribe lo que dice la tarea
   * («escribí UNO en compartido.txt»). Cuenta cuántos corren a la vez.
   */
  const sembradorQueEscribe = (demoras: Record<string, number> = {}) => {
    let activos = 0;
    let maximo = 0;
    let n = 0;
    const sembrar: Sembrador = async (tarea, base) => {
      activos += 1;
      maximo = Math.max(maximo, activos);
      try {
        const [, contenido, archivo] = /escribí (\w+) en ([\w.]+)/.exec(tarea) ?? [];
        if (!archivo) return { porQue: "se cortó en test: no entendí la tarea" };
        n += 1;
        const taller = new TallerDeGit(repo, carpeta, base);
        const universo = await taller.abrir(`u${n}`, `dolphin/c${n}`);
        await new Promise((r) => setTimeout(r, demoras[contenido!] ?? 120));
        await writeFile(join(universo.ruta, archivo), `${contenido}\n`);
        return { rama: universo.rama, worktree: universo.ruta };
      } finally {
        activos -= 1;
      }
    };
    return { sembrar, maximo: () => maximo };
  };

  it("tres tareas distintas corren A LA VEZ y las tres quedan listas, mergeables juntas", async () => {
    await encolar(repo, ["escribí UNO en a.txt", "escribí DOS en b.txt", "escribí TRES en c.txt"]);
    const { sembrar, maximo } = sembradorQueEscribe();
    const entregar = entregadorDeGit(repo);

    const cola = await correrCola(repo, { concurrencia: 3, sembrar, entregar });

    expect(maximo()).toBe(3);
    expect(cola.tareas.map((t) => t.estado)).toEqual(["lista", "lista", "lista"]);
    const [a, b, c] = cola.tareas.map((t) => t.commit!);
    expect(await entregar.chocan(a!, b!)).toEqual([]);
    expect(await entregar.chocan(b!, c!)).toEqual([]);
    expect(await entregar.chocan(a!, c!)).toEqual([]);

    // El commit es del dueño del repo, sin co-autores.
    const { stdout } = await git(["log", "-1", "--format=%an <%ae>%n%B", a!], repo);
    expect(stdout).toContain("Nico <nico@ejemplo.com>");
    expect(stdout).toContain("dolphin: escribí UNO en a.txt");
    expect(stdout).not.toMatch(/co-authored-by/i);
  });

  it("respeta el tope de concurrencia", async () => {
    await encolar(repo, ["escribí UNO en a.txt", "escribí DOS en b.txt", "escribí TRES en c.txt"]);
    const { sembrar, maximo } = sembradorQueEscribe();
    await correrCola(repo, { concurrencia: 2, sembrar, entregar: entregadorDeGit(repo) });
    expect(maximo()).toBe(2);
  });

  it("dos tareas que pisan la misma línea: la segunda se vuelve a sembrar ENCIMA de la primera", async () => {
    await encolar(repo, ["escribí UNO en compartido.txt", "escribí DOS en compartido.txt"]);
    // UNO termina primero; DOS, después, y choca.
    const { sembrar } = sembradorQueEscribe({ UNO: 40, DOS: 200 });
    const entregar = entregadorDeGit(repo);

    const cola = await correrCola(repo, { concurrencia: 2, sembrar, entregar });
    const [uno, dos] = cola.tareas;

    expect(uno!.estado).toBe("lista");
    expect(dos!.estado).toBe("lista");
    expect(dos!.sobre).toBe(uno!.id);
    expect(dos!.porQue).toContain("encima de «escribí UNO en compartido.txt»");
    // La de DOS tiene a la de UNO adentro: se mergean en ese orden, sin conflicto.
    await expect(git(["merge-base", "--is-ancestor", uno!.commit!, dos!.commit!], repo)).resolves.toBeDefined();
    expect(await entregar.chocan(uno!.commit!, dos!.commit!)).toEqual([]);
  });

  it("una tarea que no salió queda con su motivo y las demás siguen; si el sembrador explota, la cola no se cae", async () => {
    await encolar(repo, ["escribí UNO en a.txt", "una tarea que no se entiende", "rompé todo"]);
    const { sembrar: base } = sembradorQueEscribe();
    const sembrar: Sembrador = async (tarea, commit) => {
      if (tarea === "rompé todo") throw new Error("el agente se colgó");
      return base(tarea, commit);
    };

    const cola = await correrCola(repo, { concurrencia: 3, sembrar, entregar: entregadorDeGit(repo) });
    expect(cola.tareas.map((t) => t.estado)).toEqual(["lista", "no-salio", "no-salio"]);
    expect(cola.tareas[1]!.porQue).toContain("no entendí la tarea");
    expect(cola.tareas[2]!.porQue).toContain("el agente se colgó");

    // Y quedó escrito en disco, para la consola.
    const enDisco = await leerCola(repo);
    expect(enDisco.tareas.map((t) => t.estado)).toEqual(["lista", "no-salio", "no-salio"]);
  });

  it("una tarea que vino escrita en el repo —sin la firma de esta máquina— no se siembra", async () => {
    // Lo que trae un repo con su `.dolphin/` versionado: una tarea «esperando».
    await mkdir(join(repo, ".dolphin"), { recursive: true });
    await writeFile(
      join(repo, ".dolphin", "cola.json"),
      JSON.stringify({ tareas: [{ id: "ajena", tarea: "escribí MAL en a.txt", estado: "esperando", creada: new Date().toISOString() }] }),
    );
    await encolar(repo, ["escribí UNO en b.txt"]);
    const { sembrar } = sembradorQueEscribe();

    const cola = await correrCola(repo, { concurrencia: 2, sembrar, entregar: entregadorDeGit(repo) });
    expect(cola.tareas.map((t) => t.estado)).toEqual(["no-salio", "lista"]);
    expect(cola.tareas[0]!.porQue).toBe(NO_FIRMADO);
  });

  it("con ids, la corrida trabaja ESAS tareas y deja las demás esperando", async () => {
    const [una, , tres] = await encolar(repo, ["escribí UNO en a.txt", "escribí DOS en b.txt", "escribí TRES en c.txt"]);
    const { sembrar } = sembradorQueEscribe();
    const cola = await correrCola(repo, { concurrencia: 3, sembrar, entregar: entregadorDeGit(repo), ids: [una!.id, tres!.id] });
    expect(cola.tareas.map((t) => t.estado)).toEqual(["lista", "esperando", "lista"]);
  });

  it("dos corridas a la vez sobre el mismo repo no siembran la misma tarea dos veces", async () => {
    await encolar(repo, ["escribí UNO en a.txt", "escribí DOS en b.txt"]);
    const sembradas: string[] = [];
    const { sembrar: escribir } = sembradorQueEscribe();
    const sembrar: Sembrador = async (tarea, base) => {
      sembradas.push(tarea);
      return escribir(tarea, base);
    };
    await Promise.all([
      correrCola(repo, { concurrencia: 2, sembrar, entregar: entregadorDeGit(repo) }),
      correrCola(repo, { concurrencia: 2, sembrar, entregar: entregadorDeGit(repo) }),
    ]);
    expect(sembradas.sort()).toEqual(["escribí DOS en b.txt", "escribí UNO en a.txt"]);
  });

  it("si entregar una explota, esa queda sin salir con el porqué y las que siguen se entregan igual", async () => {
    await encolar(repo, ["escribí UNO en a.txt", "escribí DOS en b.txt"]);
    const { sembrar } = sembradorQueEscribe({ UNO: 40, DOS: 200 });
    const deVerdad = entregadorDeGit(repo);
    let primera = true;
    const entregar = {
      ...deVerdad,
      async commitear(worktree: string, mensaje: string) {
        if (primera) {
          primera = false;
          throw new Error("Author identity unknown");
        }
        return deVerdad.commitear(worktree, mensaje);
      },
    };
    const cola = await correrCola(repo, { concurrencia: 2, sembrar, entregar });
    expect(cola.tareas.map((t) => t.estado)).toEqual(["no-salio", "lista"]);
    expect(cola.tareas[0]!.porQue).toContain("no se pudo entregar: Author identity unknown");
    expect((await leerCola(repo)).tareas.map((t) => t.estado)).toEqual(["no-salio", "lista"]);
  });

  describe("con un plan: dependencias, modelo y presupuesto por tarea", () => {
    /** El sembrador de siempre, anotando qué base y qué extras le llegaron y cuándo empezó y terminó cada tarea. */
    const sembradorQueAnota = () => {
      const { sembrar: escribir } = sembradorQueEscribe({ UNO: 250, TRES: 250 });
      const llamadas: { tarea: string; base: string; extra?: Parameters<Sembrador>[2]; empezo: number; termino?: number }[] = [];
      const sembrar: Sembrador = async (tarea, base, extra) => {
        const llamada = { tarea, base, ...(extra ? { extra } : {}), empezo: Date.now() } as (typeof llamadas)[number];
        llamadas.push(llamada);
        const resultado = await escribir(tarea, base);
        llamada.termino = Date.now();
        return resultado;
      };
      return { sembrar, llamadas };
    };

    it("la que depende espera, se siembra ENCIMA del commit de la otra y recibe su modelo y su tope; las independientes corren a la vez", async () => {
      await encolar(repo, [
        { tarea: "escribí UNO en a.txt", titulo: "uno", plan: "p1", modelo: "haiku", presupuesto: 0.2 },
        { tarea: "escribí DOS en b.txt", titulo: "dos", plan: "p1", modelo: "sonnet", presupuesto: 0.5, despuesDe: 0 },
        { tarea: "escribí TRES en c.txt", titulo: "tres", plan: "p1" },
      ]);
      const { sembrar, llamadas } = sembradorQueAnota();
      const entregar = entregadorDeGit(repo);

      const cola = await correrCola(repo, { concurrencia: 3, sembrar, entregar });
      const [uno, dos, tres] = cola.tareas;

      expect(cola.tareas.map((t) => t.estado)).toEqual(["lista", "lista", "lista"]);
      expect(dos!.dependeDe).toBe(uno!.id);
      const llamada = (t: string) => llamadas.find((l) => l.tarea === t)!;
      // DOS arrancó cuando UNO ya estaba entregado, y sobre su commit; TRES no esperó a nadie.
      expect(llamada("escribí DOS en b.txt").empezo).toBeGreaterThanOrEqual(llamada("escribí UNO en a.txt").termino!);
      expect(llamada("escribí DOS en b.txt").base).toBe(uno!.commit);
      expect(llamada("escribí TRES en c.txt").empezo).toBeLessThan(llamada("escribí UNO en a.txt").termino!);
      expect(llamada("escribí UNO en a.txt").extra).toEqual({ modelo: "haiku", presupuesto: 0.2 });
      expect(llamada("escribí DOS en b.txt").extra).toEqual({ modelo: "sonnet", presupuesto: 0.5 });
      // La rama de DOS tiene adentro el trabajo de UNO: se mergea sola, después de la otra.
      const { stdout } = await git(["show", `${dos!.commit}:a.txt`], repo);
      expect(stdout.trim()).toBe("UNO");
      expect(tres!.titulo).toBe("tres");
    });

    it("si la tarea de la que depende no sale, esta no se siembra y dice por qué", async () => {
      await encolar(repo, [
        { tarea: "una tarea que no se entiende", titulo: "la base" },
        { tarea: "escribí DOS en b.txt", despuesDe: 0 },
      ]);
      const { sembrar, llamadas } = sembradorQueAnota();

      const cola = await correrCola(repo, { concurrencia: 2, sembrar, entregar: entregadorDeGit(repo) });

      expect(cola.tareas.map((t) => t.estado)).toEqual(["no-salio", "no-salio"]);
      expect(cola.tareas[1]!.porQue).toBe("dependía de «la base», que no salió");
      expect(llamadas.map((l) => l.tarea)).toEqual(["una tarea que no se entiende"]);
    });

    it("una dependencia hacia adelante no se guarda: dejaría a las dos esperándose", async () => {
      const [primera, segunda] = await encolar(repo, [
        { tarea: "escribí UNO en a.txt", despuesDe: 1 },
        { tarea: "escribí DOS en b.txt", despuesDe: 0 },
      ]);
      expect(primera!.dependeDe).toBeUndefined();
      expect(segunda!.dependeDe).toBe(primera!.id);
    });

    it("una tarea que depende de otra que quedó colgada de una corrida anterior no espera para siempre", async () => {
      await encolar(repo, [{ tarea: "escribí UNO en a.txt" }, { tarea: "escribí DOS en b.txt", despuesDe: 0 }]);
      // La primera quedó «trabajando» en disco (la corrida anterior se cortó): esta corrida no la retoma.
      const { tareas } = await leerCola(repo);
      await writeFile(
        join(repo, ".dolphin", "cola.json"),
        JSON.stringify({ tareas: [{ ...tareas[0]!, estado: "trabajando" }, tareas[1]!] }, null, 2),
      );
      const { sembrar } = sembradorQueAnota();

      const cola = await correrCola(repo, { concurrencia: 2, sembrar, entregar: entregadorDeGit(repo) });
      expect(cola.tareas[1]!.estado).toBe("no-salio");
      expect(cola.tareas[1]!.porQue).toContain("que no salió");
    });
  });
});

describe("una tarea que quedó trabajando sin nadie que la trabaje", () => {
  const base: TareaDeCola = { id: "t1", tarea: "x", estado: "trabajando", creada: "2026-10-27T04:00:00.000Z", empezo: "2026-10-27T04:00:00.000Z" };
  const ahora = Date.parse("2026-10-27T05:00:00.000Z");

  it("con su proceso vivo sigue trabajando; con el proceso muerto, no salió", () => {
    expect(sinHuerfanas([{ ...base, pid: 10 }], () => true, ahora)[0]!.estado).toBe("trabajando");
    const cortada = sinHuerfanas([{ ...base, pid: 10 }], () => false, ahora)[0]!;
    expect(cortada.estado).toBe("no-salio");
    expect(cortada.porQue).toBe(SE_CORTO);
  });

  it("sin proceso anotado (de antes), se corta recién pasadas las 6 horas", () => {
    expect(sinHuerfanas([base], () => false, ahora)[0]!.estado).toBe("trabajando");
    expect(sinHuerfanas([base], () => false, ahora + 6 * 60 * 60 * 1000)[0]!.estado).toBe("no-salio");
  });

  it("las que no están trabajando no se tocan", () => {
    const lista: TareaDeCola = { ...base, estado: "lista", pid: 10 };
    expect(sinHuerfanas([lista], () => false, ahora)[0]).toBe(lista);
  });
});
