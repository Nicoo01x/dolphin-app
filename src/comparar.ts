import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { descartarRama, mergearRama } from "./nucleo/entrega.js";
import { carpetaDeDolphin, escribirDeUna } from "./nucleo/escritura.js";
import { nuevoId } from "./nucleo/ids.js";
import type { Motor } from "./nucleo/router.js";
import type { Cosecha } from "./nucleo/tipos.js";
import { prepararSiembra, sembrarTarea, type PedidoDeTarea } from "./siembra.js";

/**
 * Elegir mirando: la misma tarea a varios motores a la vez (Claude, Codex, Antigravity), cada uno en
 * su rama y con el portón, y una página con las apps lado a lado —el video de cada una andando, si
 * pasó, cuánto tocó y cuánto costó—. Se elige viendo el resultado, no leyendo diffs; elegir una la
 * mergea y tira las otras.
 */

export interface Contendiente {
  readonly motor: string;
  estado: "lista" | "no-salio";
  porQue: string;
  gastado: number;
  rama?: string;
  ruta?: string;
  commit?: string;
  base?: string;
  ramaBase?: string;
  videos?: string[];
  archivos?: number;
  agregadas?: number;
  quitadas?: number;
}

export interface Comparacion {
  readonly id: string;
  readonly repo: string;
  readonly tarea: string;
  readonly creada: string;
  readonly contendientes: Contendiente[];
  /** El que elegiste (desde 1), cuando elegiste. */
  elegido?: { readonly n: number; readonly en: string };
}

export const MOTORES_POR_DEFECTO: readonly Motor[] = ["claude", "codex", "antigravity"];

async function sembrarDeVerdad(pedido: PedidoDeTarea): Promise<Cosecha> {
  const preparada = await prepararSiembra(pedido);
  return (await sembrarTarea(pedido, preparada, { reintentos: 1 })).cosecha;
}

function contendienteDe(motor: string, cosecha: Cosecha): Contendiente {
  const g = cosecha.ganador;
  if (!g) return { motor, estado: "no-salio", porQue: cosecha.porQueGano ?? cosecha.candidatos[0]?.porQue ?? "no pasó el portón", gastado: cosecha.gastado };
  const videos = g.pasadas.flatMap((p) => p.videos ?? []);
  return {
    motor,
    estado: "lista",
    porQue: cosecha.porQueGano ?? "pasó el portón",
    gastado: cosecha.gastado,
    rama: cosecha.entregada?.rama ?? g.universo.rama,
    ruta: g.universo.ruta,
    ...(cosecha.entregada ? { commit: cosecha.entregada.commit, base: cosecha.entregada.base, ...(cosecha.entregada.ramaBase ? { ramaBase: cosecha.entregada.ramaBase } : {}) } : {}),
    ...(videos.length > 0 ? { videos } : {}),
    ...(g.forma ? { archivos: g.forma.archivos, agregadas: g.forma.agregadas, quitadas: g.forma.quitadas } : {}),
  };
}

async function guardar(c: Comparacion): Promise<void> {
  const carpeta = await carpetaDeDolphin(c.repo, "comparar");
  await escribirDeUna(join(carpeta, `${c.id}.json`), `${JSON.stringify(c, null, 2)}\n`);
  await escribirDeUna(join(carpeta, `${c.id}.html`), htmlDeComparacion(c));
}

/** La misma tarea a cada motor, todos a la vez. Lo que falle en uno no frena a los otros. */
export async function comparar(
  pedido: { repo: string; tarea: string; motores: readonly Motor[]; verificar?: readonly string[] },
  deps: { sembrar?: (pedido: PedidoDeTarea) => Promise<Cosecha>; ahora?: () => Date } = {},
): Promise<Comparacion> {
  const sembrar = deps.sembrar ?? sembrarDeVerdad;
  const ahora = deps.ahora ?? (() => new Date());
  const contendientes = await Promise.all(
    pedido.motores.map(async (motor) => {
      try {
        const cosecha = await sembrar({ repo: pedido.repo, tarea: pedido.tarea, agente: motor, automatico: true, ...(pedido.verificar ? { verificar: pedido.verificar } : {}) });
        return contendienteDe(motor, cosecha);
      } catch (error) {
        return { motor, estado: "no-salio" as const, porQue: error instanceof Error ? error.message.split("\n")[0]! : String(error), gastado: 0 };
      }
    }),
  );
  const c: Comparacion = { id: nuevoId("c", ahora().getTime()), repo: pedido.repo, tarea: pedido.tarea, creada: ahora().toISOString(), contendientes };
  await guardar(c);
  return c;
}

export async function ultimaComparacion(repo: string): Promise<Comparacion | null> {
  const carpeta = join(repo, ".dolphin", "comparar");
  const nombres = (await readdir(carpeta).catch(() => [] as string[])).filter((n) => n.endsWith(".json"));
  const todas = await Promise.all(nombres.map(async (n) => JSON.parse(await readFile(join(carpeta, n), "utf8").catch(() => "null")) as Comparacion | null));
  return todas.filter((c): c is Comparacion => c !== null && typeof c.creada === "string").sort((a, b) => b.creada.localeCompare(a.creada))[0] ?? null;
}

