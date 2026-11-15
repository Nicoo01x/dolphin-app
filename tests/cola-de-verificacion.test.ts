import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { conTurnoDeVerificacion, estadoDeLaCola, lineaDeLaCola, lugaresDeVerificacion, sacarSiEsHuerfano } from "../src/nucleo/cola-de-verificacion.js";
import { verificadorDeComando } from "../src/nucleo/verificadores.js";

/**
 * La cola única de verificación: K comandos pesados a la vez en toda la máquina. Cada test usa un
 * directorio propio, así no chocan con la cola real ni entre sí.
 */

const GB = 1024 ** 3;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const RAPIDO = { sondeoMs: 10 };

describe("la cola de verificación", () => {
  let dir = "";
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "dolphin-cola-verif-"));
  });
  afterEach(async () => {
    await borrarCarpeta(dir);
  });

  /** Un trabajo que anota cuándo entró y salió, para ver si se solaparon. */
  function trabajo(registro: string[], id: string, ms: number) {
    return async () => {
      registro.push(`entra ${id}`);
      await dormir(ms);
      registro.push(`sale ${id}`);
      return id;
    };
  }

  it("con un solo lugar, los trabajos no se solapan y salen en orden de llegada", async () => {
    const registro: string[] = [];
    const opciones = { dir, lugares: 1, ...RAPIDO };
    const resultados = await Promise.all(
      ["a", "b", "c", "d"].map((id) => conTurnoDeVerificacion(id, trabajo(registro, id, 40), opciones)),
    );
    expect(resultados).toEqual(["a", "b", "c", "d"]);
    expect(registro).toEqual(["entra a", "sale a", "entra b", "sale b", "entra c", "sale c", "entra d", "sale d"]);
  });

  it("con dos lugares corren dos a la vez y el tercero espera", async () => {
    let enCurso = 0;
    let maximo = 0;
    const entrada: string[] = [];
    const correr = (id: string) =>
      conTurnoDeVerificacion(
        id,
        async () => {
          entrada.push(id);
          maximo = Math.max(maximo, ++enCurso);
          await dormir(120);
          enCurso--;
        },
        { dir, lugares: 2, ...RAPIDO },
      );
    await Promise.all([correr("a"), correr("b"), correr("c")]);
    expect(maximo).toBe(2);
    // Con dos lugares libres, «a» y «b» los toman a la vez y quién anota primero es una carrera
    // (falló con la máquina cargada). Lo que la cola promete es que «c», que llegó tercero, entra último.
    expect([...entrada.slice(0, 2)].sort()).toEqual(["a", "b"]);
    expect(entrada[2]).toBe("c");
  });

  it("dice cuánto esperó el que tuvo que esperar, y avisa una vez que se pone en cola", async () => {
    let avisos = 0;
    const primero = conTurnoDeVerificacion("uno", () => dormir(200), { dir, lugares: 1, ...RAPIDO });
    await dormir(20);
    const espera = await conTurnoDeVerificacion("dos", async (turno) => turno.esperoMs, {
      dir,
      lugares: 1,
      ...RAPIDO,
      alEsperar: () => avisos++,
    });
    await primero;
    expect(espera).toBeGreaterThanOrEqual(120);
    expect(avisos).toBe(1);
    // Y quien no esperó, no espera (nada que ver con el sondeo).
    expect(await conTurnoDeVerificacion("tres", async (turno) => turno.esperoMs, { dir, lugares: 1, ...RAPIDO })).toBeLessThan(100);
  });

  it("un lugar cuyo proceso ya no existe se recupera", async () => {
    // Un pid que de verdad existió y ya no está: el de un proceso que terminó.
    const muerto = spawn(process.execPath, ["-e", ""]);
    await new Promise((r) => muerto.on("close", r));
    await writeFile(join(dir, "lugar-0.lock"), JSON.stringify({ pid: muerto.pid, desde: Date.now(), token: "x", nombre: "tsc" }));

    const inicio = Date.now();
    const hecho = await conTurnoDeVerificacion("test", async () => "ok", { dir, lugares: 1, ...RAPIDO });
    expect(hecho).toBe("ok");
    expect(Date.now() - inicio).toBeLessThan(2_000);
  });

  it("un lugar de un pid vivo pero que dejó de latir hace mucho también se recupera", async () => {
    // El pid se puede reciclar: un proceso ajeno lo tiene hoy. Sin latido por más del tope, no es el dueño.
    const archivo = join(dir, "lugar-0.lock");
    await writeFile(archivo, JSON.stringify({ pid: process.pid, desde: 0, token: "viejo", nombre: "tsc" }));
    const hace1h = new Date(Date.now() - 3_600_000);
    await utimes(archivo, hace1h, hace1h);
    expect(await conTurnoDeVerificacion("test", async () => "ok", { dir, lugares: 1, topeViejoMs: 1_000, ...RAPIDO })).toBe("ok");
  });

  it("un lugar de un pid vivo que late NO se roba", async () => {
    await writeFile(join(dir, "lugar-0.lock"), JSON.stringify({ pid: process.pid, desde: Date.now(), token: "vivo", nombre: "tsc" }));
    const control = new AbortController();
    setTimeout(() => control.abort(new Error("se cansó de esperar")), 250);
    await expect(conTurnoDeVerificacion("test", async () => "ok", { dir, lugares: 1, senal: control.signal, ...RAPIDO })).rejects.toThrow(/cansó/);
  });

  it("un ticket huérfano delante en la fila no traba a los demás", async () => {
    const muerto = spawn(process.execPath, ["-e", ""]);
    await new Promise((r) => muerto.on("close", r));
    await writeFile(join(dir, `fila-${String(1).padStart(15, "0")}-000001-${muerto.pid}.fila`), JSON.stringify({ pid: muerto.pid }));
    expect(await conTurnoDeVerificacion("test", async () => "ok", { dir, lugares: 1, ...RAPIDO })).toBe("ok");
  });

  it("suelta el lugar aunque el trabajo tire", async () => {
    await expect(
      conTurnoDeVerificacion("boom", async () => {
        throw new Error("se rompió");
      }, { dir, lugares: 1, ...RAPIDO }),
    ).rejects.toThrow("se rompió");
    expect((await readdir(dir)).filter((n) => n.endsWith(".lock") || n.endsWith(".fila"))).toEqual([]);
    // y el que sigue entra sin esperar
    expect(await conTurnoDeVerificacion("sigue", async () => "ok", { dir, lugares: 1, ...RAPIDO })).toBe("ok");
  });

  it("cancelar la espera saca el ticket y no deja la fila trabada", async () => {
    const retenido = conTurnoDeVerificacion("largo", () => dormir(300), { dir, lugares: 1, ...RAPIDO });
    await dormir(20);
    const control = new AbortController();
    const espera = conTurnoDeVerificacion("cancelado", async () => "no", { dir, lugares: 1, senal: control.signal, ...RAPIDO });
    await dormir(30);
    control.abort(new Error("cancelado"));
    await expect(espera).rejects.toThrow("cancelado");
    await retenido;
    expect((await readdir(dir)).filter((n) => n.endsWith(".lock") || n.endsWith(".fila"))).toEqual([]);
  });

  it("dos procesos reales compitiendo por un lugar no se solapan", async () => {
    // El hijo toma el turno, anota «entra» y «sale» con la hora, y suelta. tsx para leer el .ts tal cual.
    const modulo = pathToFileURL(join(process.cwd(), "src", "nucleo", "cola-de-verificacion.ts")).href;
    const guion = join(dir, "hijo.mjs");
    const registro = join(dir, "registro.txt");
    await writeFile(
      guion,
      [
        `import { appendFileSync } from "node:fs";`,
        `import { conTurnoDeVerificacion } from ${JSON.stringify(modulo)};`,
        `const [dirCola, registro, id] = process.argv.slice(2);`,
        `await conTurnoDeVerificacion("hijo " + id, async () => {`,
        `  appendFileSync(registro, "entra " + id + " " + Date.now() + "\\n");`,
        `  await new Promise((r) => setTimeout(r, 400));`,
        `  appendFileSync(registro, "sale " + id + " " + Date.now() + "\\n");`,
        `}, { dir: dirCola, lugares: 1, sondeoMs: 20 });`,
      ].join("\n"),
    );
    const lanzar = (id: string) =>
      new Promise<number | null>((resolver, rechazar) => {
        const hijo = spawn(process.execPath, ["--import", "tsx", guion, dir, registro, id], { cwd: process.cwd(), stdio: "inherit" });
        hijo.on("error", rechazar);
        hijo.on("close", resolver);
      });
    const codigos = await Promise.all([lanzar("a"), lanzar("b"), lanzar("c")]);
    expect(codigos).toEqual([0, 0, 0]);

    const lineas = (await readFile(registro, "utf8")).trim().split("\n").map((l) => l.split(" "));
    expect(lineas).toHaveLength(6);
    // Cada «entra» sigue a un «sale» del anterior: nunca dos adentro, y la hora no retrocede.
    lineas.forEach(([evento], i) => expect(evento).toBe(i % 2 === 0 ? "entra" : "sale"));
    const horas = lineas.map((l) => Number(l[2]));
    for (let i = 1; i < horas.length; i++) expect(horas[i]!).toBeGreaterThanOrEqual(horas[i - 1]!);
    expect((await readdir(dir)).filter((n) => n.endsWith(".lock") || n.endsWith(".fila"))).toEqual([]);
  }, 60_000);
});

