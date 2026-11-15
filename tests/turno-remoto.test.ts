import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { doctor } from "../src/doctor.js";
import { comandoDeAdjuntar, comandoDeConsulta, comandoDeCorte, comandoDesprendido, idValido, leerConsulta, seguirTurno } from "../src/nucleo/turno-remoto.js";
import { anotarDesprendido, desprendidosVencidos, leerDesprendidos, maquinaParaVer, tacharDesprendido } from "../src/nucleo/turnos-desprendidos.js";

/**
 * El turno desprendido en el VPS: los comandos de allá, cómo se lee lo que contestan y la libreta de
 * acá que usan `dolphin turno adjuntar` y el doctor. Ningún ssh de verdad.
 */

const vps = { destino: "nico@vps", repo: "/var/www/tienda", dolphin: "/opt/dolphin-app" };

describe("los comandos de allá", () => {
  it("lanza en su propia sesión, sin terminal, con log, estado y un timeout con el tope", () => {
    const cmd = comandoDesprendido("cd '/opt/dolphin-app' && node --import tsx src/cli.ts --tarea 'it'\\''s'", vps, "c1", 10_800);
    expect(cmd).toContain("setsid");
    expect(cmd).toContain("nohup sh -c");
    expect(cmd).toContain("> '/var/www/tienda/.dolphin/turnos/c1.log' 2>&1 < /dev/null &");
    expect(cmd).toContain("timeout -k 60 10800");
    expect(cmd).toMatch(/cat '\/var\/www\/tienda\/\.dolphin\/turnos\/c1\.json'$/);
  });

  it("la consulta y el adjuntar miran el mismo estado; el adjuntar sigue el log hasta que termine", () => {
    expect(comandoDeConsulta(vps, "c1")).toContain("kill -0");
    const adjuntar = comandoDeAdjuntar(vps, "c1");
    expect(adjuntar).toContain('tail -n 200 --pid="$p" -F');
    expect(adjuntar).toContain("/var/www/tienda/.dolphin/turnos/c1.json");
  });

  it("el adjuntar no deja que el repo de la config se ejecute en el echo", () => {
    const adjuntar = comandoDeAdjuntar({ repo: '/srv/"$(touch /tmp/x)"' }, "c1");
    expect(adjuntar).toContain(`echo 'no hay un turno c1 en /srv/"$(touch /tmp/x)"' >&2`);
  });

  it("el corte mira que el pid siga siendo el turno antes de matar, y nunca mata un pid suelto", () => {
    const corte = comandoDeCorte(vps, "c1", 4242, "b1");
    // Otro arranque de la máquina: ese pid es de otro proceso.
    expect(corte).toContain(`[ "$(cat /proc/sys/kernel/random/boot_id 2>/dev/null)" = 'b1' ] || exit 0`);
    // Ya dejó su código: terminó, no hay nada que cortar.
    expect(corte).toContain(`grep -q '"codigo"' '/var/www/tienda/.dolphin/turnos/c1.json' 2>/dev/null && exit 0`);
    // Vivo pero sin este estado en su línea de comandos: el pid se reusó.
    expect(corte).toContain("grep -qF -- 'c1.json' && exit 0");
    expect(corte).toMatch(/pkill -TERM -s "\$p" 2>\/dev\/null \|\| kill -TERM -- "-\$p" 2>\/dev\/null; true$/);
    expect(corte).not.toMatch(/kill -TERM (4242|"\$p")/);
    // Sin boot_id conocido (no es Linux) no se compara, pero lo demás sigue.
    expect(comandoDeCorte(vps, "c1", 4242)).not.toContain("boot_id");
  });

  it("un id con barras o comillas no llega a un nombre de archivo de allá", () => {
    expect(idValido("c0123abcd")).toBe(true);
    expect(idValido("../../etc/passwd")).toBe(false);
    expect(idValido("x'; rm -rf ~")).toBe(false);
  });
});

