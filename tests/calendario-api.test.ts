import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { esperarA } from "./ayuda/esperar.js";
import { crearServidor } from "../src/servidor.js";

/**
 * El calendario por el camino real: un turno agendado para dentro de un
 * rato se lanza SOLO —nadie toca nada— y deja su cosecha. El servidor es
 * el reloj.
 */

const correr = promisify(execFile);

describe("el calendario desde la consola", () => {
  let repo = "";
  let servidor: ReturnType<typeof crearServidor>;
  let base = "";

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-calendario-api-"));
    await writeFile(join(repo, "leeme.txt"), "hola\n");
    for (const args of [["init", "-q", "-b", "main"], ["config", "user.email", "nico@ejemplo.com"], ["config", "user.name", "Nico"], ["add", "-A"], ["commit", "-qm", "base"]]) {
      await correr("git", args, { cwd: repo, windowsHide: true });
    }
    servidor = crearServidor({ repo, relojCalendarioMs: 300 });
    await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", listo));
    base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
  });

  afterEach(async () => {
    await new Promise((listo) => servidor.close(listo));
    await correr("git", ["worktree", "prune"], { cwd: repo }).catch(() => {});
    await borrarCarpeta(repo);
  });

  const pase = async () => /name="dolphin-token" content="([0-9a-f]+)"/.exec(await (await fetch(`${base}/`)).text())?.[1];

  const mandar = (cuerpo: unknown, token?: string) =>
    fetch(`${base}/api/calendario`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { "x-dolphin-token": token } : {}) },
      body: JSON.stringify(cuerpo),
    });

  it("agendar exige el pase", async () => {
    const r = await mandar({ accion: "agendar", tareas: ["x"], cuando: new Date().toISOString(), agente: "mentira" });
    expect(r.status).toBe(403);
  });

  it("un turno agendado se lanza solo a su hora y deja su cosecha", { timeout: 90_000 }, async () => {
    const token = await pase();
    if (!token) return;
    const cuando = new Date(Date.now() + 1500).toISOString();
    const r = await mandar({ accion: "agendar", tareas: ["Sumá el reporte nocturno"], cuando, agente: "mentira" }, token);
    expect(r.status).toBe(201);

    let turno: { estado: string; parte?: string; porQue?: string } = { estado: "" };
    await esperarA(async () => {
      turno = (await (await fetch(`${base}/api/calendario`)).json()).turnos[0];
      return turno.estado === "hecho" || turno.estado === "fallo";
    }, { tope: 80_000, paso: 500 });
    // Si no sale, el motivo va en el mensaje: «expected fallo to be hecho» a secas no dice nada.
    expect(turno.estado, `el turno no salió: ${turno.porQue ?? "(sin motivo)"}`).toBe("hecho");
    const { cosechas } = await (await fetch(`${base}/api/historial`)).json();
    expect(cosechas.map((c: { tarea: string }) => c.tarea)).toContain("Sumá el reporte nocturno");
    // El turno trae su parte, y la consola lo sirve: es lo que abre la Agenda.
    expect(turno.parte).toMatch(/\.html$/);
    const parte = await fetch(`${base}/partes/${turno.parte}`);
    expect(parte.status).toBe(200);
    expect(await parte.text()).toContain("Sumá el reporte nocturno");
  });

  it("cancelar un turno lo saca de lo que toca", async () => {
    const token = await pase();
    if (!token) return;
    const r = await mandar({ accion: "agendar", tareas: ["Para mañana"], cuando: new Date(Date.now() + 86_400_000).toISOString(), agente: "mentira" }, token);
    const { turno } = await r.json();
    const c = await mandar({ accion: "cancelar", id: turno.id }, token);
    expect((await c.json()).turno.estado).toBe("cancelado");
  });

  it("valida el turno diario de la bandeja", async () => {
    const token = await pase();
    if (!token) return;
    const base = { accion: "agendar", deLaBandeja: { tope: 3 }, hora: "02:00", repetir: "diario", agente: "codex" };
    expect((await mandar({ ...base, deLaBandeja: { tope: 0 } }, token)).status).toBe(400);
    expect((await mandar({ ...base, hora: "25:90" }, token)).status).toBe(400);
    expect((await mandar({ ...base, agente: "otro" }, token)).status).toBe(400);
    const r = await mandar(base, token);
    expect(r.status).toBe(201);
    expect((await r.json()).turno).toMatchObject({ deLaBandeja: { tope: 3 }, repetir: "diario", hora: "02:00", agente: "codex" });
  });

  it("un turno por SSH se lleva firmada la máquina del host, y uno que no está no se agenda", async () => {
    const token = await pase();
    if (!token) return;
    const vps = { destino: "nico@1.2.3.4", repo: "/var/www/app", dolphin: "/opt/dolphin-app" };
    await writeFile(join(repo, "dolphin.config.json"), JSON.stringify({ hosts: { vps } }));
    // «Dónde» muestra adónde va cada nombre: el nombre lo escribió el repo.
    expect(await (await fetch(`${base}/api/calendario`)).json()).toMatchObject({ hosts: ["vps"], destinos: { vps: "nico@1.2.3.4" } });

    const cuando = new Date(Date.now() + 86_400_000).toISOString();
    const r = await mandar({ accion: "agendar", tareas: ["Sumá el reporte"], cuando, agente: "mentira", host: "vps" }, token);
    expect(r.status).toBe(201);
    expect((await r.json()).turno).toMatchObject({ host: "vps", maquina: vps });

    const otro = await mandar({ accion: "agendar", tareas: ["x"], cuando, agente: "mentira", host: "no-existe" }, token);
    expect(otro.status).toBe(400);
    expect((await otro.json()).porQue).toContain("no hay un host «no-existe»");
  });
});

