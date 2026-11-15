import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Mensaje } from "../src/nucleo/buscar-memorias.js";
import { carpetaDeClaudeCode, carpetaDeGemini } from "../src/nucleo/buscar-memorias.js";
import { recordar, type Memoria } from "../src/nucleo/memoria.js";
import {
  armarWrapped,
  esCorreccion,
  nucleoDeCorreccion,
  patronPropuesto,
  porcentajeDeCorrecciones,
  tarjetaParaCompartir,
  TOPE_MAS_REPETIDAS,
  wrapped,
} from "../src/nucleo/wrapped.js";
import { borrarCarpeta } from "./ayuda/borrar.js";

/**
 * Dolphin Wrapped: la primera pantalla tiene que enseñar la memoria con los
 * datos que ya están en la máquina, sin telemetría y sin gastarle un token a
 * nadie. Lo que se vigila acá es que los números sean VERDAD —contar de menos
 * antes que inflar— y que la tarjeta para compartir no se lleve nada de lo que
 * la persona escribió.
 */

const AHORA = new Date("2026-10-31T12:00:00Z");
const UN_DIA = 86_400_000;
const haceDias = (dias: number) => new Date(AHORA.getTime() - dias * UN_DIA).toISOString();
const dijo = (texto: string, dias = 1, de: Mensaje["de"] = "claude"): Mensaje => ({ de, texto, cuando: haceDias(dias) });
const SIN_MEMORIA: Memoria = { recuerdos: [] };

/** Una conversación de Claude Code con el formato real: lo de la persona y lo que no es de ella. */
function conversacion(mensajes: readonly Mensaje[]): string {
  return [
    ...mensajes.map((m) => JSON.stringify({ type: "user", message: { role: "user", content: m.texto }, timestamp: m.cuando })),
    JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "no uses emojis" }] } }),
    JSON.stringify({ type: "user", message: { role: "user", content: "<task-notification>\n<task-id>b1</task-id>" } }),
  ].join("\n");
}

async function escribir(ruta: string, texto: string) {
  await mkdir(join(ruta, ".."), { recursive: true });
  await writeFile(ruta, texto);
}

describe("qué cuenta como corrección", () => {
  it("una corrección es un mensaje que corrige, no uno que pide", () => {
    for (const corrige of [
      "no uses emojis en la interfaz",
      "nada de console.log",
      "nunca toques el .env",
      "sacá ese botón",
      "borrá lo que agregaste",
      "esta mal, el importe va con coma",
      "no anda, tira 500",
      "ya te dije que los tests van en tests/",
      "dejalo como estaba",
      "rompiste el login",
      "no me gusta, está muy apretado",
    ]) {
      expect(esCorreccion(corrige), corrige).toBe(true);
    }
    for (const pide of [
      "hacé un login con Google",
      "qué te parece si lo hacemos con Redis",
      "no sé si conviene meter una librería para esto",
      "andá viendo cómo está armado el panel",
      "agregá un botón para bajar el Excel",
    ]) {
      expect(esCorreccion(pide), pide).toBe(false);
    }
  });

  it("la tilde no se come el borde de la palabra: «sacá» corrige igual que «saca»", () => {
    expect(esCorreccion("sacá eso de ahí")).toBe(true);
    expect(esCorreccion("borrá el archivo")).toBe(true);
    expect(esCorreccion("revertí el commit")).toBe(true);
  });

  it("de un mensaje largo queda la cláusula que corrige, y el punto de «console.log» no la parte", () => {
    expect(nucleoDeCorreccion("Está buenísimo el panel. No uses emojis en los botones, por favor")).toBe(
      "No uses emojis en los botones, por favor",
    );
    expect(nucleoDeCorreccion("nada de console.log en src")).toBe("nada de console.log en src");
    expect(nucleoDeCorreccion(`no uses ${"x".repeat(300)}`)).toHaveLength(140);
  });
});

