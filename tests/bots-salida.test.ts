import { mkdtemp, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { carpetaDeSalida, drenarSalidas, drenarSalidasEnRuta, encolarSalidaEn, leerSalidas, noSalio } from "../src/bots/salida.js";

describe("salida persistente", () => {
  let carpeta = "";
  afterEach(async () => {
    if (carpeta) await borrarCarpeta(carpeta);
  });

  it("retoma una salida pendiente al arrancar y la marca enviada", async () => {
    carpeta = await mkdtemp(join(tmpdir(), "dolphin-salida-"));
    await encolarSalidaEn(carpeta, "respuesta", undefined, new Date("2026-10-28T10:00:00Z"));
    const enviados: string[] = [];
    await drenarSalidas(carpeta, async (salida) => {
      enviados.push(salida.texto);
      return true;
    }, new Date("2026-10-28T10:00:01Z"));
    expect(enviados).toEqual(["respuesta"]);
    expect((await leerSalidas(carpeta))[0]?.estado).toBe("enviado");
  });

  it("un texto partido sale en orden", async () => {
    carpeta = await mkdtemp(join(tmpdir(), "dolphin-salida-orden-"));
    const ahora = new Date("2026-10-28T10:00:00Z");
    await encolarSalidaEn(carpeta, "A".repeat(3500) + "B".repeat(3500) + "C".repeat(3500) + "D", undefined, ahora);
    await encolarSalidaEn(carpeta, "E", undefined, ahora);
    const enviados: string[] = [];
    await drenarSalidas(carpeta, async (salida) => (enviados.push(salida.texto[0]!), true), ahora);
    expect(enviados).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("reintenta un rechazo confirmado después de treinta segundos", async () => {
    carpeta = await mkdtemp(join(tmpdir(), "dolphin-salida-reintento-"));
    const ahora = new Date("2026-10-28T10:00:00Z");
    await encolarSalidaEn(carpeta, "respuesta", undefined, ahora);
    await drenarSalidas(carpeta, async () => false, ahora);
    expect((await leerSalidas(carpeta))[0]).toMatchObject({ estado: "fallido", intentos: 1 });
    expect((await leerSalidas(carpeta))[0]).not.toHaveProperty("incierto");
    let llamados = 0;
    await drenarSalidas(carpeta, async () => (llamados++, true), new Date(ahora.getTime() + 29_999));
    expect(llamados).toBe(0);
    await drenarSalidas(carpeta, async () => (llamados++, true), new Date(ahora.getTime() + 30_000));
    expect(llamados).toBe(1);
  });

  it("no repite un envío cuyo resultado quedó incierto", async () => {
    carpeta = await mkdtemp(join(tmpdir(), "dolphin-salida-incierta-"));
    const ahora = new Date("2026-10-28T10:00:00Z");
    await encolarSalidaEn(carpeta, "respuesta", undefined, ahora);
    await drenarSalidas(carpeta, async () => { throw new Error("se cortó la red"); }, ahora);
    let llamados = 0;
    await drenarSalidas(carpeta, async () => (llamados++, true), new Date(ahora.getTime() + 60_000));
    expect(llamados).toBe(0);
    expect((await leerSalidas(carpeta))[0]).toMatchObject({ estado: "fallido", incierto: true });
  });

  it("un corte de conexión antes de salir se reintenta; uno a mitad de respuesta queda incierto", async () => {
    const sinRed = Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error("getaddrinfo ENOTFOUND api.telegram.org"), { code: "ENOTFOUND", syscall: "getaddrinfo" }) });
    const variasDirecciones = Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new AggregateError([Object.assign(new Error("x"), { code: "ETIMEDOUT", syscall: "connect" }), Object.assign(new Error("y"), { code: "ECONNREFUSED" })]), { code: "ETIMEDOUT" }) });
    const aMitad = Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error("other side closed"), { code: "UND_ERR_SOCKET" }) });
    expect(noSalio(sinRed)).toBe(true);
    expect(noSalio(variasDirecciones)).toBe(true);
    expect(noSalio(Object.assign(new Error("connect timeout"), { code: "UND_ERR_CONNECT_TIMEOUT" }))).toBe(true);
    expect(noSalio(aMitad)).toBe(false);
    expect(noSalio(new Error("se cortó la red"))).toBe(false);
    carpeta = await mkdtemp(join(tmpdir(), "dolphin-salida-sin-red-"));
    const ahora = new Date("2026-10-28T10:00:00Z");
    await encolarSalidaEn(carpeta, "respuesta", undefined, ahora);
    await drenarSalidas(carpeta, async () => { throw sinRed; }, ahora);
    expect((await leerSalidas(carpeta))[0]).toMatchObject({ estado: "fallido", intentos: 1, proximo: "2026-10-28T10:00:30.000Z" });
    expect((await leerSalidas(carpeta))[0]).not.toHaveProperty("incierto");
    const enviados: string[] = [];
    await drenarSalidas(carpeta, async (s) => (enviados.push(s.texto), true), new Date(ahora.getTime() + 30_000));
    expect(enviados).toEqual(["respuesta"]);
  });

  it("deja solo las últimas cincuenta salidas cerradas", async () => {
    carpeta = await mkdtemp(join(tmpdir(), "dolphin-salida-poda-"));
    const ahora = new Date("2026-10-28T10:00:00Z");
    for (let i = 0; i < 60; i++) await encolarSalidaEn(carpeta, `m${i}`, undefined, ahora);
    await drenarSalidas(carpeta, async () => true, ahora);
    const quedan = await leerSalidas(carpeta);
    expect(quedan).toHaveLength(50);
    expect(quedan[0]?.texto).toBe("m10");
    expect(quedan.at(-1)?.texto).toBe("m59");
  });

  it("dos drenados de la misma carpeta no mandan dos veces el mismo mensaje", async () => {
    carpeta = await mkdtemp(join(tmpdir(), "dolphin-salida-dos-"));
    const ahora = new Date("2026-10-28T10:00:00Z");
    for (let i = 0; i < 10; i++) await encolarSalidaEn(carpeta, `m${i}`, undefined, ahora);
    const enviados: string[] = [];
    const entregar = async (s: { texto: string }) => {
      await new Promise((r) => setTimeout(r, 2));
      enviados.push(s.texto);
      return true;
    };
    // La misma carpeta escrita de dos maneras: desde el 31/10 es UN solo drenado (el candado es por
    // carpeta, no por el texto de la ruta), y lo que sale tiene que ser exactamente la cola.
    await Promise.all([drenarSalidasEnRuta(carpetaDeSalida(carpeta), entregar, ahora), drenarSalidasEnRuta(carpetaDeSalida(carpeta) + sep, entregar, ahora)]);
    expect([...enviados].sort()).toEqual(Array.from({ length: 10 }, (_, i) => `m${i}`).sort());
  });

  // El bug de la tarjeta, reproducido: con cinco escrituras distintas de la misma carpeta salía un
  // mensaje dos veces, una vez cada tantas corridas. El candado se guardaba por el TEXTO de la ruta
  // y cada escritura abría su propio drenado; entre dos del mismo proceso el reclamo por rename no
  // alcanza, porque comparten el bucle de eventos y se cruzan entre los await.
  it("cinco drenados a la vez, con demoras distintas, no mandan nada dos veces ni pierden nada", async () => {
    carpeta = await mkdtemp(join(tmpdir(), "dolphin-salida-cinco-"));
    const ahora = new Date("2026-10-28T10:00:00Z");
    const cuantos = 20;
    for (let i = 0; i < cuantos; i++) await encolarSalidaEn(carpeta, `m${i}`, undefined, ahora);
    const enviados: string[] = [];
    const entregar = async (s: { texto: string }) => {
      // Demoras disparejas: es lo que hace que los drenados se crucen en distintos puntos.
      await new Promise((r) => setTimeout(r, Number(s.texto.slice(1)) % 5));
      enviados.push(s.texto);
      return true;
    };
    const ruta = carpetaDeSalida(carpeta);
    // Cinco escrituras distintas de la MISMA carpeta: el candado en memoria no las ve, como cinco procesos.
    const comoOtroProceso = [ruta, ruta + sep, join(ruta, "."), join(ruta, "..", "salida"), ruta + sep + "."];
    await Promise.all(comoOtroProceso.map((r) => drenarSalidasEnRuta(r, entregar, ahora)));

    const esperados = Array.from({ length: cuantos }, (_, i) => `m${i}`);
    expect([...enviados].sort()).toEqual([...esperados].sort());
    expect((await leerSalidas(carpeta)).every((x) => x.estado === "enviado")).toBe(true);
  });

  it("lo que reclamó un proceso muerto vuelve a la cola, y no se repite si había salido", async () => {
    carpeta = await mkdtemp(join(tmpdir(), "dolphin-salida-huerfana-"));
    const ahora = new Date("2026-10-28T10:00:00Z");
    await encolarSalidaEn(carpeta, "sin salir", undefined, ahora);
    await encolarSalidaEn(carpeta, "salió", undefined, ahora);
    const [primera, segunda] = await leerSalidas(carpeta);
    const ruta = carpetaDeSalida(carpeta);
    await rename(join(ruta, `${primera!.id}.json`), join(ruta, `${primera!.id}.json.999999.abc12345.enviando`));
    await writeFile(join(ruta, `${segunda!.id}.json.999999.def67890.enviando`), JSON.stringify({ ...segunda, estado: "fallido", intentos: 1, incierto: true }));
    await rm(join(ruta, `${segunda!.id}.json`));
    // Uno reclamado por un proceso vivo (éste) no se toca.
    await encolarSalidaEn(carpeta, "en vuelo", undefined, ahora);
    const enVuelo = (await leerSalidas(carpeta)).find((x) => x.texto === "en vuelo")!;
    await rename(join(ruta, `${enVuelo.id}.json`), join(ruta, `${enVuelo.id}.json.${process.pid}.aaaa1111.enviando`));
    const enviados: string[] = [];
    await drenarSalidas(carpeta, async (s) => (enviados.push(s.texto), true), ahora);
    expect(enviados).toEqual(["sin salir"]);
    expect((await readdir(ruta)).filter((x) => x.endsWith(".enviando"))).toHaveLength(1);
  });});