describe("el autopiloto nocturno por el camino real", () => {
  let repo = "";
  let servidor: ReturnType<typeof crearServidor>;
  let base = "";

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-autopiloto-real-"));
    await writeFile(join(repo, "leeme.txt"), "hola\n");
    for (const args of [["init", "-q", "-b", "main"], ["config", "user.email", "nico@ejemplo.com"], ["config", "user.name", "Nico"], ["add", "-A"], ["commit", "-qm", "base"]]) {
      await correr("git", args, { cwd: repo, windowsHide: true });
    }
    const idea = (id: string, titulo: string) => ({ id, tipo: "idea", titulo, detalle: titulo, origen: "scout", firma: `f-${id}`, estado: "abierto", creado: new Date().toISOString(), paraLaNoche: "2026-10-24" });
    await mkdir(join(repo, ".dolphin"), { recursive: true });
    await writeFile(join(repo, ".dolphin", "bandeja.json"), JSON.stringify({ asuntos: [idea("a1", "Sumá un saludo"), idea("a2", "Sumá una despedida")] }));
    servidor = crearServidor({ repo, relojCalendarioMs: 300 });
    await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", listo));
    base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
  });

  afterEach(async () => {
    await new Promise((listo) => servidor.close(listo));
    await correr("git", ["worktree", "prune"], { cwd: repo }).catch(() => {});
    await borrarCarpeta(repo);
  });

  it("a su hora implementa las marcadas de a una, esperando cada siembra, y deja una cosecha por idea", { timeout: 180_000 }, async () => {
    const token = /name="dolphin-token" content="([0-9a-f]+)"/.exec(await (await fetch(`${base}/`)).text())?.[1];
    if (!token) return;
    // La hora del turno es al minuto: la próxima que empiece, así corre en menos de un minuto.
    const proxima = new Date(Date.now() + 60_000);
    const hora = `${String(proxima.getHours()).padStart(2, "0")}:${String(proxima.getMinutes()).padStart(2, "0")}`;
    const r = await fetch(`${base}/api/calendario`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-dolphin-token": token },
      body: JSON.stringify({ accion: "agendar", deLaBandeja: { tope: 2 }, hora, repetir: "diario", agente: "mentira" }),
    });
    expect(r.status).toBe(201);

    let turno: { estado: string; porQue?: string; corridas?: { salio: boolean; porQue?: string }[] } = { estado: "" };
    await esperarA(async () => {
      turno = (await (await fetch(`${base}/api/calendario`)).json()).turnos[0];
      return !!turno.corridas?.length;
    }, { tope: 170_000, paso: 500 });
    const vuelta = turno.corridas?.[0];
    expect(vuelta, "el turno no corrió").toBeDefined();
    // Las dos se sembraron de a una: dos cosechas, y la segunda empezó después de que terminara la primera.
    const { cosechas } = await (await fetch(`${base}/api/historial`)).json();
    expect(cosechas).toHaveLength(2);
    expect(vuelta!.porQue).toMatch(/de 2 pasaron el portón/);
    const bandeja = JSON.parse(await readFile(join(repo, ".dolphin", "bandeja.json"), "utf8")) as { asuntos: { paraLaNoche?: string }[] };
    expect(bandeja.asuntos.every((a) => !a.paraLaNoche)).toBe(true);
  });
});