describe("mirar la cola sin tocarla", () => {
  let dir = "";
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "dolphin-cola-verif-"));
  });
  afterEach(async () => {
    await borrarCarpeta(dir);
  });

  it("un directorio que no existe es una cola vacía, y no dice nada", async () => {
    const estado = await estadoDeLaCola({ dir: join(dir, "no-existe"), lugares: 2 });
    expect(estado).toEqual({ lugares: 2, ocupados: [], esperando: 0 });
    expect(lineaDeLaCola(estado)).toBeNull();
  });

  it("cuenta lugares tomados (con quién, qué trabajo y hace cuánto) y los que esperan", async () => {
    const retenido = conTurnoDeVerificacion("tsc de u1", () => dormir(600), { dir, lugares: 1, ...RAPIDO });
    await dormir(40);
    const e1 = conTurnoDeVerificacion("test de u2", async () => "ok", { dir, lugares: 1, ...RAPIDO });
    const e2 = conTurnoDeVerificacion("build de u3", async () => "ok", { dir, lugares: 1, ...RAPIDO });
    await dormir(80);

    const antes = await readdir(dir);
    const estado = await estadoDeLaCola({ dir, lugares: 1 });
    expect(estado.lugares).toBe(1);
    expect(estado.ocupados).toHaveLength(1);
    expect(estado.ocupados[0]).toMatchObject({ lugar: "lugar-0.lock", pid: process.pid, nombre: "tsc de u1" });
    expect(estado.ocupados[0]!.haceMs).toBeGreaterThanOrEqual(50);
    expect(estado.esperando).toBe(2);
    expect(lineaDeLaCola(estado)).toBe("Verificación: 1 de 1 lugar tomado, 2 esperando");
    // Mirar no toma ni suelta nada.
    expect((await readdir(dir)).sort()).toEqual(antes.sort());

    await Promise.all([retenido, e1, e2]);
    expect(lineaDeLaCola(await estadoDeLaCola({ dir, lugares: 1 }))).toBeNull();
  });

  it("no cuenta a los huérfanos ni los borra, y lee un lugar viejo sin nombre", async () => {
    const muerto = spawn(process.execPath, ["-e", ""]);
    await new Promise((r) => muerto.on("close", r));
    await writeFile(join(dir, "lugar-0.lock"), JSON.stringify({ pid: muerto.pid, desde: Date.now(), token: "a", nombre: "tsc" }));
    // El formato anterior a guardar el nombre: sin `nombre` (y aquí tampoco `desde`).
    await writeFile(join(dir, "lugar-1.lock"), JSON.stringify({ pid: process.pid, token: "b" }));
    await writeFile(join(dir, `fila-${String(1).padStart(15, "0")}-000001-${muerto.pid}.fila`), JSON.stringify({ pid: muerto.pid, token: "c" }));
    const estado = await estadoDeLaCola({ dir, lugares: 2 });
    expect(estado.ocupados).toEqual([{ lugar: "lugar-1.lock", pid: process.pid }]);
    expect(estado.esperando).toBe(0);
    expect((await readdir(dir)).sort()).toEqual([`fila-${String(1).padStart(15, "0")}-000001-${muerto.pid}.fila`, "lugar-0.lock", "lugar-1.lock"].sort());
  });

  it("quien acaba de tomar su lugar y aún conserva el ticket no figura esperando", async () => {
    await writeFile(join(dir, "lugar-0.lock"), JSON.stringify({ pid: process.pid, desde: Date.now(), token: "mismo", nombre: "tsc" }));
    await writeFile(join(dir, "fila-000000000000001-000001-1.fila"), JSON.stringify({ pid: process.pid, token: "mismo" }));
    expect((await estadoDeLaCola({ dir, lugares: 2 })).esperando).toBe(0);
  });

  it("la línea habla en plural y singular", () => {
    expect(lineaDeLaCola({ lugares: 2, ocupados: [{ lugar: "lugar-0.lock" }, { lugar: "lugar-1.lock" }], esperando: 3 })).toBe("Verificación: 2 de 2 lugares tomados, 3 esperando");
    expect(lineaDeLaCola({ lugares: 4, ocupados: [], esperando: 1 })).toBe("Verificación: 0 de 4 lugares tomados, 1 esperando");
  });
});

