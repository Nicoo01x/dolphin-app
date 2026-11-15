import { describe, expect, it, vi } from "vitest";
import { esperarA } from "./ayuda/esperar.js";

const bug = vi.hoisted(() => ({ liberar: undefined as (() => void) | undefined }));
const comparacion = vi.hoisted(() => ({ liberar: undefined as (() => void) | undefined }));

vi.mock("../src/bug.js", () => ({
  deBugAArreglo: vi.fn(() => new Promise((resolver) => (bug.liberar = () => resolver({ etapa: "no-reproducido", porQue: "prueba", intentos: 0, gastado: 0 })))),
  textoDelBug: () => "terminó",
}));
vi.mock("../src/comparar.js", () => ({
  MOTORES_POR_DEFECTO: ["mentira", "mentira", "mentira"],
  comparar: vi.fn(() => new Promise((resolver) => (comparacion.liberar = () => resolver({ id: "c1", contendientes: [], tarea: "x" })))),
  textoDeComparacion: () => "terminó",
  elegir: vi.fn(),
}));

import { Sesion } from "../src/tui/sesion.js";

describe("comandos largos de la sesión", () => {
  it("/bug y /comparar ocupan la sesión y bloquean un segundo pedido", async () => {
    const sesion = new Sesion({ repo: "C:/repo", agente: "mentira", automatico: true });

    const bugEnCurso = sesion.recibir("/bug un bug");
    expect(sesion.ocupada).toBe(true);
    await new Promise<void>((resolve) => setImmediate(resolve));
    await sesion.recibir("/bug otro bug");
    expect(sesion.mensajes.at(-1)?.texto).toContain("Estoy con");
    // `deBugAArreglo` deja el `liberar` cuando el pedido llegó: se espera a eso, no a 500 ms.
    await esperarA(() => !!bug.liberar);
    bug.liberar!();
    await bugEnCurso;

    const compararEnCurso = sesion.recibir("/comparar una tarea");
    expect(sesion.ocupada).toBe(true);
    await new Promise<void>((resolve) => setImmediate(resolve));
    await sesion.recibir("/comparar otra tarea");
    expect(sesion.mensajes.at(-1)?.texto).toContain("Estoy con");
    await esperarA(() => !!comparacion.liberar);
    comparacion.liberar!();
    await compararEnCurso;
    expect(sesion.ocupada).toBe(false);
    sesion.cerrar();
  });
});
