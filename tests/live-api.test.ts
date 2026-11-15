import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { mensajeDeEntrega } from "../src/nucleo/entrega.js";
import { crearServidor, tareaEnVivo, type PedidoDeSiembra } from "../src/servidor.js";

/**
 * El modo live: tocás un elemento de la app que corre, en el navegador del
 * escritorio, y decís qué cambiarle. La consola recibe el elemento como lo
 * vio el navegador y siembra una rama con ese contexto.
 */

describe("la tarea de un toque", () => {
  it("lleva lo pedido y el elemento tal como estaba: dónde, qué dice, selector, archivo, estilos y HTML", () => {
    const tarea = tareaEnVivo("hacelo amarillo con el texto en negro", {
      url: "http://127.0.0.1:5173/ofertas#lista",
      texto: "Quiero recibir ofertas",
      selector: "form#ofertas > button",
      fuente: "src/Ofertas.tsx:42",
      estilos: { "background-color": "rgb(29, 29, 31)", color: "rgb(255, 255, 255)" },
      html: '<button type="submit">Quiero recibir ofertas</button>',
    });
    // Lo pedido va primero, con sus palabras: es el título de la cosecha y del commit.
    // Con una frase fija adelante, todos los pedidos en vivo se veían iguales en la lista.
    expect(tarea.split("\n")[0]).toBe("hacelo amarillo con el texto en negro");
    expect(mensajeDeEntrega(tarea)).toBe("dolphin: hacelo amarillo con el texto en negro");
    expect(tarea).toContain("Es sobre un elemento de la app que se tocó en la pantalla.");
    expect(tarea).toContain("- dónde: /ofertas#lista");
    expect(tarea).toContain("- dice: «Quiero recibir ofertas»");
    expect(tarea).toContain("- selector: form#ofertas > button");
    expect(tarea).toContain("- archivo: src/Ofertas.tsx:42");
    expect(tarea).toContain("  background-color: rgb(29, 29, 31)");
    expect(tarea).toContain('```html\n<button type="submit">Quiero recibir ofertas</button>\n```');
    expect(tarea).toContain("Cambiá ese elemento y nada más");
  });

  it("recorta lo que viene largo: un HTML enorme no se vuelve una tarea enorme", () => {
    const tarea = tareaEnVivo("x".repeat(5000), { html: `<div>${"y".repeat(20_000)}</div>` });
    expect(tarea.length).toBeLessThan(5000);
  });
});

describe("POST /api/live", () => {
  let repo = "";
  let servidor: ReturnType<typeof crearServidor>;
  let base = "";
  const pedidos: PedidoDeSiembra[] = [];

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-live-"));
    pedidos.length = 0;
    servidor = crearServidor({ repo, sembrar: (p) => pedidos.push(p), calendario: false });
    await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", listo));
    base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
  });

  afterEach(async () => {
    await new Promise((listo) => servidor.close(listo));
    await borrarCarpeta(repo);
  });

  const pase = async () => /name="dolphin-token" content="([0-9a-f]+)"/.exec(await (await fetch(`${base}/`)).text())?.[1];
  const mandar = (cuerpo: unknown, token?: string) =>
    fetch(`${base}/api/live`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { "x-dolphin-token": token } : {}) },
      body: JSON.stringify(cuerpo),
    });

  it("sin el pase de la consola no siembra nada", async () => {
    const r = await mandar({ pedido: "más redondeado", elemento: { selector: "button" } });
    expect(r.status).toBe(403);
    expect(pedidos).toEqual([]);
  });

  it("con el pase, siembra una rama con el elemento; sin pedido o sin elemento, dice qué falta", async () => {
    const token = await pase();
    // Sin la consola construida no hay página con el pase: el endpoint queda cerrado.
    if (!token) return;

    const sinPedido = await mandar({ pedido: "  ", elemento: { selector: "button" } }, token);
    expect(sinPedido.status).toBe(400);
    expect((await sinPedido.json()).porQue).toBe("contá qué querés cambiarle");
    const sinElemento = await mandar({ pedido: "más redondeado", elemento: {} }, token);
    expect((await sinElemento.json()).porQue).toBe("falta el elemento: tocá algo de la app primero");

    const r = await mandar({ pedido: "más redondeado", elemento: { selector: "button.comprar", texto: "Comprar", estilos: { "border-radius": "4px", malo: 3 } } }, token);
    expect(r.status).toBe(202);
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0]).toMatchObject({ n: 1, agente: "claude" });
    expect(pedidos[0]!.tarea.split("\n")[0]).toBe("más redondeado");
    expect(pedidos[0]!.tarea).toContain("- selector: button.comprar");
    expect(pedidos[0]!.tarea).toContain("  border-radius: 4px");
    // Lo que no es texto en los estilos no viaja.
    expect(pedidos[0]!.tarea).not.toContain("malo");
  });
});