describe("qué corrección se puede volver un chequeo", () => {
  it("un literal con forma de código sí; una palabra del idioma no", () => {
    expect(patronPropuesto("nada de console.log en src")).toBe("console\\.log");
    expect(patronPropuesto("no uses @ts-ignore")).toBe("@ts-ignore");
    expect(patronPropuesto("no pongas toLocaleString en los importes")).toBe("toLocaleString");
    expect(patronPropuesto("nunca uses `process.env.TOKEN` directo")).toBe("process\\.env\\.TOKEN");
    // «emojis» como patrón cortaría un comentario que habla de emojis: es una regla dicha, no un chequeo.
    expect(patronPropuesto("no uses emojis en la interfaz")).toBeUndefined();
    expect(patronPropuesto("nada de any")).toBeUndefined();
    // Una ruta no es algo prohibido, y además cambia.
    expect(patronPropuesto("no toques src/nucleo/porton.ts")).toBeUndefined();
    // Sin prohibición no se propone nada: «no anda el console.log» no prohíbe console.log.
    expect(patronPropuesto("no anda el console.log")).toBeUndefined();
  });
});

describe("la vuelta, con datos inyectados", () => {
  it("cuenta las correcciones, las agrupa por materia y propone los chequeos", () => {
    // Nadie repite una corrección con las mismas palabras: las tres de los emojis
    // y las dos de console.log están dichas distinto cada vez, como en la vida.
    const resumen = armarWrapped(
      [
        dijo("no uses emojis en la interfaz", 1),
        dijo("nada de emojis en los botones", 2),
        dijo("sacá los emojis del panel, te lo dije", 3),
        dijo("nada de console.log en src", 4),
        dijo("no uses console.log, usá el logger", 5, "codex"),
        dijo("hacé un login con Google", 6),
        dijo("qué te parece si lo hacemos con Redis", 7),
      ],
      SIN_MEMORIA,
      AHORA,
    );

    expect(resumen.escritos).toBe(7);
    expect(resumen.correcciones).toBe(5);
    expect(porcentajeDeCorrecciones(resumen)).toBe(71);
    expect(resumen.porAgente).toEqual({ claude: 4, codex: 1 });
    // Las tres de los emojis son la misma corrección dicha de tres maneras; las dos de console.log, otra.
    expect(resumen.masRepetidas.map((c) => c.veces)).toEqual([3, 2]);
    expect(resumen.masRepetidas[0]!.texto).toContain("emojis");
    // Solo la de console.log tiene un literal buscable.
    expect(resumen.queSePuedenVerificar).toBe(1);
    expect(resumen.verificables.map((c) => c.patron)).toEqual(["console\\.log"]);
    expect(resumen.yaEnLaMemoria).toBe(0);
    expect(resumen.desde).toBe(new Date(AHORA.getTime() - 30 * UN_DIA).toISOString());
    expect(resumen.dias).toBe(30);
  });

  it("dos correcciones de temas distintos no se juntan por una palabra suelta", () => {
    const resumen = armarWrapped(
      [
        dijo("no uses emojis en la interfaz", 1),
        dijo("nada de console.log en src", 2),
        dijo("nunca toques la migración a mano", 3),
      ],
      SIN_MEMORIA,
      AHORA,
    );
    expect(resumen.correcciones).toBe(3);
    expect(resumen.masRepetidas).toEqual([]);
  });

  it("lo de otro mes no entra, y lo que no tiene fecha se informa aparte en vez de colarse", () => {
    const resumen = armarWrapped(
      [
        dijo("no uses emojis", 2),
        dijo("nada de console.log", 45),
        { de: "codex", texto: "nunca toques el .env" },
        { de: "gemini", texto: "sacá eso", cuando: "cuando era joven" },
      ],
      SIN_MEMORIA,
      AHORA,
    );
    expect(resumen.correcciones).toBe(1);
    expect(resumen.escritos).toBe(1);
    expect(resumen.sinFecha).toBe(2);
    expect(resumen.porAgente).toEqual({ claude: 1 });
  });

  it("lo que la memoria del repo ya sabe no se ofrece como chequeo nuevo", () => {
    const mensajes = [dijo("nada de console.log en src", 1), dijo("no uses console.log, usá el logger", 2)];
    const memoria: Memoria = {
      recuerdos: [
        { id: "m1", dicho: "nada de console.log en src", patron: "console\\.log", creado: haceDias(90), activo: true },
        { id: "m2", dicho: "los importes van con coma decimal", creado: haceDias(90), activo: true },
      ],
    };
    const resumen = armarWrapped(mensajes, memoria, AHORA);
    expect(resumen.correcciones).toBe(2);
    expect(resumen.yaEnLaMemoria).toBe(1);
    expect(resumen.queSePuedenVerificar).toBe(0);
    expect(resumen.verificables).toEqual([]);
    expect(resumen.masRepetidas[0]!.yaEstaba).toBe(true);
  });

  it("una memoria apagada o una candidata no tapan el chequeo: todavía no están puestas", () => {
    const memoria: Memoria = {
      recuerdos: [
        { id: "m1", dicho: "nada de console.log", patron: "console\\.log", creado: haceDias(5), activo: false },
        { id: "m2", dicho: "nada de console.log", patron: "console\\.log", creado: haceDias(5), activo: true, candidato: true },
      ],
    };
    const resumen = armarWrapped([dijo("nada de console.log en src", 1)], memoria, AHORA);
    expect(resumen.queSePuedenVerificar).toBe(1);
    expect(resumen.yaEnLaMemoria).toBe(0);
  });

  it("solo son «las más repetidas» las que se repitieron, y como mucho cinco", () => {
    const unica = armarWrapped([dijo("no uses emojis", 1), dijo("nada de console.log", 2)], SIN_MEMORIA, AHORA);
    expect(unica.correcciones).toBe(2);
    expect(unica.masRepetidas).toEqual([]);

    // Cada par habla de lo suyo y no comparte ninguna palabra con los otros siete.
    const muchas = Array.from({ length: 8 }, (_, i) => [dijo(`no uses numero${i}`, 1), dijo(`nada de numero${i}`, 2)]).flat();
    const resumen = armarWrapped(muchas, SIN_MEMORIA, AHORA);
    expect(resumen.masRepetidas).toHaveLength(TOPE_MAS_REPETIDAS);
    expect(resumen.masRepetidas.every((c) => c.veces === 2)).toBe(true);
  });
});

