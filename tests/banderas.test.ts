// Lo que pasa cuando alguien le erra al nombre. El caso que importa es el primero: `dolphin
// --help` contestaba con un stack de Node, que es la peor respuesta posible a la primera cosa que
// escribe quien acaba de instalar el CLI.

import { describe, expect, it } from "vitest";
import { parseArgs } from "node:util";
import { masParecido, motivoDeBandera, nombreEnElError } from "../src/nucleo/banderas.js";

/** El error de verdad de Node, no uno escrito a mano: si cambia su forma, el test se entera. */
function errorDe(argv: string[]): unknown {
  try {
    parseArgs({
      args: argv,
      options: { repo: { type: "string" }, agente: { type: "string" } },
      allowPositionals: true,
    });
    return null;
  } catch (error) {
    return error;
  }
}

describe("el nombre que vino mal", () => {
  it("sale del error de Node, sin el stack", () => {
    expect(nombreEnElError(errorDe(["--agent", "claude"]))).toBe("--agent");
  });

  it("pegado a su valor, el nombre termina en el '='", () => {
    expect(nombreEnElError(errorDe(["--agent=claude"]))).toBe("--agent");
  });

  it("sin nada que nombrar, no inventa un nombre", () => {
    expect(nombreEnElError(new Error("algo pasó"))).toBeNull();
  });
});

describe("el parecido", () => {
  const COMANDOS = ["sembrar", "equipo", "maquinas", "máquinas", "tablero", "ui", "mirar"];

  it("una letra de más o de menos encuentra el comando", () => {
    expect(masParecido("sembra", COMANDOS)).toBe("sembrar");
    expect(masParecido("tablerro", COMANDOS)).toBe("tablero");
  });

  it("el acento no cuenta como una letra cambiada", () => {
    expect(masParecido("maquinas", ["máquinas"])).toBe("máquinas");
  });

  it("una palabra que no se parece a ninguna no sugiere ninguna", () => {
    expect(masParecido("deployar", COMANDOS)).toBeNull();
  });

  it("en una palabra corta, dos letras ya son otra cosa", () => {
    // «ui» y «pr» son dos comandos distintos, no un tropiezo de tipeo: mandar al otro sería peor
    // que no decir nada.
    expect(masParecido("pr", ["ui"])).toBeNull();
  });

  it("«help» NO se parece a «ayuda»: por eso --help tiene que existir de verdad", () => {
    expect(masParecido("help", ["ayuda", "repo", "agente"])).toBeNull();
  });
});

describe("lo que se le dice a la persona", () => {
  const CONOCIDAS = ["--repo", "--agente", "--verificar", "--ayuda", "--help", "--demo"];

  it("nombra la opción y la que probablemente quiso", () => {
    expect(motivoDeBandera(errorDe(["--agent", "claude"]), CONOCIDAS)).toBe(
      "No conozco la opción --agent. ¿Quisiste decir --agente?"
    );
  });

  it("sin candidata parecida, lo dice y no manda a ningún lado", () => {
    expect(motivoDeBandera(errorDe(["--telegram"]), CONOCIDAS)).toBe(
      "No conozco la opción --telegram."
    );
  });

  it("una opción que SÍ existe pero vino mal no se contesta con «no la conozco»", () => {
    // Acá el error es que le falta el valor. Sin esta rama salía «No conozco la opción --repo.
    // ¿Quisiste decir --repo?», que además de inútil manda a buscar el error donde no está.
    const motivo = motivoDeBandera(new Error("Option '--repo <value>' argument missing"), CONOCIDAS);
    expect(motivo).toBe("Option '--repo <value>' argument missing");
    expect(motivo).not.toContain("\n");
  });
});