describe("robar un lugar huérfano", () => {
  let dir = "";
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "dolphin-cola-verif-"));
  });
  afterEach(async () => {
    await borrarCarpeta(dir);
  });

  const viejo = async (ruta: string, contenido: object) => {
    await writeFile(ruta, JSON.stringify(contenido));
    const hace1h = new Date(Date.now() - 3_600_000);
    await utimes(ruta, hace1h, hace1h);
  };

  it("un lugar que dejó de latir se roba", async () => {
    const ruta = join(dir, "lugar-0.lock");
    await viejo(ruta, { pid: process.pid, desde: 0, token: "viejo", nombre: "tsc" });
    expect(await sacarSiEsHuerfano(ruta, 1_000)).toBe(true);
    expect(await readdir(dir)).toEqual([]);
  });

  it("un dueño vivo que late JUSTO entre que lo leímos y el rename no pierde su lugar", async () => {
    const ruta = join(dir, "lugar-0.lock");
    const contenido = { pid: process.pid, desde: 0, token: "vivo", nombre: "tsc" };
    await viejo(ruta, contenido);
    // El latido es solo un `utimes`: el texto queda idéntico. Comparar solo el texto no lo notaba.
    const robado = await sacarSiEsHuerfano(ruta, 1_000, async () => {
      const ahora = new Date();
      await utimes(ruta, ahora, ahora);
    });
    expect(robado).toBe(false);
    expect(JSON.parse(await readFile(ruta, "utf8"))).toEqual(contenido);
    expect((await readdir(dir)).filter((n) => n.includes("huerfano"))).toEqual([]);
    // Y como ahora late, el siguiente vistazo tampoco lo toca.
    expect(await sacarSiEsHuerfano(ruta, 1_000)).toBe(false);
  });

  it("si el contenido cambió en el medio (otro dueño), se lo devuelve", async () => {
    const ruta = join(dir, "lugar-0.lock");
    await viejo(ruta, { pid: process.pid, desde: 0, token: "viejo", nombre: "tsc" });
    const nuevo = { pid: process.pid, desde: Date.now(), token: "nuevo", nombre: "test" };
    const robado = await sacarSiEsHuerfano(ruta, 1_000, async () => {
      await writeFile(ruta, JSON.stringify(nuevo));
    });
    expect(robado).toBe(false);
    expect(JSON.parse(await readFile(ruta, "utf8"))).toEqual(nuevo);
  });
});

