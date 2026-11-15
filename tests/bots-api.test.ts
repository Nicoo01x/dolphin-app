import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { crearServidor } from "../src/servidor.js";
import { guardarBot, leerBot } from "../src/bots/almacen.js";

describe("API de bots", () => {
  let repo = "";
  let bots = "";
  let servidor: ReturnType<typeof crearServidor>;
  let base = "";
  let pase = "";
  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-bots-api-repo-"));
    bots = await mkdtemp(join(tmpdir(), "dolphin-bots-api-bots-"));
    process.env.DOLPHIN_BOTS_DIR = bots;
    pase = "test-token";
    servidor = crearServidor({ repo, calendario: false, demo: true, token: pase });
    await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", listo));
    base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
  });
  afterEach(async () => {
    await new Promise((listo) => servidor.close(listo));
    await borrarCarpeta(repo);
    await borrarCarpeta(bots);
    delete process.env.DOLPHIN_BOTS_DIR;
  });
  const encabezados = () => ({ "content-type": "application/json", "x-dolphin-token": pase });

  it("crea, habla con mentira y nunca devuelve el token", async () => {
    const creado = await fetch(`${base}/api/bots`, {
      method: "POST",
      headers: encabezados(),
      body: JSON.stringify({ nombre: "Demo", motor: "claude" }),
    });
    expect(creado.status).toBe(201);
    const cuerpo = (await creado.json()) as { bot: { id: string; motor: string } };
    expect(cuerpo.bot.motor).toBe("mentira");
    const bot = await leerBot(cuerpo.bot.id);
    await guardarBot({ ...bot, telegram: { token: "NO-MOSTRAR", chat: "42" } });
    const detalle = (await (await fetch(`${base}/api/bots/${cuerpo.bot.id}`)).json()) as { telegram?: { token?: string }; alma: string };
    expect(JSON.stringify(detalle)).not.toContain("NO-MOSTRAR");
    expect(detalle.alma).toContain("Demo");
    const charla = await fetch(`${base}/api/bots/${cuerpo.bot.id}/hablar`, {
      method: "POST",
      headers: encabezados(),
      body: JSON.stringify({ texto: "aprendé un saludo" }),
    });
    expect(charla.status).toBe(200);
    expect(JSON.stringify(await charla.json())).not.toContain("NO-MOSTRAR");
  });

  it("agrega una rutina desde la API", async () => {
    const creado = (await (
      await fetch(`${base}/api/bots`, { method: "POST", headers: encabezados(), body: JSON.stringify({ nombre: "Rutinas" }) })
    ).json()) as { bot: { id: string } };
    const r = await fetch(`${base}/api/bots/${creado.bot.id}/rutinas`, {
      method: "POST",
      headers: encabezados(),
      body: JSON.stringify({ cuando: "cada 30", tarea: "mirá el repo", latido: true }),
    });
    expect(r.status).toBe(201);
    expect((await r.json()).rutina.cuando).toEqual({ tipo: "cada", minutos: 30 });
  });

  it("acepta permiso carpeta, respaldo y presupuesto completo de una rutina", async () => {
    const creado = (await (
      await fetch(`${base}/api/bots`, {
        method: "POST",
        headers: encabezados(),
        body: JSON.stringify({ nombre: "Configurado", permiso: "carpeta", respaldo: "codex" }),
      })
    ).json()) as { bot: { id: string; permiso: string; respaldo?: string } };
    expect(creado.bot.permiso).toBe("carpeta");
    expect(creado.bot.respaldo).toBe("codex");
    const respuesta = await fetch(`${base}/api/bots/${creado.bot.id}/rutinas`, {
      method: "POST",
      headers: encabezados(),
      body: JSON.stringify({ cuando: "cada 30", tarea: "mirá", modelo: "sonnet", vueltas: 2, habilidades: ["tests"], chequeo: "vigia" }),
    });
    expect(respuesta.status).toBe(201);
    expect((await respuesta.json()).rutina).toMatchObject({ modelo: "sonnet", vueltas: 2, habilidades: ["tests"], chequeo: "vigia" });
    expect((await (await fetch(`${base}/api/bots`)).json()).servicio).toHaveProperty("vivo", false);
  });

  it("la demo no permite cambiar el motor y las plantillas conservan sus herramientas", async () => {
    const creado = (await (
      await fetch(`${base}/api/bots`, {
        method: "POST",
        headers: encabezados(),
        body: JSON.stringify({ nombre: "Vigía de demo", plantilla: "vigia", motor: "claude" }),
      })
    ).json()) as { bot: { id: string; motor: string; permiso: string; herramientas?: string[] } };
    expect(creado.bot.motor).toBe("mentira");
    expect(creado.bot.permiso).toBe("leer");
    expect(creado.bot.herramientas).toEqual(expect.arrayContaining(["Grep", "Glob", "Bash(git status:*)"]));
    await fetch(`${base}/api/bots/${creado.bot.id}`, { method: "PUT", headers: encabezados(), body: JSON.stringify({ motor: "claude" }) });
    expect((await leerBot(creado.bot.id)).motor).toBe("mentira");
  });

  it("en la demo, un bot creado con Claude piensa con el de mentira: nunca gasta cupo", async () => {
    // Sin PATH: si se intentara lanzar claude, fallaría con «no encontré» en vez de gastar algo.
    const path = process.env.PATH;
    process.env.PATH = "";
    try {
      const { crearBot } = await import("../src/bots/almacen.js");
      const bot = await crearBot({ nombre: "Con Claude", motor: "claude", carpeta: repo });
      const r = await fetch(`${base}/api/bots/${bot.id}/hablar`, { method: "POST", headers: encabezados(), body: JSON.stringify({ texto: "hola" }) });
      expect(r.status).toBe(200);
      expect(((await r.json()) as { resultado: { texto: string } }).resultado.texto).toContain("Entendido");
    } finally {
      process.env.PATH = path;
    }
  });

  it("un mensaje vacío contesta 400 en vez de dejar el pedido colgado", async () => {
    const creado = (await (await fetch(`${base}/api/bots`, { method: "POST", headers: encabezados(), body: JSON.stringify({ nombre: "Callado" }) })).json()) as {
      bot: { id: string };
    };
    const r = await fetch(`${base}/api/bots/${creado.bot.id}/hablar`, { method: "POST", headers: encabezados(), body: JSON.stringify({ texto: "   " }) });
    expect(r.status).toBe(400);
  });

  it("crear con el nombre de otro bot no lo pisa", async () => {
    const crear = () => fetch(`${base}/api/bots`, { method: "POST", headers: encabezados(), body: JSON.stringify({ nombre: "Único" }) });
    expect((await crear()).status).toBe(201);
    const segundo = await crear();
    expect(segundo.status).toBe(400);
    expect(((await segundo.json()) as { porQue: string }).porQue).toContain("ya tenés un bot");
  });

  it("el detalle trae la memoria por renglón y la lista dice qué espera tu «dale»", async () => {
    const creado = (await (
      await fetch(`${base}/api/bots`, { method: "POST", headers: encabezados(), body: JSON.stringify({ nombre: "Pide", permiso: "preguntar" }) })
    ).json()) as { bot: { id: string } };
    const id = creado.bot.id;
    await fetch(`${base}/api/bots/${id}/hablar`, { method: "POST", headers: encabezados(), body: JSON.stringify({ texto: "recordá esto y creá un archivo" }) });
    const lista = (await (await fetch(`${base}/api/bots`)).json()) as { bots: { id: string; pendiente?: { id: string; quiere: string }; telegram: boolean }[] };
    const enLista = lista.bots.find((b) => b.id === id)!;
    expect(enLista.pendiente).toBeTruthy();
    expect(enLista.telegram).toBe(false);
    const detalle = (await (await fetch(`${base}/api/bots/${id}`)).json()) as { bot: { id: string }; memoria: string[]; historial: { quien: string }[] };
    expect(detalle.bot.id).toBe(id);
    expect(Array.isArray(detalle.memoria)).toBe(true);
    expect(detalle.historial.map((h) => h.quien)).toEqual(["vos", "bot"]);
    expect(detalle.historial.every((h) => (h as { texto?: string }).texto)).toBe(true);

    // Con el «dale», lo hace y deja de esperar: la charla no se traba pidiendo permiso otra vez.
    const dale = (await (await fetch(`${base}/api/bots/${id}/dale`, { method: "POST", headers: encabezados(), body: JSON.stringify({ id: enLista.pendiente!.id }) })).json()) as {
      resultado: { texto: string; pidePermiso?: string };
    };
    expect(dale.resultado.texto).toContain("Listo");
    expect(dale.resultado.pidePermiso).toBeUndefined();
    const despues = (await (await fetch(`${base}/api/bots`)).json()) as { bots: { id: string; pendiente?: string }[] };
    expect(despues.bots.find((b) => b.id === id)!.pendiente).toBeUndefined();
  });
});
