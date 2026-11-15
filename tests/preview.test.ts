import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import {
  cerrarLosOlvidados,
  cerrarPreview,
  cerrarTodosLosPreviews,
  conInspector,
  paraLaConsola,
  previewDeRama,
  previewsAbiertos,
  registrarPreview,
  servirPreview,
} from "../src/nucleo/preview.js";
import { comoSeLlama, selectorDe, type NodoVisto } from "../src/nucleo/preview-selector.js";

/**
 * El preview: la app de una rama servida por el origen de la consola, para poder tocarla.
 *
 * Lo que importa: que el proxy solo sirva previews del registro (no cualquier puerto de la
 * máquina), que el HTML salga con el inspector adentro, que lo que no es HTML pase tal cual, y que
 * una app que nadie mira se apague.
 */

const nodo = (etiqueta: string, extra: Partial<NodoVisto> = {}): NodoVisto => ({ etiqueta, ...extra });

describe("cómo se nombra lo que tocaste", () => {
  it("el data-testid gana: alguien lo puso justo para esto", () => {
    expect(selectorDe([nodo("button", { marca: { atributo: "data-testid", valor: "guardar" }, id: "x", clases: ["btn"] })])).toBe('[data-testid="guardar"]');
  });

  it("después el id, salvo que lo haya inventado el framework", () => {
    expect(selectorDe([nodo("input", { id: "correo" })])).toBe("#correo");
    // Los `useId` de React y los de Radix cambian en cada render: un selector con eso no sirve.
    expect(selectorDe([nodo("input", { id: ":r3:", clases: ["campo"] })])).toBe("input.campo");
    expect(selectorDe([nodo("div", { id: "radix-:r1:" })])).toBe("div");
    expect(selectorDe([nodo("div", { id: "9bloque" })])).toBe("div");
  });

  it("las clases que habría que escapar o que cambian con el build no entran", () => {
    expect(selectorDe([nodo("div", { clases: ["md:flex", "w-[32px]", "tarjeta", "p-1.5"] })])).toBe("div.tarjeta");
    expect(selectorDe([nodo("div", { clases: ["css-1x2y3z", "sc-aBcDeF", "jsx-123", "boton-9f3c1a"] })])).toBe("div");
    // Dos como máximo: un selector con ocho clases no lo lee nadie.
    expect(selectorDe([nodo("div", { clases: ["una", "dos", "tres"] })])).toBe("div.una.dos");
  });

  it("la posición solo cuando hay con quién confundirse", () => {
    expect(selectorDe([nodo("li", { posicion: 2, hermanosIguales: 5 })])).toBe("li:nth-of-type(2)");
    expect(selectorDe([nodo("li", { posicion: 1, hermanosIguales: 1 })])).toBe("li");
  });

  it("si el elemento no se puede nombrar solo, se cuelga del ancestro que sí", () => {
    const camino = [
      nodo("button", { clases: ["primario"], posicion: 2, hermanosIguales: 3 }),
      nodo("form", { clases: ["alta"] }),
      nodo("section", { id: "panel" }),
      nodo("body"),
    ];
    // Corta en el primer ancestro único: el body no hace falta.
    expect(selectorDe(camino)).toBe("#panel > form.alta > button.primario:nth-of-type(2)");
  });

  it("sin ningún ancestro nombrable usa tres niveles igual: acorta la búsqueda", () => {
    const camino = [nodo("span"), nodo("div"), nodo("div"), nodo("div"), nodo("body")];
    expect(selectorDe(camino)).toBe("div > div > div > span");
  });

  it("lo que se le muestra a la persona lleva el texto adelante, que es lo que se entiende", () => {
    expect(comoSeLlama([nodo("button", { id: "guardar" })], "  Guardar  los\n cambios ")).toBe("«Guardar los cambios» · #guardar");
    expect(comoSeLlama([nodo("button", { id: "guardar" })])).toBe("#guardar");
  });
});

describe("el inspector inyectado", () => {
  it("entra adentro del head, con el base del preview", () => {
    const html = conInspector("<html><head><title>x</title></head><body>hola</body></html>", "p1");
    expect(html).toContain('<base href="/preview/p1/">');
    expect(html.indexOf("__dolphinInspector")).toBeLessThan(html.indexOf("<title>"));
  });

  it("sin head, al principio: perder el inspector es perder la función", () => {
    expect(conInspector("<body>hola</body>", "p2")).toContain("__dolphinInspector");
  });
});

