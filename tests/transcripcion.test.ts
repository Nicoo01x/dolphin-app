import { describe, expect, it } from "vitest";
import { Bufer } from "../src/tui/celdas.js";
import { T } from "../src/tui/piezas.js";
import { CORRIENDO, envolver, FALLO, HECHA, lineasDeTerminal, partirHerramienta, pintarLinea, tramosDeMarkdown, type RenglonDeVoz } from "../src/tui/transcripcion.js";

/**
 * La terminal de un agente dibujada como Claude Code: el punto de cada herramienta dice cómo salió,
 * lo que devolvió cuelga con «⎿», el diff va en rojo y verde y la lista de tareas se tilda.
 */

const texto = (lineas: ReturnType<typeof lineasDeTerminal>) => lineas.map((l) => l.tramos.map((x) => x.texto).join("").trimEnd());
const r = (tipo: string, t: string): RenglonDeVoz => ({ t: 0, tipo, texto: t });

describe("la transcripción al estilo de Claude Code", () => {
  it("una herramienta es Nombre(argumento) y lo que devolvió cuelga debajo", () => {
    expect(partirHerramienta("Bash: npm test")).toEqual({ nombre: "Bash", arg: "npm test" });
    expect(partirHerramienta("Edit src/a.ts")).toEqual({ nombre: "Edit", arg: "src/a.ts" });
    expect(partirHerramienta("TodoWrite")).toEqual({ nombre: "TodoWrite", arg: "" });
    const lineas = lineasDeTerminal([r("texto", "Miro el **repo**."), r("herramienta", "Bash: npm test"), r("resultado", "3 pasaron\n1 salteado")], 80, 0, false);
    expect(texto(lineas)).toEqual(["⏺ Miro el repo.".replace("⏺", texto(lineas)[0]!.slice(0, 1)), "", `${HECHA} Bash(npm test)`, "  ⎿  3 pasaron", "     1 salteado"]);
  });

  // La FORMA es la que dice el estado: el color solo la acompaña, y un color solo no se lee en
  // una terminal con cualquier tema ni lo ve quien no distingue rojo de verde.
  it("la marca: círculo mientras corre, tilde si salió, cruz si falló", () => {
    const marca = (renglones: RenglonDeVoz[], corriendo: boolean) =>
      lineasDeTerminal(renglones, 80, 0, corriendo).find((l) => l.tramos[1]?.texto === "Bash")!.tramos[0]!;
    expect(marca([r("herramienta", "Bash: x")], true)).toMatchObject({ texto: `${CORRIENDO} `, fg: T.naranja });
    expect(marca([r("herramienta", "Bash: x"), r("resultado", "ok")], true)).toMatchObject({ texto: `${HECHA} `, fg: T.verde });
    expect(marca([r("herramienta", "Bash: x"), r("error", "falló")], false)).toMatchObject({ texto: `${FALLO} `, fg: T.rojo });
    // Sin respuesta y con el agente parado: quedó sin contestar, no «salió bien».
    expect(marca([r("herramienta", "Bash: x")], false)).toMatchObject({ texto: `${CORRIENDO} `, fg: T.suave });
  });

  // Sin `ref`, lo que cuenta como «ya contestó» es que haya venido algo después: por eso el
  // Edit queda tildado y el TodoWrite, que es el último, se queda con el círculo.
  it("el diff con su resumen y cada renglón con fondo; las tareas tildadas", () => {
    const lineas = lineasDeTerminal([r("herramienta", "Edit src/a.ts"), r("diff", "1 agregado, 1 quitado\n  const a = 1\n- const b = 2\n+ const b = 3"), r("herramienta", "TodoWrite"), r("tareas", "[x] Leer\n[~] Editar\n[ ] Probar")], 80, 0, false);
    expect(texto(lineas)).toEqual([
      `${HECHA} Edit(src/a.ts)`,
      "  ⎿  1 agregado, 1 quitado",
      "       const a = 1",
      "     - const b = 2",
      "     + const b = 3",
      "",
      `${CORRIENDO} TodoWrite`,
      "  ⎿  ☒ Leer",
      "     ◼ Editar",
      "     ☐ Probar",
    ]);
    expect(lineas[3]!.fondo?.bg).not.toEqual(lineas[4]!.fondo?.bg);
    expect(lineas[2]!.fondo).toBeUndefined();
    expect(lineas[7]!.tramos.at(-1)).toMatchObject({ tachado: true });
  });

  it("el markdown de un renglón y el corte por palabras sin perder el estilo", () => {
    expect(tramosDeMarkdown("usá `npm test` **siempre**", T.texto).map((x) => [x.texto, x.fg === T.texto, !!x.negrita])).toEqual([
      ["usá ", true, false],
      ["npm test", false, false],
      [" ", true, false],
      ["siempre", true, true],
    ]);
    expect(tramosDeMarkdown("- uno", T.texto).map((x) => x.texto).join("")).toBe("• uno");
    expect(tramosDeMarkdown("## Título", T.texto)[0]).toMatchObject({ texto: "Título", negrita: true });
    const renglones = envolver([{ texto: "una frase ", fg: T.texto }, { texto: "bastante larga", fg: T.verde }], 12);
    expect(renglones.map((l) => l.map((x) => x.texto).join(""))).toEqual(["una frase", "bastante", "larga"]);
    expect(renglones[2]![0]!.fg).toEqual(T.verde);
  });

  it("se pinta en el búfer con el fondo del diff de punta a punta", () => {
    const b = new Bufer(30, 1);
    const [linea] = lineasDeTerminal([r("diff", "1 agregado, 0 quitados\n+ hola")], 30, 0, false).slice(1);
    pintarLinea(b, 0, 0, 30, linea!, T.panel);
    expect(b.comoTexto()[0]).toBe("     + hola");
    expect(b.celda(29, 0)!.bg).toEqual(b.celda(8, 0)!.bg);
    expect(b.celda(0, 0)!.bg).toBeNull();
  });

  it("herramientas en paralelo: cada resultado va debajo de la suya y su punto dice cómo le fue", () => {
    const con = (tipo: string, texto: string, ref: string): RenglonDeVoz => ({ t: 0, tipo, texto, ref });
    const lineas = lineasDeTerminal([con("herramienta", "Bash: npm test", "a"), con("herramienta", "Bash: ls", "b"), con("error", "falló A", "a"), con("resultado", "salió B", "b")], 80, 0, true);
    expect(texto(lineas)).toEqual([`${FALLO} Bash(npm test)`, "  ⎿  falló A", "", `${HECHA} Bash(ls)`, "  ⎿  salió B"]);
    expect(lineas[0]!.tramos[0]!.fg).toEqual(T.rojo);
    expect(lineas[3]!.tramos[0]!.fg).toEqual(T.verde);
    // Una edición que terminó bien no tiene nada que mostrar, pero su punto deja de titilar.
    const edicion = lineasDeTerminal([con("herramienta", "Edit a.ts", "e"), con("diff", "1 agregado, 0 quitados\n+ x", "e"), con("listo", "ok", "e")], 80, 0, true);
    expect(edicion[0]!.tramos[0]!.fg).toEqual(T.verde);
    expect(texto(edicion)).toHaveLength(3);
    // La que todavía corre, aunque ya haya arrancado otra, sigue naranja.
    const corriendo = lineasDeTerminal([con("herramienta", "Bash: a", "a"), con("herramienta", "Bash: b", "b"), con("resultado", "ok", "b")], 80, 0, true);
    expect(corriendo[0]!.tramos[0]!.fg).toEqual(T.naranja);
  });

  it("corta por columnas: los ideogramas ocupan dos y no se pierde ninguno", () => {
    const renglones = envolver([{ texto: "漢".repeat(30), fg: T.texto }], 10);
    expect(renglones.map((l) => l.map((x) => x.texto).join(""))).toEqual(["漢".repeat(5), "漢".repeat(5), "漢".repeat(5), "漢".repeat(5), "漢".repeat(5), "漢".repeat(5)]);
  });
});

describe("el aviso de compactado", () => {
  it("lo que le PASÓ al agente no se mezcla con lo que dice", () => {
    const lineas = lineasDeTerminal(
      [
        { t: 0, tipo: "texto", texto: "Miro el repo." },
        { t: 0, tipo: "compactado", texto: "Me quedé sin contexto: resumí lo que llevábamos y sigo." },
        { t: 0, tipo: "texto", texto: "Sigo." },
      ],
      80,
      0,
      false,
    );
    const marcas = lineas.filter((l) => l.tramos.length > 0).map((l) => l.tramos[0]!.texto);
    expect(marcas).toContain("⟳ ");
    // Y en cursiva, como todo lo que no es voz del agente.
    const aviso = lineas.find((l) => l.tramos[0]?.texto === "⟳ ")!;
    expect(aviso.tramos[1]?.cursiva).toBe(true);
  });
});
