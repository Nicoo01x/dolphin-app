import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { importarInstrucciones, reglasDeInstrucciones } from "../src/nucleo/importar-instrucciones.js";
import { aprobarCandidato, leerMemoria, recordar } from "../src/nucleo/memoria.js";
import { Sesion } from "../src/tui/sesion.js";

/**
 * Memoria que se gana la confianza: lo que dicen CLAUDE.md y AGENTS.md entra como reglas que esperan
 * tu ok (una vez por versión del archivo, sin repetir), y cada respuesta dice qué reglas usó.
 */

const CLAUDE_MD = `# Estándares

- Nunca usar \`any\` sin un comentario de por qué.
- **Los botones** van con texto, nunca solo un [ícono](https://lucide.dev).
- Comandos:
- npm
- [ ] Tests verdes antes de commitear.

\`\`\`bash
- esto es código, no una regla
\`\`\`

1. Las fechas se muestran como dd/mm/aaaa.
- Nunca usar \`any\` sin un comentario de por qué.
`;

let repo = "";
beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "dolphin-instrucciones-"));
});
afterEach(async () => {
  await borrarCarpeta(repo);
});

describe("las reglas de un archivo de instrucciones", () => {
  it("toma las viñetas en texto plano y deja afuera títulos, palabras sueltas, código y repetidas", () => {
    expect(reglasDeInstrucciones(CLAUDE_MD).map((r) => r.dicho)).toEqual([
      "Nunca usar any sin un comentario de por qué.",
      "Los botones van con texto, nunca solo un ícono.",
      "Tests verdes antes de commitear.",
      "Las fechas se muestran como dd/mm/aaaa.",
    ]);
    expect(reglasDeInstrucciones(CLAUDE_MD)[0]?.linea).toBe(3);
    expect(reglasDeInstrucciones(CLAUDE_MD, 2)).toHaveLength(2);
  });
});

describe("importar al abrir el repo", () => {
  it("entran como candidatas con de dónde salieron, y no se reimporta si el archivo no cambió", async () => {
    await writeFile(join(repo, "CLAUDE.md"), CLAUDE_MD);
    await writeFile(join(repo, "AGENTS.md"), "- Los commits van en castellano y sin co-autores.\n");
    const importados = await importarInstrucciones(repo);
    expect(importados).toEqual([
      { archivo: "CLAUDE.md", nuevas: 4 },
      { archivo: "AGENTS.md", nuevas: 1 },
    ]);
    const memoria = await leerMemoria(repo);
    expect(memoria.recuerdos.every((r) => r.candidato && !r.activo)).toBe(true);
    expect(memoria.recuerdos[0]?.porQue).toBe("Lo dice CLAUDE.md (línea 3).");
    expect(await importarInstrucciones(repo)).toEqual([]);
    // Si el archivo cambia, solo entra lo nuevo.
    await writeFile(join(repo, "AGENTS.md"), "- Los commits van en castellano y sin co-autores.\n- Nada de emojis en la interfaz.\n");
    expect(await importarInstrucciones(repo)).toEqual([{ archivo: "AGENTS.md", nuevas: 1 }]);
  });

  it("la sesión lo dice en el chat al abrir, y no repite lo que ya está en la memoria", async () => {
    await recordar(repo, "Las fechas se muestran como dd/mm/aaaa.", undefined, "regla", { origen: "owner" });
    await writeFile(join(repo, "CLAUDE.md"), CLAUDE_MD);
    const sesion = new Sesion({ repo, agente: "mentira", automatico: false });
    await sesion.traerInstrucciones();
    expect(sesion.mensajes.at(-1)?.texto).toContain("Leí CLAUDE.md y traje 3 reglas");
    sesion.cerrar();
  });
});

describe("cada respuesta dice qué reglas usó", () => {
  it("el triage cita las reglas activas que tienen que ver con el mensaje", async () => {
    const r = await recordar(repo, "los botones van con texto, nunca solo un ícono", undefined, "regla", { origen: "owner" });
    const candidata = await recordar(repo, "los botones son siempre redondos", undefined, "regla", { origen: "sesion", candidato: true, porQue: "x" });
    const sesion = new Sesion({ repo, agente: "mentira", automatico: false, pensar: async () => ({ decision: { tipo: "charla", respuesta: "Con texto." }, gastado: 0 }) });
    await sesion.recibir("¿cómo hago los botones?");
    const cita = sesion.mensajes.find((m) => m.quien === "sistema" && m.texto.startsWith("De la memoria"));
    expect(cita?.texto).toContain(`«${r.dicho}»`);
    // Una candidata todavía no es una regla: no se cita.
    expect(cita?.texto).not.toContain(candidata.dicho);
    await aprobarCandidato(repo, candidata.id);
    sesion.cerrar();
  });
});
