import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { descartarRama, mergearRama } from "./nucleo/entrega.js";
import { carpetaDeDolphin, escribirDeUna } from "./nucleo/escritura.js";
import { guardarTareaDeLaNoche, type Noche, type TareaDeLaNoche } from "./noche.js";

/**
 * El parte de la mañana: lo que hizo la noche, una tarjeta por tarea —qué era, si pasó el portón, la
 * rama, los videos— y cómo decidir cada una sin abrir la compu: `/aprobar 2` la mergea, `/descartar 2`
 * la tira. Las mismas guardas que el botón de la consola (mergearRama): nada con cambios sin commitear
 * y, si choca, no se toca nada.
 */

const carpetaDeNoches = (repo: string) => join(repo, ".dolphin", "noches");

/** La última noche que corrió en este repo, o null. */
export async function ultimaNoche(repo: string): Promise<Noche | null> {
  const nombres = (await readdir(carpetaDeNoches(repo)).catch(() => [] as string[])).filter((n) => n.endsWith(".json"));
  const noches = await Promise.all(nombres.map(async (n) => JSON.parse(await readFile(join(carpetaDeNoches(repo), n), "utf8").catch(() => "null")) as Noche | null));
  return noches.filter((n): n is Noche => n !== null && typeof n.desde === "string").sort((a, b) => b.desde.localeCompare(a.desde))[0] ?? null;
}

const ESTADO: Readonly<Record<TareaDeLaNoche["estado"], string>> = {
  lista: "lista para revisar",
  "no-salio": "no salió",
  "sin-cupo": "se quedó sin cupo",
  "sin-tiempo": "no llegó",
};

function renglon(t: TareaDeLaNoche, n: number): string {
  if (t.decidida) return `${n}. ${t.titulo} · ${t.decidida.accion === "aprobada" ? "ya la mergeaste" : "ya la descartaste"}`;
  if (t.estado === "lista") return `${n}. ${t.titulo} · lista: ${t.rama}${t.videos?.length ? ` · ${t.videos.length} video(s)` : ""}${t.sinComprobar?.length ? `\n   sin comprobar: ${t.sinComprobar.join("; ")}` : ""}`;
  return `${n}. ${t.titulo} · ${ESTADO[t.estado]}: ${t.porQue.split("\n")[0]}`;
}

/** El parte en texto: lo que sale por Telegram y en la terminal. */
export function textoDelParte(noche: Noche): string {
  const listas = noche.tareas.filter((t) => t.estado === "lista");
  const pendientes = listas.filter((t) => !t.decidida);
  const gastado = noche.tareas.reduce((s, t) => s + t.gastado, 0);
  return [
    `Esta noche: ${listas.length} de ${noche.tareas.length} quedaron listas${gastado > 0 ? ` (US$ ${gastado.toFixed(2)})` : ""}.`,
    "",
    ...noche.tareas.map((t, i) => renglon(t, i + 1)),
    ...(pendientes.length > 0 ? ["", `Decidí cada una: /aprobar ${noche.tareas.indexOf(pendientes[0]!) + 1} la mergea, /descartar ${noche.tareas.indexOf(pendientes[0]!) + 1} la tira.`] : []),
  ].join("\n");
}

