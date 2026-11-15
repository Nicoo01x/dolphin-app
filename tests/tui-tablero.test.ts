import { describe, expect, it } from "vitest";
import { Bufer } from "../src/tui/celdas.js";
import { instantaneaVacia } from "../src/tui/datos.js";
import { columnaVecina, tarjetasOrdenadas, vistaTablero } from "../src/tui/vistas-tablero.js";
import type { Tarjeta } from "../src/nucleo/tarjetas.js";

/** El tablero como sección de la terminal: las columnas, lo que frena a una tarjeta y mover con las flechas. */

const tarjeta = (id: string, titulo: string, columna: Tarjeta["columna"], extra: Partial<Tarjeta> = {}): Tarjeta => ({
  id,
  titulo,
  tipo: "tarea",
  columna,
  origen: "test",
  creada: "2026-10-30T10:00:00.000Z",
  movida: "2026-10-30T10:00:00.000Z",
  comentarios: [],
  historial: [],
  ...extra,
});

/** Lo que quedó escrito en la pantalla, como texto: es lo que se puede afirmar de una TUI. */
const pintar = (tarjetas: readonly Tarjeta[], seleccion = 0) => {
  const ancho = 100;
  const alto = 24;
  const b = new Bufer(ancho, alto);
  vistaTablero(b, { x: 0, y: 0, w: ancho, h: alto }, { ...instantaneaVacia("/repo"), tarjetas }, seleccion, true, () => {});
  return Array.from({ length: alto }, (_, y) =>
    Array.from({ length: ancho }, (_, x) => b.celdas[y * ancho + x]?.ch ?? " ").join(""),
  ).join("\n");
};

describe("el tablero en la terminal", () => {
  it("ordena por columna y, adentro, lo movido último arriba", () => {
    const ordenadas = tarjetasOrdenadas([
      tarjeta("c", "hecha", "hecho"),
      tarjeta("a", "vieja", "para-hacer", { movida: "2026-10-01T10:00:00.000Z" }),
      tarjeta("b", "nueva", "para-hacer", { movida: "2026-10-30T23:00:00.000Z" }),
      tarjeta("i", "una idea", "ideas"),
    ]);
    expect(ordenadas.map((t) => t.id)).toEqual(["i", "b", "a", "c"]);
  });

  it("mover con las flechas va a la columna de al lado, y en la punta no hay adónde", () => {
    expect(columnaVecina("para-hacer", 1)).toBe("haciendo");
    expect(columnaVecina("para-hacer", -1)).toBe("ideas");
    expect(columnaVecina("ideas", -1)).toBeUndefined();
    expect(columnaVecina("hecho", 1)).toBeUndefined();
  });

  it("dibuja las tarjetas con su columna y lo que hay que hacer", () => {
    const pantalla = pintar([
      tarjeta("a1", "exportar a CSV", "para-hacer", { detalle: "con encabezado", terminado: "baja un .csv" }),
      tarjeta("b2", "el cupón no descuenta", "haciendo", { quien: "agentes" }),
    ]);
    expect(pantalla).toContain("tablero · 2 tarjetas");
    expect(pantalla).toContain("para hacer");
    expect(pantalla).toContain("exportar a CSV");
    expect(pantalla).toContain("haciendo");
    // El detalle de la elegida, a la derecha.
    expect(pantalla).toContain("qué hay que hacer");
    expect(pantalla).toContain("está terminada cuando");
    expect(pantalla).toContain("← →  moverla");
    expect(pantalla).toContain("que la haga el equipo");
  });

  it("una tarjeta frenada se dice, y no ofrece mandarla al equipo", () => {
    const pantalla = pintar([
      tarjeta("a1", "la primera", "para-hacer"),
      tarjeta("b2", "la segunda", "para-hacer", { esperaA: ["a1"] }),
    ]);
    expect(pantalla).toContain("espera");
    const soloLaFrenada = pintar(
      [tarjeta("a1", "la primera", "para-hacer"), tarjeta("b2", "la segunda", "para-hacer", { esperaA: ["a1"] })],
      1,
    );
    expect(soloLaFrenada).toContain("espera a");
    expect(soloLaFrenada).not.toContain("que la haga el equipo");
  });

  it("sin tarjetas dice qué hacer", () => {
    const pantalla = pintar([]);
    expect(pantalla).toContain("El tablero está vacío");
    expect(pantalla).toContain("dolphin tarea nueva");
  });
});
