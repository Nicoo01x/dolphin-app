import { describe, expect, it } from "vitest";
import { armarTraspaso, comoSeCuentaElTraspaso, PRESUPUESTO, type LoQuePaso } from "../src/nucleo/traspaso.js";

/**
 * El traspaso de una rama que rebota, del motor que la venía trabajando al que la retoma. Lo que
 * importa: que el pedido llegue entero, que lo primero que lea el que entra sea por qué rebotó, y
 * que lo que no entra en el presupuesto se diga en vez de desaparecer.
 */

const BASE: LoQuePaso = {
  tarea: "Exportar los pedidos a CSV desde el panel, con los acentos bien.",
  rama: "dolphin/exportar",
  motorAnterior: "claude",
  falla: { verificador: "test", detalle: "✖ exportar › separa los campos con punto y coma", evidencia: "expected ';' to be ','" },
  yaPasaron: ["typecheck", "lint"],
  intentos: ["cambiar el separador a coma a mano", "usar la librería csv-stringify"],
  archivos: ["src/panel/exportar.ts", "tests/exportar.test.ts"],
  ultimo: "Me quedé en que el separador tiene que salir de la configuración regional.",
  corrido: [{ comando: "npm test", codigo: 1, salida: "FAIL tests/exportar.test.ts\nmás líneas que no importan" }],
};

describe("el traspaso entre motores", () => {
  it("empieza diciendo que es un traspaso y de quién lo hereda", () => {
    const t = armarTraspaso(BASE);
    expect(t.texto.startsWith("Esto es un traspaso")).toBe(true);
    expect(t.texto).toContain("«dolphin/exportar»");
    expect(t.texto).toContain("claude");
  });

  it("el pedido va entero aunque el presupuesto sea mínimo", () => {
    const largo = "Exportar los pedidos a CSV. ".repeat(200);
    const t = armarTraspaso({ ...BASE, tarea: largo }, { presupuesto: 50 });
    expect(t.texto).toContain(largo.trim());
    expect(t.piezas[0]).toMatchObject({ nombre: "pedido", recortada: false });
  });

  it("lo primero después del pedido es por qué rebotó, con su evidencia", () => {
    const t = armarTraspaso(BASE);
    const orden = t.piezas.map((p) => p.nombre);
    expect(orden[0]).toBe("pedido");
    expect(orden[1]).toBe("rebote");
    expect(t.texto).toContain("fase «test»");
    expect(t.texto).toContain("expected ';' to be ','");
  });

  it("no inventa nada: todo lo que dice estaba en lo que pasó", () => {
    const t = armarTraspaso(BASE);
    for (const intento of BASE.intentos!) expect(t.texto).toContain(intento);
    for (const archivo of BASE.archivos!) expect(t.texto).toContain(archivo);
    expect(t.texto).toContain("typecheck, lint");
    expect(t.texto).toContain("npm test → salió 1");
  });

  it("los intentos van del más nuevo al más viejo: si hay que cortar, se pierde lo lejano", () => {
    const t = armarTraspaso(BASE);
    const nuevo = t.texto.indexOf("usar la librería csv-stringify");
    const viejo = t.texto.indexOf("cambiar el separador a coma a mano");
    expect(nuevo).toBeGreaterThan(-1);
    expect(nuevo).toBeLessThan(viejo);
  });

  it("con poco presupuesto entra el rebote y lo demás queda afuera, dicho", () => {
    const t = armarTraspaso(BASE, { presupuesto: 140 });
    expect(t.piezas.map((p) => p.nombre)).toContain("rebote");
    expect(t.afuera.length).toBeGreaterThan(0);
    // Lo que no entró se nombra; no desaparece en silencio.
    expect(comoSeCuentaElTraspaso(t)).toContain("afuera:");
  });

  it("lo que se recorta lo dice adentro del texto, no se corta mudo", () => {
    const t = armarTraspaso({ ...BASE, falla: { verificador: "test", detalle: "x".repeat(900) } }, { presupuesto: 300 });
    expect(t.texto).toContain("recortado, faltan");
    expect(t.piezas.find((p) => p.nombre === "rebote")?.recortada).toBe(true);
  });

  it("respeta el presupuesto sin contar el pedido, que va aparte", () => {
    const t = armarTraspaso(BASE, { presupuesto: 400 });
    const sinPedido = t.piezas.filter((p) => p.nombre !== "pedido").reduce((n, p) => n + p.letras, 0);
    expect(sinPedido).toBeLessThanOrEqual(400);
  });

  it("una rama sin rebote y sin historia igual arma un traspaso usable", () => {
    const t = armarTraspaso({ tarea: "Arreglar el login", rama: "dolphin/login", motorAnterior: "codex" });
    expect(t.texto).toContain("Arreglar el login");
    expect(t.texto).toContain("seguí desde ahí");
    expect(t.piezas).toHaveLength(1);
    expect(t.afuera).toEqual([]);
  });

  it("el presupuesto por defecto alcanza para una rama normal entera", () => {
    const t = armarTraspaso(BASE);
    expect(t.afuera).toEqual([]);
    expect(t.piezas.every((p) => !p.recortada)).toBe(true);
    expect(t.letras).toBeLessThan(PRESUPUESTO);
  });
});