describe("cuántos a la vez", () => {
  const maquina = { memoriaBytes: 32 * GB, nucleos: 16 };

  it("sale de la memoria (uno cada 8 GB) con techo en la mitad de los núcleos", () => {
    expect(lugaresDeVerificacion({ entorno: {}, ...maquina })).toBe(4);
    expect(lugaresDeVerificacion({ entorno: {}, memoriaBytes: 128 * GB, nucleos: 8 })).toBe(4);
    expect(lugaresDeVerificacion({ entorno: {}, memoriaBytes: 128 * GB, nucleos: 16 })).toBe(8);
  });

  it("nunca baja de uno, ni con poca memoria ni con un núcleo", () => {
    expect(lugaresDeVerificacion({ entorno: {}, memoriaBytes: 4 * GB, nucleos: 16 })).toBe(1);
    expect(lugaresDeVerificacion({ entorno: {}, memoriaBytes: 64 * GB, nucleos: 1 })).toBe(1);
  });

  it("la variable de entorno gana sobre la config, y la config sobre la máquina", () => {
    expect(lugaresDeVerificacion({ entorno: { DOLPHIN_VERIFICACIONES_A_LA_VEZ: "2" }, config: 3, ...maquina })).toBe(2);
    expect(lugaresDeVerificacion({ entorno: {}, config: 3, ...maquina })).toBe(3);
  });

  it("un valor que no es un entero positivo se ignora", () => {
    for (const malo of ["0", "-1", "dos", "1.5", ""]) {
      expect(lugaresDeVerificacion({ entorno: { DOLPHIN_VERIFICACIONES_A_LA_VEZ: malo }, config: "x", ...maquina })).toBe(4);
    }
    expect(lugaresDeVerificacion({ entorno: {}, config: 0, ...maquina })).toBe(4);
  });
});

