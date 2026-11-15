import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { escaleraDe, escribirParte, htmlDelParte } from "../src/nucleo/parte.js";
import { crearServidor } from "../src/servidor.js";
import type { Candidato, Cosecha } from "../src/nucleo/tipos.js";

/**
 * El parte: la escalera de cortes, las cifras, la elegida con su diff y
 * los videos, en un HTML que no pide nada de afuera.
 */

const pasada = (verificador: string, paso: boolean, extra: Partial<Candidato["pasadas"][number]> = {}) => ({
  verificador,
  costo: "gratis" as const,
  paso,
  detalle: paso ? `${verificador}: pasó` : `${verificador}: ✖ algo`,
  gastado: 0,
  ms: 100,
  ...extra,
});

const u1: Candidato = {
  universo: { id: "u1", rama: "dolphin/x/u1", ruta: "/tmp/u1", nacido: 0 },
  vivo: true,
  modelo: "sonnet",
  enfoque: "mínimo",
  contrato: { superficies: ["/"], resumen: "el carrito cobra el IVA una sola vez" },
  forma: { archivos: 1, agregadas: 1, quitadas: 1, dependenciasNuevas: 0 },
  // Rebotó en pantalla, se corrigió y pasó en la segunda vuelta.
  pasadas: [
    pasada("test", true),
    pasada("pantalla", false, { detalle: "pantalla · pulgar: a «Favoritos» mide 135×21 px" }),
    pasada("pantalla", true, { intento: 2 }),
  ],
};
const u2: Candidato = {
  universo: { id: "u2", rama: "dolphin/x/u2", ruta: "/tmp/u2", nacido: 0 },
  vivo: false,
  modelo: "haiku",
  murioEn: "pantalla",
  porQue: "pantalla · pulgar: button «Comprar» mide 86×28 px",
  pasadas: [pasada("test", true), pasada("pantalla", false, { videos: ["u2-pulgar-1792.webm"] })],
};
const u3: Candidato = {
  universo: { id: "u3", rama: "dolphin/x/u3", ruta: "/tmp/u3", nacido: 0 },
  vivo: false,
  murioEn: "el agente",
  porQue: "se quedó sin contexto",
  pasadas: [],
};

const cosecha: Cosecha = {
  tarea: "Arreglá el IVA <script>alert(1)</script> & el redondeo",
  candidatos: [u1, u2, u3],
  ganador: u1,
  porQueGano: "pasó todo y es la más chica",
  gastado: 0.031,
  muertosGratis: 2,
  ms: 95_000,
  modelos: { estrategia: "equilibrada", escribir: "sonnet", corregir: "sonnet", revisar: "haiku" },
  entregada: { rama: "dolphin/x/u1", commit: "abc1234def", base: "000", ramaBase: "main" },
};

describe("la escalera", () => {
  it("cada fase con cuántas llegaron, quién se cortó y quién se corrigió; lo que se cayó escribiendo va primero", () => {
    expect(escaleraDe(cosecha)).toEqual([
      { fase: "escribiendo", entraron: 3, murieron: [{ rama: "u3", porQue: "se quedó sin contexto" }], corregidas: [], deshechas: [], salteadas: [] },
      { fase: "test", entraron: 2, murieron: [], corregidas: [], deshechas: [], salteadas: [] },
      {
        fase: "pantalla",
        entraron: 2,
        murieron: [{ rama: "u2", modelo: "haiku", porQue: "pantalla · pulgar: button «Comprar» mide 86×28 px" }],
        // u1 rebotó acá: no se cortó, pero el bucle trabajó, y eso se cuenta.
        corregidas: [{ rama: "u1", modelo: "sonnet", porQue: "pantalla · pulgar: a «Favoritos» mide 135×21 px" }],
        deshechas: [],
        salteadas: [],
      },
    ]);
  });

  it("una corrección que rompió otra fase y se deshizo queda contada en la fase que rompió", () => {
    const conVuelta: Cosecha = {
      ...cosecha,
      candidatos: [
        {
          universo: { id: "u1", rama: "dolphin/x/u1", ruta: "", nacido: 0 },
          vivo: true,
          modelo: "sonnet",
          pasadas: [
            { verificador: "test", costo: "gratis", paso: true, detalle: "test: pasó", gastado: 0, ms: 1 },
            { verificador: "revisión", costo: "barato", paso: false, detalle: "revisión: falta la nota", gastado: 0.01, ms: 1 },
            { verificador: "revisión", costo: "barato", paso: true, detalle: "revisión: bien", gastado: 0.01, ms: 1, intento: 2 },
            { verificador: "test", costo: "gratis", paso: false, detalle: "test: rota", gastado: 0, ms: 1, rotaPor: "revisión", deshecha: true },
            { verificador: "revisión", costo: "barato", paso: true, detalle: "revisión: bien", gastado: 0.01, ms: 1, intento: 3 },
          ],
        },
      ],
    };
    const [test] = escaleraDe(conVuelta);
    expect(test).toMatchObject({
      fase: "test",
      deshechas: [{ rama: "u1", modelo: "sonnet", porQue: "la corrección de «revisión» lo rompió y se volvió atrás" }],
    });
    expect(htmlDelParte({ cosecha: conVuelta, cuando: "2026-10-22T03:00:00.000Z", repo: "/r" })).toContain("1 corrección deshecha");
  });
});

