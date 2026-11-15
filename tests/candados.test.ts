import { describe, expect, it } from "vitest";
import { decirVoz } from "../src/nucleo/voces.js";
import { App } from "../src/tui/app.js";
import { aplicarAlEquipo, equipoInicial } from "../src/tui/equipo-estado.js";
import { Sesion } from "../src/tui/sesion.js";

/**
 * Los candados del equipo y la línea de tiempo por rol: lo que edita cada compañero sale de sus voces,
 * dos sobre el mismo archivo es un choque anunciado, y la pantalla muestra cuándo trabajó cada uno.
 */

describe("candados y línea de tiempo", () => {
  it("lo que edita cada compañero queda como su candado, y dos sobre el mismo archivo chocan", () => {
    let t = 1_000_000;
    const sesion = new Sesion({ repo: "C:/no-importa", agente: "claude", automatico: false, ahora: () => t });
    // Cómo los cruza la sesión: el worktree de cada compañero es la clave de sus voces.
    const dondeEs = (sesion as unknown as { dondeEs: Map<string, string> }).dondeEs;
    dondeEs.set("C:/wt/t1", "t1");
    dondeEs.set("C:/wt/t2", "t2");
    decirVoz("C:/wt/t1", "herramienta", "Read src/pedidos/servicio.ts");
    decirVoz("C:/wt/t1", "herramienta", "Edit src/pedidos/servicio.ts");
    decirVoz("C:/wt/t1", "herramienta", "Write src/pedidos/csv.ts");
    decirVoz("C:/wt/t2", "herramienta", "Edit src/pedidos/servicio.ts");
    decirVoz("C:/wt/t2", "herramienta", "Bash: npm test");
    expect([...sesion.archivosDe.get("t1")!]).toEqual(["src/pedidos/servicio.ts", "src/pedidos/csv.ts"]);
    expect([...sesion.archivosDe.get("t2")!]).toEqual(["src/pedidos/servicio.ts"]);
    expect(sesion.choques).toEqual([{ archivo: "src/pedidos/servicio.ts", quienes: ["t1", "t2"] }]);

    // En la pantalla: lo que toca cada uno, la línea de tiempo y el choque con los nombres.
    const equipo = equipoInicial("exportar a CSV", "claude", t - 60_000);
    sesion.equipo = equipo;
    sesion.trabajo = { tipo: "equipo", desde: t - 60_000, titulo: "exportar a CSV" };
    aplicarAlEquipo(equipo, { tipo: "arranca", objetivo: "exportar a CSV", agente: "claude", lider: "opus", revisor: "sonnet", fases: [] }, t - 60_000);
    aplicarAlEquipo(equipo, { tipo: "plan", resumen: "en dos", costo: 0, tareas: [{ id: "t1", titulo: "la exportación", modelo: "sonnet" }, { id: "t2", titulo: "el servicio", modelo: "haiku" }] }, t - 50_000);
    aplicarAlEquipo(equipo, { tipo: "etapa", etapa: "work" }, t - 45_000);
    aplicarAlEquipo(equipo, { tipo: "tarea", id: "t1", estado: "trabajando" }, t - 45_000);
    aplicarAlEquipo(equipo, { tipo: "tarea", id: "t2", estado: "trabajando" }, t - 30_000);
    const app = new App(sesion, () => t);
    app.irA("equipo");
    t += 1000;
    const pantalla = app.dibujar(140, 44).comoTexto().join("\n");
    expect(pantalla).toContain("línea de tiempo");
    expect(pantalla).toContain("toca servicio.ts, csv.ts");
    expect(pantalla).toMatch(/▲ src\/pedidos\/servicio\.ts: \S+ y \S+/);
    expect(pantalla).toContain("█");
    sesion.cerrar();
  });
});