const html = (texto: string) => texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** El parte como página: una tarjeta por tarea, con sus videos. Se abre desde `.dolphin/noches/`. */
export function htmlDelParte(noche: Noche): string {
  const tarjetas = noche.tareas
    .map((t, i) => {
      const tono = t.decidida ? "hecha" : t.estado === "lista" ? "bien" : "mal";
      const videos = (t.videos ?? []).map((v) => `<video src="../videos/${encodeURIComponent(v)}" controls preload="metadata"></video>`).join("");
      const accion = t.estado === "lista" && !t.decidida ? `<p class="accion"><code>/aprobar ${i + 1}</code> la mergea · <code>/descartar ${i + 1}</code> la tira</p>` : "";
      const decidida = t.decidida ? `<p class="dato">${t.decidida.accion === "aprobada" ? "La mergeaste" : "La descartaste"}</p>` : "";
      return `<article class="tarjeta ${tono}">
  <p class="numero">${i + 1}</p>
  <h2>${html(t.titulo)}</h2>
  <p class="estado">${html(ESTADO[t.estado])}${t.esperas > 0 ? ` · esperó el cupo ${t.esperas} vez/veces` : ""}</p>
  ${t.rama ? `<p class="dato">Rama <code>${html(t.rama)}</code></p>` : ""}
  ${t.estado !== "lista" ? `<p class="dato">${html(t.porQue.split("\n")[0]!)}</p>` : ""}
  ${t.sinComprobar?.length ? `<p class="dato">Sin comprobar: ${t.sinComprobar.map(html).join("; ")}</p>` : ""}
  ${videos}${decidida}${accion}
</article>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Parte de la mañana</title>
<style>
:root { --fondo: #0a0a0a; --tarjeta: #171717; --box: #262626; --texto: #f5f5f5; --tenue: #a3a3a3; --bien: #7fd1a4; --mal: #f08a7e; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--fondo); color: var(--texto); font: 16px/1.5 system-ui, sans-serif; padding: 32px 16px; }
main { max-width: 760px; margin: 0 auto; display: grid; gap: 16px; }
h1 { font-size: 32px; line-height: 1.1; margin: 0 0 4px; }
.resumen { color: var(--tenue); margin: 0 0 16px; }
.tarjeta { background: var(--tarjeta); border-radius: 24px; padding: 24px; display: grid; gap: 8px; }
.numero { margin: 0; font-size: 13px; color: var(--tenue); }
h2 { margin: 0; font-size: 21px; line-height: 1.2; }
.estado { margin: 0; font-weight: 600; }
.bien .estado { color: var(--bien); } .mal .estado { color: var(--mal); } .hecha { opacity: .6; }
.dato, .accion { margin: 0; color: var(--tenue); font-size: 14px; }
code { background: var(--box); border-radius: 8px; padding: 2px 8px; font-size: 13px; color: var(--texto); }
video { width: 100%; border-radius: 16px; background: var(--box); margin-top: 8px; }
</style></head>
<body><main>
<h1>Lo que hizo la noche</h1>
<p class="resumen">${html(textoDelParte(noche).split("\n")[0]!)}</p>
${tarjetas}
</main></body></html>
`;
}

/** Escribe la página del parte junto a la noche y devuelve dónde quedó. */
export async function escribirParteDeLaManana(noche: Noche): Promise<string> {
  const carpeta = await carpetaDeDolphin(noche.repo, "noches");
  const ruta = join(carpeta, `${noche.id}.html`);
  await escribirDeUna(ruta, htmlDelParte(noche));
  return ruta;
}

/** Aprobar (mergear) o descartar la tarea `n` (desde 1) de la última noche. */
export async function decidirDeLaNoche(repo: string, n: number, accion: "aprobar" | "descartar"): Promise<{ ok: boolean; porQue: string }> {
  const noche = await ultimaNoche(repo);
  if (!noche) return { ok: false, porQue: "todavía no corrió ninguna noche en este repo" };
  const t = noche.tareas[n - 1];
  if (!t) return { ok: false, porQue: `la noche tuvo ${noche.tareas.length} tarea(s): no hay una ${n}` };
  if (t.decidida) return { ok: false, porQue: `la ${n} ya la ${t.decidida.accion === "aprobada" ? "mergeaste" : "descartaste"}` };
  if (t.estado !== "lista" || !t.rama || !t.commit || !t.base) return { ok: false, porQue: `la ${n} no dejó una rama lista (${ESTADO[t.estado]})` };
  const entregada = { rama: t.rama, commit: t.commit, base: t.base, ...(t.ramaBase ? { ramaBase: t.ramaBase } : {}) };
  if (accion === "aprobar") {
    const r = await mergearRama(repo, entregada, t.tarea, t.ruta);
    if (!r.ok) return { ok: false, porQue: r.porQue };
  } else {
    await descartarRama(repo, entregada, t.ruta);
  }
  t.decidida = { accion: accion === "aprobar" ? "aprobada" : "descartada", en: new Date().toISOString() };
  await guardarTareaDeLaNoche(noche, t);
  await escribirParteDeLaManana(noche).catch(() => "");
  return { ok: true, porQue: accion === "aprobar" ? `Mergeé «${t.titulo}» en ${t.ramaBase ?? "tu rama"}.` : `Descarté «${t.titulo}».` };
}
