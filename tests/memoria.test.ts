import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  aprenderDeCosecha,
  contextoDeMemoria,
  leerMemoria,
  olvidarRecuerdo,
  prenderRecuerdo,
  recordar,
  verificadoresDeMemoria,
} from "../src/nucleo/memoria.js";
import { borrarCarpeta } from "./ayuda/borrar.js";
import type { Universo } from "../src/nucleo/tipos.js";

/**
 * Dolphin Memory: lo que se corrigió una vez no se repite. El recuerdo
 * con patrón corta intentos en el portón; el dicho viaja en el prompt.
 */

const correr = promisify(execFile);

describe("la memoria de ingeniería", () => {
  let repo = "";

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-memoria-"));
    await writeFile(join(repo, "a.js"), "export const a = 1;\n");
    await correr("git", ["init", "-q"], { cwd: repo });
    await correr("git", ["add", "-A"], { cwd: repo });
    await correr("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "base"], { cwd: repo });
  });

  afterEach(async () => {
    await borrarCarpeta(repo);
  });

  const universo = (): Universo => ({ id: "u1", rama: "x", ruta: repo, nacido: 0 });

  it("lo aprendido queda guardado y se vuelve a leer", async () => {
    await recordar(repo, "los importes van con coma decimal", "toLocaleString\\('en");
    await recordar(repo, "a los clientes se les escribe sin markdown");

    const memoria = await leerMemoria(repo);
    expect(memoria.recuerdos).toHaveLength(2);
    expect(memoria.recuerdos[0]).toMatchObject({ dicho: "los importes van con coma decimal", activo: true });
    expect(memoria.recuerdos[1]!.patron).toBeUndefined();
  });

  it("un patrón que no compila no entra: rompería el portón para siempre", async () => {
    await expect(recordar(repo, "regla rota", "([")).rejects.toThrow(/expresión regular/);
  });

  it("el recuerdo con patrón corta al intento que agrega una línea que lo pisa", async () => {
    await recordar(repo, "nada de console.log en el código", "console\\.log");
    const [verificador] = verificadoresDeMemoria(await leerMemoria(repo));

    await writeFile(join(repo, "a.js"), "export const a = 1;\nconsole.log(a);\n");
    const veredicto = await verificador!.correr(universo());

    expect(veredicto.paso).toBe(false);
    // El motivo ES la corrección original: se entiende sin abrir nada.
    expect(veredicto.detalle).toBe("memoria: nada de console.log en el código");
    expect(veredicto.evidencia).toContain("console.log(a);");
  });

  it("lo viejo del repo no es culpa del intento: solo miran las líneas nuevas", async () => {
    // console.log YA estaba commiteado antes del intento.
    await writeFile(join(repo, "viejo.js"), "console.log('histórico');\n");
    await correr("git", ["add", "-A"], { cwd: repo });
    await correr("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "viejo"], { cwd: repo });

    await recordar(repo, "nada de console.log", "console\\.log");
    const [verificador] = verificadoresDeMemoria(await leerMemoria(repo));

    await writeFile(join(repo, "a.js"), "export const a = 2;\n");
    const veredicto = await verificador!.correr(universo());
    expect(veredicto.paso).toBe(true);
  });

  it("un recuerdo apagado no corta a nadie, y olvidado desaparece", async () => {
    const recuerdo = await recordar(repo, "nada de console.log", "console\\.log");

    await prenderRecuerdo(repo, recuerdo.id, false);
    expect(verificadoresDeMemoria(await leerMemoria(repo))).toHaveLength(0);

    await prenderRecuerdo(repo, recuerdo.id, true);
    expect(verificadoresDeMemoria(await leerMemoria(repo))).toHaveLength(1);

    await olvidarRecuerdo(repo, recuerdo.id);
    expect((await leerMemoria(repo)).recuerdos).toHaveLength(0);
  });

  it("lo aprendido vuelve cuando la tarea se parece, y solo entonces", async () => {
    await recordar(repo, "La tarea «exportar el listado a CSV» se cortó entera en test", undefined, "error");
    await recordar(repo, "El deploy a producción va con tag firmado", undefined, "decision");

    const memoria = await leerMemoria(repo);

    const parecida = contextoDeMemoria(memoria, "sumale exportar CSV al historial");
    expect(parecida).toContain("exportar el listado a CSV");
    expect(parecida).not.toContain("deploy a producción");

    const distinta = contextoDeMemoria(memoria, "arreglá el login");
    expect(distinta).not.toContain("exportar el listado a CSV");
  });

  it("lo mismo dicho dos veces no se duplica: la memoria crece con cosas nuevas", async () => {
    const uno = await recordar(repo, "los importes van con coma decimal");
    const dos = await recordar(repo, "los importes van con coma decimal");
    expect(dos.id).toBe(uno.id);
    expect((await leerMemoria(repo)).recuerdos).toHaveLength(1);
  });

  it("un fracaso unánime queda aprendido solo, con el motivo adentro", async () => {
    const candidato = (id: string, murioEn?: string, porQue?: string) => ({
      universo: { id, rama: "x", ruta: "", nacido: 0 },
      vivo: !murioEn,
      pasadas: [],
      ...(murioEn ? { murioEn, porQue } : {}),
    });

    const aprendido = await aprenderDeCosecha(repo, {
      tarea: "exportar a CSV",
      candidatos: [
        candidato("u1", "test", "test: ✖ exporta la coma decimal como punto"),
        candidato("u2", "test", "test: ✖ exporta la coma decimal como punto"),
        candidato("u3", "peso", "peso: se pasó"),
      ],
      gastado: 0,
      muertosGratis: 3,
      ms: 1,
    } as never);

    expect(aprendido?.tipo).toBe("error");
    expect(aprendido?.dicho).toContain("se cortó entera en test");
    expect(aprendido?.dicho).toContain("exporta la coma decimal");

    // Con un ganador no hay nada que aprender de memoria: salió bien.
    const gano = await aprenderDeCosecha(repo, {
      tarea: "otra",
      candidatos: [candidato("u1"), candidato("u2", "test", "x")],
      ganador: candidato("u1"),
      gastado: 0,
      muertosGratis: 1,
      ms: 1,
    } as never);
    expect(gano).toBeNull();
  });

  it("las reglas activas viajan al prompt; las apagadas no", async () => {
    await recordar(repo, "los importes van con coma decimal");
    const apagada = await recordar(repo, "esta no va");
    await prenderRecuerdo(repo, apagada.id, false);

    const contexto = contextoDeMemoria(await leerMemoria(repo));
    expect(contexto).toContain("los importes van con coma decimal");
    expect(contexto).not.toContain("esta no va");
  });
});
