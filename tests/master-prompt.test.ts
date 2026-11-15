import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { armarPrompt, guardarCaptura, mejorarPrompt, numeroDePin, type Mejorador } from "../src/nucleo/master-prompt.js";
import { crearServidor } from "../src/servidor.js";

/** Master Prompt: capturas con sus puntos marcados y el prompt armado (o mejorado) para mandarle a Claude. */

// Un PNG de 1×1 de verdad: la firma es lo que se controla.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

describe("Master Prompt", () => {
  let repo = "";
  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-prompt-"));
  });
  afterEach(async () => {
    await borrarCarpeta(repo);
  });

  it("guarda las capturas numeradas, solo PNG, y no deja salir el id de su carpeta", async () => {
    const una = await guardarCaptura(repo, "p1", PNG);
    const otra = await guardarCaptura(repo, "p1", PNG);
    expect(una).toBe(join(repo, ".dolphin", "prompts", "p1", "captura-1.png"));
    expect(otra.endsWith("captura-2.png")).toBe(true);
    expect((await readFile(una)).equals(PNG)).toBe(true);
    await expect(guardarCaptura(repo, "p1", Buffer.from("no soy una imagen"))).rejects.toThrow("PNG");
    await expect(guardarCaptura(repo, "../afuera", PNG)).rejects.toThrow("id");
  });

  it("la versión con los puntos dibujados va al lado de su original y se reescribe; de otro prompt, no", async () => {
    const original = await guardarCaptura(repo, "p1", PNG);
    const marcada = await guardarCaptura(repo, "p1", PNG, original);
    expect(marcada).toBe(join(repo, ".dolphin", "prompts", "p1", "captura-1-marcada.png"));
    // Cambiaron los puntos: se pisa, no se numera de nuevo.
    expect(await guardarCaptura(repo, "p1", PNG, original)).toBe(marcada);
    await expect(guardarCaptura(repo, "p2", PNG, original)).rejects.toThrow("de este prompt");
    await expect(guardarCaptura(repo, "p1", PNG, marcada)).rejects.toThrow("de este prompt");
  });

  it("armarlo no gasta: el pedido, cada captura con su ruta, su nota y sus puntos con dónde están", () => {
    const texto = armarPrompt({
      pedido: "El chat se ve mal",
      capturas: [
        {
          ruta: "C:/r/.dolphin/prompts/p/captura-1.png",
          marcada: "C:/r/.dolphin/prompts/p/captura-1-marcada.png",
          nota: "la pantalla del chat",
          pines: [
            { x: 31.4, y: 14, nota: "la línea verde cruza todo\nsacala" },
            { x: 90, y: 50, nota: "" },
          ],
        },
        { ruta: "C:/r/.dolphin/prompts/p/captura-2.png", nota: "", marcada: "C:/r/x-marcada.png" },
      ],
    });
    expect(texto).toContain("El chat se ve mal");
    expect(texto).toContain("## Las capturas");
    expect(texto).toContain("1. C:/r/.dolphin/prompts/p/captura-1.png\n   Con los puntos dibujados encima: C:/r/.dolphin/prompts/p/captura-1-marcada.png\n   la pantalla del chat\n");
    expect(texto).toContain("   ① a 31 % del borde izquierdo y 14 % del de arriba: la línea verde cruza todo\n   sacala\n");
    expect(texto).toContain("   ② a 90 % del borde izquierdo y 50 % del de arriba: acá");
    // Sin puntos, la marcada no se nombra aunque venga.
    expect(texto).toContain("2. C:/r/.dolphin/prompts/p/captura-2.png\n\n");
    expect(texto).not.toContain("x-marcada");
    expect(texto).toContain("los tiene numerados encima de la imagen");
    expect(armarPrompt({ pedido: "solo texto", capturas: [] })).toBe("solo texto");
    expect(numeroDePin(0)).toBe("①");
    expect(numeroDePin(25)).toBe("(26)");
  });

  it("si el modelo se olvida de una captura, se le suma al final; nombrar la marcada alcanza; vacío no se manda", async () => {
    const capturas = [
      { ruta: "/r/captura-1.png", nota: "el botón", marcada: "/r/captura-1-marcada.png", pines: [{ x: 1, y: 2, nota: "acá" }] },
      { ruta: "/r/captura-2.png", nota: "el menú" },
    ];
    const olvidadizo: Mejorador = async (prompt) => ({ texto: `Arreglá el botón de /r/captura-1-marcada.png. ${prompt.includes("el menú") ? "" : "x"}`, gastado: 0.01 });
    const mejorado = await mejorarPrompt({ pedido: "arreglá esto", capturas }, repo, olvidadizo);
    expect(mejorado.gastado).toBe(0.01);
    expect(mejorado.texto).toContain("## Capturas\n\n1. /r/captura-2.png\n   el menú");
    expect(mejorado.texto).not.toContain("1. /r/captura-1.png");
    await expect(mejorarPrompt({ pedido: "  ", capturas: [] }, repo, olvidadizo)).rejects.toThrow("escribí");
  });

  describe("desde la consola", () => {
    let servidor: ReturnType<typeof crearServidor>;
    let base = "";
    let token = "";
    const pedidos: string[] = [];

    beforeEach(async () => {
      pedidos.length = 0;
      const mejorador: Mejorador = async (prompt) => {
        pedidos.push(prompt);
        return { texto: "## Qué hay que lograr\n\nmejorado", gastado: 0 };
      };
      servidor = crearServidor({ repo, calendario: false, mejorarPrompt: mejorador });
      await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", listo));
      base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
      token = /name="dolphin-token" content="([0-9a-f]+)"/.exec(await (await fetch(`${base}/`)).text())?.[1] ?? "";
    });
    afterEach(async () => {
      await new Promise((listo) => servidor.close(listo));
    });

    const mandar = (ruta: string, cuerpo: unknown, pase = token) =>
      fetch(`${base}${ruta}`, { method: "POST", headers: { "content-type": "application/json", "x-dolphin-token": pase }, body: JSON.stringify(cuerpo) });

    it("sube la captura y su marcada, las devuelve, y el prompt nombra las dos con los puntos; nada de afuera de la carpeta", async () => {
      expect((await mandar("/api/prompt/captura", { id: "p2", png: PNG.toString("base64") }, "")).status).toBe(403);
      const subida = await (await mandar("/api/prompt/captura", { id: "p2", png: `data:image/png;base64,${PNG.toString("base64")}` })).json();
      expect(subida.ok).toBe(true);
      const marcada = await (await mandar("/api/prompt/captura", { id: "p2", png: PNG.toString("base64"), marcaDe: subida.ruta })).json();
      expect(marcada.ruta.endsWith("captura-1-marcada.png")).toBe(true);

      const vuelta = await fetch(`${base}/api/prompt/captura?ruta=${encodeURIComponent(subida.ruta)}`);
      expect(vuelta.headers.get("content-type")).toBe("image/png");
      expect(Buffer.from(await vuelta.arrayBuffer()).equals(PNG)).toBe(true);

      // Un archivo del repo que no es una captura no se sirve, no se marca ni se manda al modelo.
      const ajeno = join(repo, "secreto.png");
      await writeFile(ajeno, PNG);
      expect((await fetch(`${base}/api/prompt/captura?ruta=${encodeURIComponent(ajeno)}`)).status).toBe(404);
      expect((await mandar("/api/prompt/captura", { id: "p2", png: PNG.toString("base64"), marcaDe: ajeno })).status).toBe(400);
      expect((await mandar("/api/prompt/mejorar", { pedido: "x", capturas: [{ ruta: ajeno, nota: "" }] })).status).toBe(400);

      const capturas = [{ ruta: subida.ruta, nota: "la pantalla", marcada: marcada.ruta, pines: [{ x: 10, y: 20, nota: "la línea verde" }, { x: 500, y: 1, nota: "no vale" }] }];
      const mejorado = await (await mandar("/api/prompt/mejorar", { pedido: "el chat se ve mal", capturas })).json();
      expect(pedidos[0]).toContain("① a 10 % del borde izquierdo y 20 % del de arriba: la línea verde");
      expect(pedidos[0]).not.toContain("no vale");
      expect(pedidos[0]).toContain(marcada.ruta);
      expect(mejorado.texto).toContain("mejorado");
      expect(mejorado.texto).toContain(subida.ruta);

      const armado = await (await mandar("/api/prompt/armar", { pedido: "sin gastar", capturas })).json();
      expect(armado.texto).toContain(`1. ${subida.ruta}\n   Con los puntos dibujados encima: ${marcada.ruta}\n   la pantalla\n   ①`);
      expect(pedidos).toHaveLength(1);
    });

    it("en la demo no llama a nadie", async () => {
      const demo = crearServidor({ repo, calendario: false, demo: true });
      await new Promise<void>((listo) => demo.listen(0, "127.0.0.1", listo));
      const b = `http://127.0.0.1:${(demo.address() as { port: number }).port}`;
      const t = /name="dolphin-token" content="([0-9a-f]+)"/.exec(await (await fetch(`${b}/`)).text())?.[1] ?? "";
      const r = await (
        await fetch(`${b}/api/prompt/mejorar`, { method: "POST", headers: { "content-type": "application/json", "x-dolphin-token": t }, body: JSON.stringify({ pedido: "hola", capturas: [] }) })
      ).json();
      await new Promise((listo) => demo.close(listo));
      expect(r.texto).toContain("## Qué hay que lograr\n\nhola");
      expect(pedidos).toHaveLength(0);
    });
  });
});