describe("una máquina sin nada", () => {
  let repo = "";
  let casa = "";

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-wrapped-repo-"));
    casa = await mkdtemp(join(tmpdir(), "dolphin-wrapped-casa-"));
  });

  afterEach(async () => {
    await borrarCarpeta(repo);
    await borrarCarpeta(casa);
  });

  it("no rompe y no miente: todo en cero, sin NaN y sin inventar repetidas", async () => {
    const resumen = await wrapped(repo, casa, AHORA);
    expect(resumen).toMatchObject({
      escritos: 0,
      correcciones: 0,
      sinFecha: 0,
      queSePuedenVerificar: 0,
      yaEnLaMemoria: 0,
      masRepetidas: [],
      verificables: [],
      porAgente: {},
    });
    expect(porcentajeDeCorrecciones(resumen)).toBe(0);

    const tarjeta = tarjetaParaCompartir(resumen);
    expect(tarjeta).not.toContain("NaN");
    expect(tarjeta).not.toContain("undefined");
    expect(tarjeta).toContain("0 correcciones");
  });

  it("lee lo que ya está en la máquina: las conversaciones de Claude Code, Codex y Gemini del repo", async () => {
    await escribir(
      join(carpetaDeClaudeCode(repo, casa), "charla.jsonl"),
      conversacion([
        dijo("no uses emojis en la interfaz", 1),
        dijo("nada de emojis en los botones", 2),
        dijo("nada de console.log en src", 3),
        dijo("hacé el panel de facturas", 4),
      ]),
    );
    await escribir(
      join(casa, ".codex", "sessions", "2026", "10", "30", "rollout-1.jsonl"),
      [
        JSON.stringify({ type: "session_meta", payload: { cwd: repo } }),
        JSON.stringify({
          type: "response_item",
          timestamp: haceDias(2),
          payload: { type: "message", role: "user", content: [{ type: "input_text", text: "sacá los emojis, te lo dije" }] },
        }),
      ].join("\n"),
    );
    await escribir(
      join(carpetaDeGemini(repo, casa), "logs.json"),
      JSON.stringify([{ type: "user", message: "nada de console.log, usá el logger", timestamp: haceDias(3) }]),
    );
    // Lo que el repo ya aprendió no se vuelve a ofrecer.
    await recordar(repo, "nada de console.log en src", "console\\.log");

    const resumen = await wrapped(repo, casa, AHORA);
    expect(resumen.escritos).toBe(6);
    expect(resumen.correcciones).toBe(5);
    expect(resumen.porAgente).toEqual({ claude: 3, codex: 1, gemini: 1 });
    expect(resumen.masRepetidas[0]!.veces).toBe(3);
    expect(resumen.yaEnLaMemoria).toBe(1);
    expect(resumen.queSePuedenVerificar).toBe(0);
  });
});

