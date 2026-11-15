import { describe, expect, it } from "vitest";
import type { Bot } from "../src/bots/almacen.js";
import { herramientasDeBot, pedidoDeMotor } from "../src/bots/pensar-motor.js";

const bot = (permiso: Bot["permiso"], herramientas?: string[]): Bot =>
  ({ id: "b", nombre: "B", motor: "claude", carpeta: "C:/repo/", permiso, rutinas: [], creado: "", ...(herramientas ? { herramientas } : {}) }) as Bot;

describe("las herramientas de un bot", () => {
  it("con «carpeta» puede editar, pero solo adentro de su carpeta", () => {
    expect(herramientasDeBot(bot("carpeta", ["Read", "Grep"]))).toEqual(["Read(C:/repo/**)", "Grep", "Edit(C:/repo/**)", "Write(C:/repo/**)"]);
  });
  it("con los demás permisos no se le suma escribir", () => {
    expect(herramientasDeBot(bot("preguntar"))).toEqual(["Read(C:/repo/**)"]);
    expect(herramientasDeBot(bot("leer", ["Read", "WebSearch"]))).toEqual(["Read(C:/repo/**)", "WebSearch"]);
  });
  it("las herramientas de un disparo también quedan acotadas a la carpeta", () => {
    const valor = (args: readonly string[]) => args[args.indexOf("--allowedTools") + 1];
    expect(valor(pedidoDeMotor(bot("preguntar"), "p", true, undefined, false, { herramientas: ["Read", "Grep"] }).args)).toBe("Read(C:/repo/**),Grep");
    const escribir = pedidoDeMotor(bot("libre"), "p", false, undefined, false, { herramientas: ["Write", "Bash(npm test:*)"] }).args.join(" ");
    expect(escribir).toContain("Write(C:/repo/**)");
    expect(escribir).not.toMatch(/(^|[ ,])Write([ ,]|$)/);
  });
});