describe("el verificador de comandos y la cola", () => {
  let dir = "";
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "dolphin-cola-verif-"));
  });
  afterEach(async () => {
    await borrarCarpeta(dir);
  });

  it("el tiempo en la cola no gasta el tope del comando, y queda a la vista", async () => {
    const universo = { id: "u1", rama: "dolphin/u1", ruta: dir, nacido: Date.now() };
    // Alguien más tiene el único lugar por más tiempo que el tope entero del comando.
    const ocupado = conTurnoDeVerificacion("tsc ajeno", () => dormir(1_800), { dir, lugares: 1, ...RAPIDO });
    await dormir(30);

    const verificador = verificadorDeComando({
      nombre: "test",
      cmd: process.execPath,
      args: ["-e", "setTimeout(() => {}, 150)"],
      tope: 1_200,
      cola: { dir, lugares: 1, ...RAPIDO },
    });
    const veredicto = await verificador.correr(universo);
    await ocupado;

    // Si la espera contara, habría muerto de «no terminó a tiempo» sin haber arrancado.
    expect(veredicto.paso).toBe(true);
    expect(veredicto.esperaMs).toBeGreaterThanOrEqual(1_200);
    expect(veredicto.detalle).toMatch(/^test: pasó \(esperó \d+ s su turno en la cola\)$/);
  }, 30_000);

  it("sin espera, el detalle queda como siempre", async () => {
    const universo = { id: "u1", rama: "dolphin/u1", ruta: dir, nacido: Date.now() };
    const v = verificadorDeComando({ nombre: "tipos", cmd: process.execPath, args: ["-e", "''"], cola: { dir, lugares: 1, ...RAPIDO } });
    const veredicto = await v.correr(universo);
    expect(veredicto.detalle).toBe("tipos: pasó");
  }, 30_000);

  it("el tope sigue valiendo para el comando que sí corre", async () => {
    const universo = { id: "u1", rama: "dolphin/u1", ruta: dir, nacido: Date.now() };
    const v = verificadorDeComando({
      nombre: "colgado",
      cmd: process.execPath,
      args: ["-e", "setTimeout(() => {}, 30000)"],
      tope: 400,
      cola: { dir, lugares: 1, ...RAPIDO },
    });
    const veredicto = await v.correr(universo);
    expect(veredicto.paso).toBe(false);
    expect(veredicto.detalle).toContain("no terminó a tiempo");
    // y el lugar quedó suelto
    expect((await readdir(dir)).filter((n) => n.endsWith(".lock"))).toEqual([]);
  }, 30_000);
});
