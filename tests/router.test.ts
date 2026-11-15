import { describe, expect, it } from "vitest";
import { contarReparto, repartir } from "../src/nucleo/router.js";

/**
 * El router: el caro escribe, el barato revisa, y el que revisa nunca es
 * el mismo que escribió.
 */

describe("el router de modelos", () => {
  it("por defecto (equilibrada): Sonnet escribe y corrige, Haiku revisa", () => {
    expect(repartir("claude")).toEqual({ estrategia: "equilibrada", escribir: "sonnet", corregir: "sonnet", revisar: "haiku" });
  });

  it("calidad: Opus escribe y corrige, Sonnet revisa", () => {
    expect(repartir("claude", { estrategia: "calidad" })).toEqual({
      estrategia: "calidad",
      escribir: "opus",
      corregir: "opus",
      revisar: "sonnet",
    });
  });

  it("economía: todo con Haiku y sin revisión con modelo", () => {
    expect(repartir("claude", { estrategia: "economia" })).toEqual({
      estrategia: "economia",
      escribir: "haiku",
      corregir: "haiku",
      revisar: null,
    });
  });

  it("--modelo manda sobre el que escribe, y el que corrige lo sigue", () => {
    expect(repartir("claude", {}, { modelo: "opus" })).toMatchObject({ escribir: "opus", corregir: "opus", revisar: "haiku" });
    expect(repartir("claude", { escribir: "opus" })).toMatchObject({ escribir: "opus", corregir: "opus" });
  });

  it("cada rol se puede fijar a mano en la config, y la revisión se puede apagar", () => {
    expect(repartir("claude", { corregir: "opus", revisar: "sonnet" })).toMatchObject({
      escribir: "sonnet",
      corregir: "opus",
      revisar: "haiku",
    });
    expect(repartir("claude", { revisar: false }).revisar).toBeNull();
  });

  it("el que revisa nunca es el que escribió: si coinciden, se cambia de escalón", () => {
    // Escribe Haiku y la estrategia pide revisar con Haiku: revisa Sonnet.
    expect(repartir("claude", {}, { modelo: "haiku" }).revisar).toBe("sonnet");
    // Con el nombre largo del modelo también se reconoce que es el mismo.
    expect(repartir("claude", { revisar: "sonnet" }, { modelo: "claude-sonnet-5-5" }).revisar).toBe("haiku");
  });

  it("los otros motores escriben con lo suyo y los revisa Claude, que es otra casa", () => {
    expect(repartir("antigravity")).toEqual({ estrategia: "equilibrada", revisar: "haiku" });
    expect(repartir("codex", {}, { modelo: "gpt-5.2-codex" })).toEqual({
      estrategia: "equilibrada",
      escribir: "gpt-5.2-codex",
      corregir: "gpt-5.2-codex",
      revisar: "haiku",
    });
  });

  it("el de prueba no reparte nada: no hay qué pagar ni qué revisar", () => {
    expect(repartir("mentira", { estrategia: "calidad" })).toEqual({ estrategia: "calidad", escribir: "demo", corregir: "demo", revisar: null });
  });

  it("se cuenta en una línea", () => {
    expect(contarReparto(repartir("claude"))).toBe("escribe sonnet · revisa haiku");
    expect(contarReparto(repartir("claude", { corregir: "opus" }))).toBe("escribe sonnet · corrige opus · revisa haiku");
    expect(contarReparto(repartir("claude", { estrategia: "economia" }))).toBe("escribe haiku · sin revisión con modelo");
  });
});