/** En texto, para la terminal y Telegram: una línea por motor y cómo elegir. */
export function textoDeComparacion(c: Comparacion): string {
  const lineas = c.contendientes.map((x, i) => {
    const elegido = c.elegido?.n === i + 1 ? " ← la elegiste" : "";
    if (x.estado !== "lista") return `${i + 1}. ${x.motor} · no salió: ${x.porQue.split("\n")[0]}`;
    const toco = x.archivos !== undefined ? ` · ${x.archivos} archivo(s), +${x.agregadas ?? 0} −${x.quitadas ?? 0}` : "";
    return `${i + 1}. ${x.motor} · pasó el portón${toco}${x.videos?.length ? " · con video" : ""}${x.gastado > 0 ? ` · US$ ${x.gastado.toFixed(2)}` : ""}${elegido}`;
  });
  const listas = c.contendientes.filter((x) => x.estado === "lista").length;
  return [`«${c.tarea}» con ${c.contendientes.length} motores: ${listas} pasaron el portón.`, "", ...lineas, ...(listas > 0 && !c.elegido ? ["", "Mirá las apps lado a lado en la página y elegí: /elegir 2 mergea esa y tira las otras."] : [])].join("\n");
}

const html = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** La página lado a lado: una columna por motor, con el video de su app andando arriba de todo. */
export function htmlDeComparacion(c: Comparacion): string {
  const columnas = c.contendientes
    .map((x, i) => {
      const video = x.videos?.find((v) => v.includes("-anda-")) ?? x.videos?.[0];
      const toco = x.archivos !== undefined ? `<p class="dato">${x.archivos} archivo(s) · <span class="mas">+${x.agregadas ?? 0}</span> <span class="menos">−${x.quitadas ?? 0}</span></p>` : "";
      return `<section class="columna ${x.estado === "lista" ? "bien" : "mal"}${c.elegido?.n === i + 1 ? " elegida" : ""}">
  <p class="numero">${i + 1}</p>
  <h2>${html(x.motor)}</h2>
  ${video ? `<video src="../videos/${encodeURIComponent(video)}" controls muted autoplay loop preload="metadata"></video>` : `<div class="sin-video">${x.estado === "lista" ? "Sin video: configurá pantalla en dolphin.config.json" : "No llegó a la pantalla"}</div>`}
  <p class="estado">${x.estado === "lista" ? "Pasó el portón" : html(`No salió: ${x.porQue.split("\n")[0]}`)}</p>
  ${toco}
  ${x.gastado > 0 ? `<p class="dato">US$ ${x.gastado.toFixed(2)}</p>` : ""}
  ${x.estado === "lista" && !c.elegido ? `<p class="accion"><code>/elegir ${i + 1}</code></p>` : ""}
  ${c.elegido?.n === i + 1 ? `<p class="accion">La elegiste</p>` : ""}
</section>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Elegir mirando</title>
<style>
:root { --fondo: #0a0a0a; --tarjeta: #171717; --box: #262626; --texto: #f5f5f5; --tenue: #a3a3a3; --bien: #7fd1a4; --mal: #f08a7e; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--fondo); color: var(--texto); font: 16px/1.5 system-ui, sans-serif; padding: 32px 16px; }
main { max-width: 1280px; margin: 0 auto; }
h1 { font-size: 32px; line-height: 1.1; margin: 0 0 8px; }
.tarea { color: var(--tenue); margin: 0 0 24px; }
.lado { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
.columna { background: var(--tarjeta); border-radius: 24px; padding: 16px; display: grid; gap: 8px; align-content: start; }
.elegida { outline: 2px solid var(--bien); }
.numero { margin: 0; font-size: 13px; color: var(--tenue); }
h2 { margin: 0; font-size: 21px; }
video, .sin-video { width: 100%; aspect-ratio: 16 / 10; border-radius: 16px; background: var(--box); }
.sin-video { display: grid; place-items: center; color: var(--tenue); font-size: 14px; padding: 16px; text-align: center; }
.estado { margin: 0; font-weight: 600; } .bien .estado { color: var(--bien); } .mal .estado { color: var(--mal); }
.dato, .accion { margin: 0; color: var(--tenue); font-size: 14px; }
.mas { color: var(--bien); } .menos { color: var(--mal); }
code { background: var(--box); border-radius: 8px; padding: 2px 8px; color: var(--texto); }
</style></head>
<body><main>
<h1>Elegí mirando</h1>
<p class="tarea">${html(c.tarea)}</p>
<div class="lado">
${columnas}
</div>
</main></body></html>
`;
}

/** Elegir la `n` (desde 1) de la última comparación: se mergea esa y se tiran las otras que salieron. */
export async function elegir(repo: string, n: number): Promise<{ ok: boolean; porQue: string }> {
  const c = await ultimaComparacion(repo);
  if (!c) return { ok: false, porQue: "todavía no comparaste nada en este repo: /comparar <tarea>" };
  if (c.elegido) return { ok: false, porQue: `ya elegiste la ${c.elegido.n}` };
  const x = c.contendientes[n - 1];
  if (!x) return { ok: false, porQue: `hubo ${c.contendientes.length} motores: no hay un ${n}` };
  if (x.estado !== "lista" || !x.rama || !x.commit || !x.base) return { ok: false, porQue: `${x.motor} no dejó una rama lista` };
  const r = await mergearRama(repo, { rama: x.rama, commit: x.commit, base: x.base, ...(x.ramaBase ? { ramaBase: x.ramaBase } : {}) }, c.tarea, x.ruta);
  if (!r.ok) return { ok: false, porQue: r.porQue };
  for (const [i, otro] of c.contendientes.entries()) {
    if (i === n - 1 || otro.estado !== "lista" || !otro.rama || !otro.commit || !otro.base) continue;
    await descartarRama(repo, { rama: otro.rama, commit: otro.commit, base: otro.base }, otro.ruta).catch(() => {});
  }
  c.elegido = { n, en: new Date().toISOString() };
  await guardar(c);
  return { ok: true, porQue: `Mergeé la de ${x.motor} y tiré las otras.` };
}
