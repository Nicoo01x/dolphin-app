import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { crearServidor } from "../src/servidor.js";
import { crearTarjeta } from "../src/nucleo/tarjetas.js";

/**
 * La API de la consola, contra su documentación (docs/api.md).
 *
 * Una API sin documentar no es una API: nadie puede construir encima de algo que hay que deducir
 * leyendo el servidor. Y una documentación que no se verifica miente a los dos meses. Este test
 * levanta la consola de verdad y pide cada ruta documentada; si una desapareció, cambió de método
 * o dejó de contestar, falla. Y al revés: si el servidor gana una ruta que el documento no tiene,
 * también.
 *
 * Cómo se distingue «esta ruta existe» de «no existe» sin ejecutar nada: una ruta atendida siempre
 * contesta JSON (aunque sea un 400 o un 403 por el pase), y una desconocida cae en el 404 final,
 * que es texto plano. Y a los POST se les manda el pedido SIN el pase a propósito: si la ruta
 * existe contesta 403 pidiéndolo, y así se prueba que está sin correr lo que hace.
 */

/** Una ruta como la documenta la tabla: `| \`GET /api/x\` | qué hace |`. */
interface RutaDocumentada {
  readonly metodos: readonly string[];
  readonly ruta: string;
}

function rutasDelDocumento(markdown: string): RutaDocumentada[] {
  const rutas: RutaDocumentada[] = [];
  for (const linea of markdown.split("\n")) {
    const m = /^\|\s*`((?:GET|POST|PUT|DELETE|PATCH)(?:\/(?:GET|POST|PUT|DELETE|PATCH))*)\s+(\/[^`]+)`\s*\|/.exec(linea);
    if (m) rutas.push({ metodos: m[1]!.split("/"), ruta: m[2]!.trim() });
  }
  return rutas;
}

/** Los `<id>` y `<nombre>` del documento, con algo real de este repo. */
const conPartes = (ruta: string, id: string) =>
  ruta
    .replace("<idRutina>", "r1")
    .replace("<nombre>", "Read")
    .replace("<id>", id);

/** Lo que cada GET necesita para no contestar por falta de parámetros, y no por no existir. */
const PARAMETROS: Record<string, string> = {
  "/api/diff": "?id=no-hay&u=u1",
  "/api/rendimiento": "?tipo=feature",
  "/api/proyectos/logo": "?id=no-hay",
};

describe("la API de la consola está documentada y anda", () => {
  let repo = "";
  let base = "";
  let tarjeta = "";
  let servidor: ReturnType<typeof crearServidor>;
  let documento = "";

  beforeAll(async () => {
    documento = await readFile(new URL("../docs/api.md", import.meta.url), "utf8");
    repo = await mkdtemp(join(tmpdir(), "dolphin-api-doc-"));
    tarjeta = (await crearTarjeta(repo, { titulo: "una tarjeta para pedirle la rama" })).id;
    servidor = crearServidor({ repo, calendario: false, demo: true });
    await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", listo));
    base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
  });

  afterAll(async () => {
    if (servidor) await new Promise((listo) => servidor.close(listo));
    if (repo) await borrarCarpeta(repo);
  });

  it("el documento tiene las rutas de verdad, no un par de ejemplo", () => {
    const rutas = rutasDelDocumento(documento);
    expect(rutas.length).toBeGreaterThan(30);
    expect(rutas.map((r) => r.ruta)).toContain("/api/tablero");
    expect(rutas.map((r) => r.ruta)).toContain("/api/bots/<id>/hablar");
  });

  it("cada ruta documentada existe: la consola la atiende con ese método", async () => {
    const sinAtender: string[] = [];
    for (const { metodos, ruta } of rutasDelDocumento(documento)) {
      for (const metodo of metodos) {
        const url = `${base}${conPartes(ruta, tarjeta)}${metodo === "GET" ? (PARAMETROS[ruta] ?? "") : ""}`;
        // Sin el pase a propósito: lo que cambia algo contesta 403 y no llega a hacer nada.
        const r = await fetch(url, { method: metodo, ...(metodo === "GET" ? {} : { body: "{}" }) });
        const tipo = r.headers.get("content-type") ?? "";
        // Una ruta que no existe cae en el 404 final, que es texto plano; una atendida es JSON.
        if (!tipo.includes("application/json")) sinAtender.push(`${metodo} ${ruta} → ${r.status} ${tipo || "sin tipo"}`);
        // 405 es «esa ruta existe pero no con ese método»: el documento dice mal el método.
        if (r.status === 405) sinAtender.push(`${metodo} ${ruta} → 405, no acepta ese método`);
      }
    }
    expect(sinAtender).toEqual([]);
  });

  it("lo que cambia algo pide el pase, y lo que solo lee no", async () => {
    const sinPase = await fetch(`${base}/api/tablero`, { method: "POST", body: JSON.stringify({ titulo: "sin pase" }) });
    expect(sinPase.status).toBe(403);
    expect((await sinPase.json()).porQue).toContain("pase");
    expect((await fetch(`${base}/api/tablero`)).status).toBe(200);
  });

  it("una ruta que no existe no se confunde con una documentada", async () => {
    const r = await fetch(`${base}/api/no-existe-ninguna`);
    expect(r.status).toBe(404);
    expect(r.headers.get("content-type") ?? "").not.toContain("application/json");
  });

  it("el canal en vivo contesta como SSE y avisa que está conectado", async () => {
    const corte = new AbortController();
    const r = await fetch(`${base}/en-vivo`, { signal: corte.signal });
    expect(r.headers.get("content-type")).toContain("text/event-stream");
    const lector = r.body!.getReader();
    const primero = new TextDecoder().decode((await lector.read()).value);
    expect(primero).toContain("conectado");
    corte.abort();
  });

  it("toda ruta /api que atiende el servidor está en el documento", async () => {
    const documentadas = new Set(rutasDelDocumento(documento).map((r) => r.ruta));
    const carpeta = new URL("../src/", import.meta.url);
    const archivos = ["servidor.ts", "servidor-bots.ts", "servidor-tablero.ts", "servidor-plan.ts", "servidor-git.ts", "servidor-master-prompt.ts", "servidor-tarjeta-equipo.ts", "servidor-tarjeta-rama.ts"];
    const sinDocumentar: string[] = [];
    for (const nombre of archivos) {
      const codigo = await readFile(new URL(nombre, carpeta), "utf8");
      // Las que el servidor compara literalmente: `ruta === "/api/x"`.
      for (const m of codigo.matchAll(/ruta === "(\/api\/[^"]+)"/g)) {
        if (!documentadas.has(m[1]!)) sinDocumentar.push(`${m[1]} (${nombre})`);
      }
      // Las de la forma `/^\/api\/x\/([^/]+)\/(a|b|c)$/`: una por acción.
      for (const m of codigo.matchAll(/\/\^\\\/api\\\/([a-z-]+)\\\/\(\[\^\/\]\+\)\\\/\(([a-z|-]+)\)\$\//g)) {
        for (const accion of m[2]!.split("|")) {
          if (!documentadas.has(`/api/${m[1]}/<id>/${accion}`)) sinDocumentar.push(`/api/${m[1]}/<id>/${accion} (${nombre})`);
        }
      }
    }
    expect([...new Set(sinDocumentar)]).toEqual([]);
  });
});
