import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { leerContrato, leerSalida, mensajeDeError } from "../src/agentes/claude.js";
import { fallaDeCodex, leerSalidaDeAntigravity } from "../src/agentes/otros.js";
import { leerVeredicto } from "../src/agentes/revisor.js";
import { clave, normalizarSuperficie } from "../src/tester/escalon-pantalla.js";
import { conFuentesQueExisten } from "../src/ideas/scout.js";
import { levantarApp } from "../src/tester/levantar.js";
import { aislarAgentes, noPasaTalCual, prepararComando } from "../src/agentes/ejecutar.js";
import type { AsuntoNuevo } from "../src/nucleo/bandeja.js";

/**
 * Lo que encontró la revisión del 22/10 en los agentes y el tester, cada
 * cosa con su caso: lo que se lee de un CLI, lo que se compara y lo que se cree.
 */

describe("lo que se lee de los CLIs", () => {
  it("el contrato conserva los «_»: /mis_facturas no es /misfacturas", () => {
    const contrato = leerContrato("listo\nSUPERFICIES: **/mis_facturas**, `/alta`\nRESUMEN: suma el filtro\nNOTA: la base sale de DATABASE_URL");
    expect(contrato?.superficies).toEqual(["/mis_facturas", "/alta"]);
    expect(contrato?.nota).toBe("la base sale de DATABASE_URL");
  });

  it("una salida con un aviso antes se lee igual, aunque traiga objetos anidados", () => {
    const salida = 'Hay una versión nueva de Claude Code.\n{"type":"result","result":"listo","total_cost_usd":0.02,"usage":{"input_tokens":10}}';
    expect(leerSalida(salida)).toMatchObject({ result: "listo", total_cost_usd: 0.02 });
  });

  it("quedarse sin vueltas se dice con su nombre, no «sin explicación»", () => {
    expect(mensajeDeError({ is_error: true, subtype: "error_max_turns" })).toContain("se quedó sin vueltas");
  });

  it("Codex: un turno fallido o un código de salida sin turnos son una falla, con su motivo", () => {
    const eventos = ['{"type":"turn.started"}', '{"type":"turn.failed","error":{"message":"You exceeded your usage limit"}}'].join("\n");
    expect(fallaDeCodex(eventos, 1)).toBe("You exceeded your usage limit");
    expect(fallaDeCodex("", 2)).toContain("salió con 2");
    expect(fallaDeCodex('{"type":"turn.completed","usage":{}}', 0)).toBeUndefined();
  });

  it("Antigravity: el objeto de la salida aunque venga con un aviso antes", () => {
    expect(leerSalidaDeAntigravity('aviso: {nada}\n{"status":"SUCCESS","response":"ok"}')).toMatchObject({ status: "SUCCESS", response: "ok" });
  });

  it("la revisión se lee aunque el porqué cite algo entre llaves", () => {
    const texto = '{"decision": "cortar", "porque": "devuelve {a: 1} en vez del total"}';
    expect(leerVeredicto(texto)).toEqual({ paso: false, porque: "devuelve {a: 1} en vez del total" });
  });
});

describe("lo que se manda a los CLIs", () => {
  it.runIf(process.platform === "win32")("un motor .cmd dentro de la caja no pasa por cmd.exe ni lleva verbatim", () => {
    aislarAgentes({ tipo: "docker", config: { imagen: "dolphin-claude" } });
    try {
      const preparado = prepararComando("npm", ["run", "test", "--", "archivo.test.ts"]);
      expect(preparado).toMatchObject({ cmd: "npm", args: ["run", "test", "--", "archivo.test.ts"], verbatim: false });
    } finally {
      aislarAgentes(null);
    }
  });

  it.runIf(process.platform === "win32")("por cmd.exe, un argumento de varias líneas falla con su motivo en vez de llegar cortado", () => {
    expect(() => prepararComando("npm", ["run", "algo\nrm -rf ."])).toThrow(/varias líneas/);
    expect(noPasaTalCual("npm", "subí el 10% del envío")).toBe(true);
    expect(noPasaTalCual("npm", "una línea sola")).toBe(false);
  });

  it.runIf(process.platform === "win32")("por cmd.exe, un argumento vacío llega como vacío y no desaparece", () => {
    const linea = prepararComando("npm", ["--tools", "", "--otro"])?.args.at(-1) ?? "";
    expect(linea).toMatch(/ --tools "" --otro"$/);
  });

  it("sin cmd.exe en el medio, el argumento llega tal cual, saltos incluidos", () => {
    expect(noPasaTalCual("node", "dos\nlíneas y un 10%")).toBe(false);
    expect(prepararComando("node", ["dos\nlíneas"])?.args).toEqual(["dos\nlíneas"]);
  });
});

describe("lo que compara la pantalla", () => {
  it("en la consola, lo que distingue un error es el mensaje: uno nuevo no pasa por el de siempre", () => {
    const viejo = clave("pulgar", { tipo: "consola", donde: "la consola", detalle: "GET /favicon.ico 404" });
    const nuevo = clave("pulgar", { tipo: "consola", donde: "la consola", detalle: "TypeError: x is undefined" });
    expect(nuevo).not.toBe(viejo);
  });

  it("en el resto, el lugar sin el texto del elemento: renombrar el botón no vuelve nuevo un contraste viejo", () => {
    const antes = clave("contraste", { tipo: "contraste", donde: "button.cta «Enviar»" });
    const despues = clave("contraste", { tipo: "contraste", donde: "button.cta «Mandar»" });
    expect(despues).toBe(antes);
  });

  it("«//otro-sitio/x» no es una ruta de esta app", () => {
    expect(normalizarSuperficie("//otro-sitio/x")).toBeUndefined();
    expect(normalizarSuperficie("/alta")).toBe("/alta");
  });
});

describe("lo que se cree", () => {
  it("una fuente que no abre se va, y una idea sin fuentes también", async () => {
    const idea = (titulo: string, ...urls: string[]): AsuntoNuevo => ({
      tipo: "idea",
      titulo,
      detalle: "x",
      origen: "scout",
      fuentes: urls.map((url) => ({ titulo: url, url })),
    });
    const abrir = async (url: string) => !url.includes("inventada");
    const quedan = await conFuentesQueExisten([idea("buena", "https://ok.example/a", "https://inventada.example/b"), idea("toda inventada", "https://inventada.example/c")], abrir);
    expect(quedan.map((i) => i.titulo)).toEqual(["buena"]);
    expect(quedan[0]!.fuentes!.map((f) => f.url)).toEqual(["https://ok.example/a"]);
  });

  it("si en el puerto ya contesta otra app, no se la juzga como si fuera la de la rama", async () => {
    const vieja = createServer((_q, r) => r.end("la app de ayer"));
    await new Promise<void>((listo) => vieja.listen(0, "127.0.0.1", listo));
    const puerto = (vieja.address() as { port: number }).port;
    try {
      await expect(levantarApp({ comando: "node -e \"setTimeout(()=>{},60000)\"", url: "http://127.0.0.1:{PUERTO}/", cwd: process.cwd(), puerto })).rejects.toThrow(
        "ya contesta otra cosa",
      );
    } finally {
      await new Promise((listo) => vieja.close(listo));
    }
  });
});