describe("el parte", () => {
  const html = htmlDelParte({
    cosecha,
    cuando: "2026-10-21T22:00:00.000Z",
    repo: "D:/proyectos/tienda",
    diff: "diff --git a/p.js b/p.js\n@@ -1 +1 @@\n-x * 1.21 * 1.21\n+x * 1.21 < 2 && y",
    compilado: "parte-1.webm",
  });

  it("dice las cifras y quién hizo qué", () => {
    expect(html).toContain("1 de 3 ramas pasaron todas las fases · 2 se cortaron gratis · tardó 2 min · costó US$ 0,03");
    expect(html).toContain("Escribió sonnet · revisó haiku · estrategia equilibrada");
    expect(html).toContain("tienda");
  });

  it("muestra la escalera con cada corte y cada corrección, con su motivo", () => {
    expect(html).toContain("<b>pantalla</b>");
    expect(html).toContain("2 llegaron · 1 se cortó · 1 pasó tras corregir");
    // La fase se corta exacta: queda quién lo vio («pulgar»), que es parte de la evidencia.
    expect(html).toContain("<b>u2</b> · haiku — pulgar: button «Comprar» mide 86×28 px");
    expect(html).toContain("<b>u1</b> · sonnet — pulgar: a «Favoritos» mide 135×21 px <em>→ se corrigió y pasó</em>");
    expect(html).toContain("<b>u3</b> — se quedó sin contexto");
  });

  it("la elegida, con su diff pintado y escapado", () => {
    expect(html).toContain("commit abc1234, lista para mergear en main");
    expect(html).toContain('<span class="menos">-x * 1.21 * 1.21</span>');
    expect(html).toContain('<span class="mas">+x * 1.21 &lt; 2 &amp;&amp; y</span>');
  });

  it("los videos, relativos a .dolphin/videos, y el compilado primero", () => {
    expect(html).toContain('src="../videos/parte-1.webm"');
    expect(html).toContain('src="../videos/u2-pulgar-1792.webm"');
    expect(html.indexOf("parte-1.webm")).toBeLessThan(html.indexOf("u2-pulgar-1792.webm"));
    expect(html).toContain("u2 · pantalla · lo que vio pulgar");
  });

  it("no se le puede meter nada: la tarea viene escapada, y no pide nada de afuera", () => {
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; el redondeo");
    expect(html).not.toMatch(/(src|href)="https?:\/\//);
  });

  it("el título es la primera línea; lo que vio el agente además queda en «El pedido entero», escapado", () => {
    const enVivo = htmlDelParte({
      cosecha: { ...cosecha, tarea: "Hacé este botón amarillo\n\nEs sobre un elemento de la app que se tocó en la pantalla. Así estaba:\n- selector: <button>" },
      cuando: "2026-10-22T07:47:30.000Z",
      repo: "/r",
    });
    expect(enVivo).toContain("<title>Parte · Hacé este botón amarillo</title>");
    expect(enVivo).toContain("<h1>Hacé este botón amarillo</h1>");
    expect(enVivo).toContain(
      '<details class="pedido"><summary>El pedido entero</summary><p>Es sobre un elemento de la app que se tocó en la pantalla. Así estaba:\n- selector: &lt;button&gt;</p></details>',
    );
    // Una tarea de una línea no tiene nada que abrir.
    expect(html).not.toContain("El pedido entero");
  });

  it("una fase que no corrió se cuenta aparte: ni pasada ni cortada", () => {
    const sola: Candidato = {
      ...u1,
      pasadas: [
        pasada("test", true),
        { ...pasada("revisión", true), salteada: true, detalle: "revisión: el revisor no contestó en el formato pedido ni a la segunda, se salteó" },
      ],
    };
    const conSalteada = htmlDelParte({ cosecha: { ...cosecha, candidatos: [sola], ganador: sola }, cuando: "2026-10-22T08:00:00.000Z", repo: "/r" });
    expect(conSalteada).toContain("la rama pasó, pero se salteó revisión");
    expect(conSalteada).not.toContain("pasó todas las fases");
    expect(conSalteada).toContain("1 llegó · nadie se cortó · en 1 se salteó");
    expect(conSalteada).toContain('<li class="salteada"><b>u1</b> · sonnet — el revisor no contestó en el formato pedido ni a la segunda, se salteó</li>');
  });

  it("con suscripción no hay plata, y sin ganador lo dice", () => {
    const otro = htmlDelParte({
      cosecha: { ...cosecha, suscripcion: true, ganador: undefined as never, candidatos: [u2, u3] },
      cuando: "2026-10-21T22:00:00.000Z",
      repo: "x",
    });
    expect(otro).not.toContain("US$");
    expect(otro).toContain("Ninguna rama pasó");
  });
});

describe("escribir el parte", () => {
  let repo = "";
  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-parte-"));
  });
  afterEach(async () => {
    await borrarCarpeta(repo);
  });

  it("queda en .dolphin/partes con el nombre de cuándo terminó", async () => {
    const nombre = await escribirParte({ cosecha, cuando: "2026-10-21T22:00:00.000Z", repo });
    expect(nombre).toBe("2026-10-21T22-00-00-000Z.html");
    expect(await readFile(join(repo, ".dolphin", "partes", nombre), "utf8")).toContain("<h2>La escalera</h2>");
  });

  it("la consola lo sirve por su nombre, y nada más que eso", async () => {
    const nombre = await escribirParte({ cosecha, cuando: "2026-10-21T22:00:00.000Z", repo });
    const servidor = crearServidor({ repo, calendario: false });
    await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", listo));
    const base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
    try {
      const r = await fetch(`${base}/partes/${nombre}`);
      expect(r.status).toBe(200);
      expect(r.headers.get("content-type")).toContain("text/html");
      expect(await r.text()).toContain("La escalera");
      expect((await fetch(`${base}/partes/..%2F..%2Fpackage.json`)).status).toBe(404);
      expect((await fetch(`${base}/partes/no-esta.html`)).status).toBe(404);
    } finally {
      await new Promise((listo) => servidor.close(listo));
    }
  });
});
