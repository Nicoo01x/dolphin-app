import { describe, expect, it } from "vitest";
import { conSufijo, entornoDelUniverso, puertoLibre, puertoParaUniverso, soltarPuerto } from "../src/nucleo/puertos.js";

describe("puertos", () => {
  it("reserva un puerto que el sistema dice que está libre", async () => {
    const puerto = await puertoLibre();
    expect(puerto).toBeGreaterThan(1024);
    expect(puerto).toBeLessThan(65536);
  });

  it("ocho universos pidiendo a la vez, ocho puertos distintos", async () => {
    const puertos = await Promise.all(Array.from({ length: 8 }, () => puertoParaUniverso()));
    expect(new Set(puertos).size).toBe(8);
    for (const p of puertos) soltarPuerto(p);
  });
});

describe("la base de cada universo", () => {
  it("le pega el id al nombre de la base", () => {
    expect(conSufijo("postgres://u:p@localhost:5432/app", "u3")).toBe(
      "postgres://u:p@localhost:5432/app_u3",
    );
  });

  it("respeta lo que viene después de la base", () => {
    const url = conSufijo("postgres://u:p@host:5432/app?sslmode=require", "u1");
    expect(url).toContain("/app_u1");
    expect(url).toContain("sslmode=require");
  });

  it("si no es una URL válida la deja como está, antes que romperla", () => {
    expect(conSufijo("no-es-una-url", "u1")).toBe("no-es-una-url");
  });

  it("sin nombre de base no inventa uno", () => {
    expect(conSufijo("postgres://u:p@host:5432", "u1")).toBe("postgres://u:p@host:5432");
  });
});

describe("el entorno del universo", () => {
  it("define PORT, que es lo que leen los frameworks sin configurar nada", () => {
    const entorno = entornoDelUniverso("u2", 4321, {});
    expect(entorno["PORT"]).toBe("4321");
    expect(entorno["DOLPHIN_UNIVERSO"]).toBe("u2");
  });

  it("deriva la base solo si el repo tiene una", () => {
    expect(entornoDelUniverso("u1", 3000, {})["DATABASE_URL"]).toBeUndefined();
    expect(
      entornoDelUniverso("u1", 3000, { DATABASE_URL: "postgres://h/app" })["DATABASE_URL"],
    ).toBe("postgres://h/app_u1");
  });

  it("dos universos nunca comparten base", () => {
    const base = { DATABASE_URL: "postgres://h/app" };
    const a = entornoDelUniverso("u1", 1, base)["DATABASE_URL"];
    const b = entornoDelUniverso("u2", 2, base)["DATABASE_URL"];
    expect(a).not.toBe(b);
  });
});