describe("lo que contesta una consulta", () => {
  const estado = (extra: object = {}) => JSON.stringify({ pid: 7, inicio: "2026-10-22T02:00:00Z", arranque: "b1", ...extra });

  it("terminado con su código, corriendo, o cortado", () => {
    expect(leerConsulta(`${estado({ codigo: 0 })}\narranque=b1\nmuerto\n`)).toMatchObject({ que: "termino", codigo: 0 });
    expect(leerConsulta(`${estado()}\narranque=b1\nvivo\n`).que).toBe("corriendo");
    expect(leerConsulta(`${estado()}\narranque=b1\nmuerto\n`).que).toBe("se-corto");
    expect(leerConsulta("\narranque=b1\nmuerto\n").que).toBe("se-corto");
  });

  it("un pid vivo de otro arranque de la máquina es de otro proceso: se cortó", () => {
    expect(leerConsulta(`${estado()}\narranque=b2\nvivo\n`).que).toBe("se-corto");
  });

  it("sin consultas que lleguen, el tope igual corta (y dice que no hubo respuesta)", async () => {
    let reloj = 0;
    const fin = await seguirTurno({
      consultar: async () => {
        throw new Error("sin red");
      },
      tope: 60_000,
      desde: 0,
      ahora: () => reloj,
      esperar: async (ms) => void (reloj += ms),
    });
    expect(fin).toEqual({ que: "tope", sinRespuesta: true });
  });

  it("una PC que durmió más que el tope y vuelve a un turno terminado lo da por terminado", async () => {
    const fin = await seguirTurno({ consultar: async () => `${estado({ codigo: 0 })}\nmuerto`, tope: 1, desde: 0, ahora: () => 10 * 60 * 60_000 });
    expect(fin).toMatchObject({ que: "termino", codigo: 0 });
  });
});

describe("la libreta de acá", () => {
  let repo = "";
  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-desprendidos-"));
  });
  afterEach(async () => {
    await borrarCarpeta(repo);
  });

  it("anota, tacha y sabe cuáles nadie vio terminar pasado el tope", async () => {
    await anotarDesprendido(repo, "c1", vps, new Date("2026-10-22T02:00:00Z"));
    await anotarDesprendido(repo, "c2", vps, new Date("2026-10-22T02:00:00Z"));
    await tacharDesprendido(repo, "c2", "terminó");
    const lista = await leerDesprendidos(repo);
    expect(lista.map((t) => t.id)).toEqual(["c1", "c2"]);
    const tope = 3 * 60 * 60_000;
    expect(desprendidosVencidos(lista, tope, new Date("2026-10-22T04:00:00Z"))).toEqual([]);
    expect(desprendidosVencidos(lista, tope, new Date("2026-10-22T06:00:00Z")).map((t) => t.id)).toEqual(["c1"]);
    // Pasada una semana ya no se avisa: el aviso eterno se deja de leer.
    expect(desprendidosVencidos(lista, tope, new Date("2026-11-02T06:00:00Z"))).toEqual([]);
  });

  it("adjuntar va a la máquina nombrada, a la anotada o a la del calendario", async () => {
    await writeFile(join(repo, "dolphin.config.json"), JSON.stringify({ hosts: { otro: { ...vps, destino: "yo@otro" } } }));
    expect(await maquinaParaVer(repo, "c9", "otro")).toEqual({ ok: true, maquina: { ...vps, destino: "yo@otro" } });
    expect((await maquinaParaVer(repo, "c9", "nada")).ok).toBe(false);
    expect(await maquinaParaVer(repo, "c9")).toMatchObject({ ok: false, porQue: expect.stringContaining("--host") });
    await anotarDesprendido(repo, "c9", vps);
    expect(await maquinaParaVer(repo, "c9")).toEqual({ ok: true, maquina: vps });
  });

  it("el doctor avisa de un turno desprendido sin terminar hace más del tope", async () => {
    await anotarDesprendido(repo, "c1", vps, new Date("2026-10-22T02:00:00Z"));
    const deps = { procesos: async () => [], casa: tmpdir(), temporal: tmpdir(), caja: async () => null, ahora: () => new Date("2026-10-22T07:00:00Z") };
    const h = await doctor(repo, { arreglar: false }, deps);
    const aviso = h.find((x) => x.que === "turnos desprendidos");
    expect(aviso?.arreglado).toBe(false);
    expect(aviso?.detalle).toBe("el turno c1 arrancó en nico@vps hace 5 h y nadie lo vio terminar: miralo con «dolphin turno adjuntar c1»");
  });
});