describe("la tarjeta para compartir", () => {
  const CON_CODIGO = [
    dijo("no uses console.log en src/nucleo/porton.ts", 1),
    dijo("nunca pongas `process.env.DOLPHIN_TOKEN` en el prompt", 2),
    dijo("sacá el import de D:\\Proyectos\\secreto\\.env", 3),
    dijo("nada de console.log, te lo dije", 4, "codex"),
  ];

  it("dice los números que midió y nada más", () => {
    const resumen = armarWrapped(CON_CODIGO, SIN_MEMORIA, AHORA);
    const tarjeta = tarjetaParaCompartir(resumen);
    expect(tarjeta).toContain(`${resumen.correcciones} veces`);
    expect(tarjeta).toContain(`${porcentajeDeCorrecciones(resumen)} %`);
    expect(tarjeta).toContain("Claude Code 3");
    expect(tarjeta).toContain("Codex 1");
    expect(tarjeta).toContain("sin telemetría");
  });

  it("no se lleva una línea de código, un nombre de archivo ni una palabra que escribió la persona", () => {
    const tarjeta = tarjetaParaCompartir(armarWrapped(CON_CODIGO, SIN_MEMORIA, AHORA));
    for (const filtrado of ["console", "log", "porton", "DOLPHIN_TOKEN", "process", "env", "src", "import", "secreto", "Proyectos"]) {
      expect(tarjeta, filtrado).not.toContain(filtrado);
    }
    // Ni rutas, ni comillas de código, ni paréntesis: nada con forma de código.
    expect(tarjeta).not.toMatch(/[/\\`(){}[\]=;]/);
    expect(tarjeta).not.toMatch(/\.(ts|js|md|json|env)\b/);
    // Cada línea con contenido es texto fijo más números.
    for (const linea of tarjeta.split("\n").filter((l) => l.trim() !== "")) {
      expect(linea, linea).toMatch(/^[A-Za-zÁÉÍÓÚáéíóúñÑ0-9 ,.:%·—]+$/);
    }
  });

  it("el singular no queda mal escrito", () => {
    const una = armarWrapped([dijo("nada de console.log en src", 1)], SIN_MEMORIA, AHORA);
    const tarjeta = tarjetaParaCompartir(una);
    expect(tarjeta).toContain("1 vez.");
    expect(tarjeta).toContain("1 se puede volver un chequeo automático.");
    expect(tarjeta).not.toContain("1 veces");
  });
});