describe("el proxy del preview", () => {
  const servidores: Server[] = [];

  /** Una app de mentira, en un puerto de verdad. */
  async function app(responder: (ruta: string) => { tipo: string; cuerpo: string; estado?: number; location?: string }) {
    const servidor = createServer((pedido, respuesta) => {
      const r = responder(pedido.url ?? "/");
      respuesta.writeHead(r.estado ?? 200, {
        "content-type": r.tipo,
        // Una app con CSP estricta: adentro del preview no puede bloquear el inspector.
        "content-security-policy": "default-src 'self'",
        ...(r.location ? { location: r.location } : {}),
      });
      respuesta.end(r.cuerpo);
    });
    servidores.push(servidor);
    await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", listo));
    const puerto = (servidor.address() as { port: number }).port;
    return { url: `http://127.0.0.1:${puerto}/`, salida: () => "", detener: async () => {} };
  }

  /** El servidor que hace de consola: solo sabe servir previews. */
  async function consola() {
    const servidor = createServer((pedido, respuesta) => {
      if (servirPreview(new URL(pedido.url ?? "/", "http://local").pathname, pedido, respuesta)) return;
      respuesta.writeHead(200, { "content-type": "text/plain" });
      respuesta.end("la consola");
    });
    servidores.push(servidor);
    await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", listo));
    return `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
  }

  afterEach(async () => {
    await cerrarTodosLosPreviews();
    await Promise.all(servidores.splice(0).map((s) => new Promise<void>((listo) => s.close(() => listo()))));
  });

  it("sirve el HTML de la app con el inspector adentro y sin su CSP", async () => {
    const preview = registrarPreview({ rama: "dolphin/u1", ruta: "/w/u1", app: await app(() => ({ tipo: "text/html", cuerpo: "<html><head></head><body><button id='guardar'>Guardar</button></body></html>" })) });
    const base = await consola();

    const respuesta = await fetch(`${base}${paraLaConsola(preview).enLaConsola}`);
    const html = await respuesta.text();

    expect(respuesta.status).toBe(200);
    expect(html).toContain("__dolphinInspector");
    expect(html).toContain("<button id='guardar'>");
    // Con la CSP de la app puesta, el script inyectado no correría.
    expect(respuesta.headers.get("content-security-policy")).toBeNull();
    // Y el largo tiene que ser el de lo inyectado, o el navegador corta la página.
    expect(Number(respuesta.headers.get("content-length"))).toBe(Buffer.byteLength(html));
  });

  it("lo que no es HTML pasa tal cual: un .js con el inspector adentro no compila", async () => {
    registrarPreview({ rama: "dolphin/u1", ruta: "/w/u1", app: await app(() => ({ tipo: "application/javascript", cuerpo: "export const a = 1;" })) });
    const base = await consola();

    const respuesta = await fetch(`${base}/preview/p1/assets/x.js`);
    expect(await respuesta.text()).toBe("export const a = 1;");
  });

  it("reenvía la ruta y la consulta tal como las pidió el iframe", async () => {
    registrarPreview({ rama: "dolphin/u1", ruta: "/w/u1", app: await app((ruta) => ({ tipo: "text/plain", cuerpo: ruta })) });
    const base = await consola();

    expect(await (await fetch(`${base}/preview/p1/alta?paso=2`)).text()).toBe("/alta?paso=2");
  });

  it("una redirección de la app vuelve al prefijo: si no, el iframe se va del preview", async () => {
    registrarPreview({ rama: "dolphin/u1", ruta: "/w/u1", app: await app(() => ({ tipo: "text/plain", cuerpo: "", estado: 302, location: "/entrar" })) });
    const base = await consola();

    const respuesta = await fetch(`${base}/preview/p1/panel`, { redirect: "manual" });
    expect(respuesta.headers.get("location")).toBe("/preview/p1/entrar");
  });

  it("un id que no está en el registro no se proxea: el proxy no acepta puertos sueltos", async () => {
    const base = await consola();
    const respuesta = await fetch(`${base}/preview/p99/`);
    expect(respuesta.status).toBe(404);
    expect(await respuesta.text()).toContain("ya no está abierto");
  });

  it("lo que no es un preview lo sigue sirviendo la consola", async () => {
    const base = await consola();
    expect(await (await fetch(`${base}/api/tablero`)).text()).toBe("la consola");
  });

  it("si la app no contesta, el 502 trae su salida: es lo que explica la pantalla en blanco", async () => {
    registrarPreview({
      rama: "dolphin/u1",
      ruta: "/w/u1",
      // Un puerto donde no hay nada, como cuando el dev server se cayó solo.
      app: { url: "http://127.0.0.1:9/", salida: () => "Error: Cannot find module 'react'", detener: async () => {} },
    });
    const base = await consola();

    const respuesta = await fetch(`${base}/preview/p1/`);
    expect(respuesta.status).toBe(502);
    expect(await respuesta.text()).toContain("Cannot find module 'react'");
  });
});

describe("el registro de previews", () => {
  afterEach(async () => {
    await cerrarTodosLosPreviews();
  });

  const falso = (): { url: string; salida: () => string; detener: () => Promise<void> } => ({ url: "http://127.0.0.1:1234/", salida: () => "", detener: async () => {} });

  it("cada rama encuentra el suyo, y se listan para la consola", () => {
    const uno = registrarPreview({ rama: "dolphin/u1", ruta: "/w/u1", app: falso() });
    const dos = registrarPreview({ rama: "dolphin/u2", ruta: "/w/u2", app: falso() });

    expect(previewDeRama("dolphin/u2")?.id).toBe(dos.id);
    expect(previewsAbiertos().map((p) => p.enLaConsola)).toEqual([`/preview/${uno.id}/`, `/preview/${dos.id}/`]);
  });

  it("cerrar apaga el proceso y lo saca del registro", async () => {
    let apagado = false;
    const preview = registrarPreview({ rama: "dolphin/u1", ruta: "/w/u1", app: { ...falso(), detener: async () => void (apagado = true) } });

    expect(await cerrarPreview(preview.id)).toBe(true);
    expect(apagado).toBe(true);
    expect(previewsAbiertos()).toEqual([]);
    // Cerrar dos veces no es un error: la consola puede pedirlo dos veces.
    expect(await cerrarPreview(preview.id)).toBe(false);
  });

  it("el que nadie mira desde hace rato se apaga solo; el que se está mirando, no", async () => {
    const viejo = registrarPreview({ rama: "dolphin/u1", ruta: "/w/u1", app: falso(), ahora: 0 });
    const mirado = registrarPreview({ rama: "dolphin/u2", ruta: "/w/u2", app: falso(), ahora: 0 });
    mirado.ultimoUso = 30 * 60_000;

    expect(await cerrarLosOlvidados(31 * 60_000, 10)).toEqual([viejo.id]);
    expect(previewsAbiertos().map((p) => p.id)).toEqual([mirado.id]);
  });
});
