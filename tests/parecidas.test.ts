import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { comoSeDice, cuantoSeParecen, ES_LA_MISMA, palabrasDe, parecidasA, SE_PARECEN, yaEstaAnotada } from "../src/nucleo/parecidas.js";
import { crearTarjeta, leerTablero, moverTarjeta, type Tarjeta } from "../src/nucleo/tarjetas.js";
import { documentoATarjetas } from "../src/nucleo/documento-a-tarjetas.js";

/** Que el tablero no se llene de variantes de lo mismo, ahora que entran tarjetas solas. */

const tarjeta = (titulo: string): Tarjeta => ({
  id: titulo.slice(0, 6),
  titulo,
  tipo: "tarea",
  columna: "para-hacer",
  origen: "vos",
  creada: "2026-10-31T00:00:00.000Z",
  movida: "2026-10-31T00:00:00.000Z",
  comentarios: [],
  historial: [],
});

describe("cuánto se parecen dos títulos", () => {
  it("lo mismo dicho al revés se parece", () => {
    expect(cuantoSeParecen("exportar los pedidos a CSV", "exportar a CSV los pedidos")).toBeGreaterThan(ES_LA_MISMA);
  });

  it("la misma idea con otras palabras se parece lo bastante como para preguntarte", () => {
    const cuanto = cuantoSeParecen("el botón de guardar no avisa cuando falla", "guardar no avisa si falla");
    expect(cuanto).toBeGreaterThan(SE_PARECEN);
  });

  it("agarra la misma palabra en otra forma, que la comparación por palabras no ve", () => {
    // «factura» y «facturación» no comparten ninguna palabra entera.
    expect(cuantoSeParecen("exportar la factura", "exportar la facturación")).toBeGreaterThan(SE_PARECEN);
  });

  it("dos tareas distintas no se parecen", () => {
    expect(cuantoSeParecen("exportar los pedidos a CSV", "cambiar el color del botón")).toBeLessThan(SE_PARECEN);
    expect(cuantoSeParecen("mandar el mail de bienvenida", "arreglar el login con Google")).toBeLessThan(SE_PARECEN);
  });

  it("las palabras que están en todas las tarjetas no hacen que dos cosas se parezcan", () => {
    expect(palabrasDe("el de la que se en y por")).toEqual([]);
    expect(cuantoSeParecen("el de la tabla", "el de la pantalla")).toBeLessThan(ES_LA_MISMA);
  });

  it("un título vacío o de puro ruido no se parece a nada", () => {
    expect(cuantoSeParecen("", "exportar a CSV")).toBe(0);
    expect(cuantoSeParecen("…", "exportar a CSV")).toBe(0);
  });
});

describe("contra el tablero", () => {
  const tablero = [tarjeta("exportar los pedidos a CSV"), tarjeta("cambiar el color del botón"), tarjeta("exportar los pedidos a Excel")];

  it("trae las parecidas, de la más parecida a la menos", () => {
    const p = parecidasA(tablero, "exportar los pedidos a CSV ya");
    expect(p[0]?.tarjeta.titulo).toBe("exportar los pedidos a CSV");
    expect(p.map((x) => x.tarjeta.titulo)).toContain("exportar los pedidos a Excel");
    expect(p.map((x) => x.tarjeta.titulo)).not.toContain("cambiar el color del botón");
  });

  it("la que es casi seguro la misma se distingue de la que solo se parece", () => {
    expect(yaEstaAnotada(tablero, "exportar los pedidos a CSV")?.titulo).toBe("exportar los pedidos a CSV");
    // Parecida pero no la misma: eso lo decide una persona, no el código.
    expect(yaEstaAnotada(tablero, "exportar los clientes a CSV")).toBeUndefined();
  });

  it("un número distinto es otra tarea, aunque el texto sea casi igual", () => {
    // «tarea 1» y «tarea 2» se llevan una letra: por texto son la misma, y no lo son.
    const conNumeros = [tarjeta("arreglar el issue 42"), tarjeta("tarea número 1")];
    expect(yaEstaAnotada(conNumeros, "arreglar el issue 43")).toBeUndefined();
    expect(yaEstaAnotada(conNumeros, "tarea número 2")).toBeUndefined();
    expect(yaEstaAnotada(conNumeros, "arreglar el issue 42")?.titulo).toBe("arreglar el issue 42");
    // Pero se parecen, así que a una persona se le muestran igual.
    expect(parecidasA(conNumeros, "arreglar el issue 43").map((p) => p.tarjeta.titulo)).toContain("arreglar el issue 42");
  });

  it("lo ya hecho cuenta: es justo lo que querés saber antes de anotarlo de nuevo", () => {
    const hecha = { ...tarjeta("mandar el recordatorio por mail"), columna: "hecho" as const };
    expect(yaEstaAnotada([hecha], "mandar el recordatorio por mail")?.columna).toBe("hecho");
  });

  it("se cuenta en una línea, sin listar veinte", () => {
    const muchas = Array.from({ length: 5 }, (_, i) => tarjeta(`exportar los pedidos a CSV ${i}`));
    const dicho = comoSeDice(parecidasA(muchas, "exportar los pedidos a CSV"));
    expect(dicho).toContain("se parece a");
    expect(dicho).toContain("y 2 más");
  });

  it("sin parecidas no dice nada", () => {
    expect(comoSeDice(parecidasA(tablero, "instalar el certificado de ARCA"))).toBe("");
  });
});

describe("lo que entra solo no entra dos veces", () => {
  let repo = "";
  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-parecidas-"));
  });
  afterEach(async () => {
    await borrarCarpeta(repo);
  });

  it("un documento no vuelve a traer lo que ya anotaste con otras palabras", async () => {
    await crearTarjeta(repo, { titulo: "exportar los pedidos a CSV" });
    await writeFile(join(repo, "P.md"), "- exportar a CSV los pedidos\n- mandar el mail de bienvenida\n");
    const nuevas = await documentoATarjetas(repo, "P.md");
    expect(nuevas.map((t) => t.titulo)).toEqual(["mandar el mail de bienvenida"]);
  });

  it("pero una parecida que no es la misma sí entra: dos tareas parecidas pueden ser dos tareas", async () => {
    await crearTarjeta(repo, { titulo: "exportar los pedidos a CSV" });
    await writeFile(join(repo, "P.md"), "- exportar los clientes a CSV\n");
    expect((await documentoATarjetas(repo, "P.md")).map((t) => t.titulo)).toEqual(["exportar los clientes a CSV"]);
  });

  it("y lo que ya está en Hecho tampoco vuelve a entrar", async () => {
    const t = await crearTarjeta(repo, { titulo: "bajar la lista en CSV" });
    await moverTarjeta(repo, t.id, "hecho");
    await writeFile(join(repo, "P.md"), "- bajar la lista en CSV\n");
    expect(await documentoATarjetas(repo, "P.md")).toEqual([]);
    expect(await leerTablero(repo)).toHaveLength(1);
  });
});
