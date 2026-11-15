import { execFile } from "node:child_process";
import { stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { resolverEjecutable } from "../agentes/ejecutar.js";
import { restoDeTarea, tituloDeTarea } from "./entrega.js";
import { decirSalteadas, fasesSalteadas, sinFase } from "./porton.js";
import type { Candidato, Correccion, Cosecha, Tokens } from "./tipos.js";
import { carpetaDeDolphin } from "./escritura.js";

/**
 * El parte de una siembra: lo que pasó, en una página que se abre sola.
 *
 * Cifras arriba (cuántas ramas, cuántas pasaron, cuánto tardó, quién
 * escribió y quién revisó), la escalera de dónde se cortó cada una y por
 * qué, la elegida con su diff, y los fallos en video —y, si hay ffmpeg, un
 * compilado de un minuto con solo los momentos que fallaron—. Es un HTML
 * sin nada de afuera: se abre desde el disco, se manda por chat, se mira
 * desde la consola. Vive en `.dolphin/partes/`.
 */

export interface Escalon {
  readonly fase: string;
  readonly entraron: number;
  readonly murieron: readonly { readonly rama: string; readonly modelo?: string; readonly porQue: string }[];
  /** Las que rebotaron acá y pasaron después de corregir: el bucle andando, con cada vuelta del agente. */
  readonly corregidas: readonly { readonly rama: string; readonly modelo?: string; readonly porQue: string; readonly vueltas?: readonly Correccion[] }[];
  /** Las que una corrección de otra fase rompió acá, y se volvió atrás (ver puntos.ts). */
  readonly deshechas: readonly { readonly rama: string; readonly modelo?: string; readonly porQue: string }[];
  /** Las que pasaron sin que la fase corriera (faltaba Chrome, el revisor no contestó): no son pasadas. */
  readonly salteadas: readonly { readonly rama: string; readonly modelo?: string; readonly porQue: string }[];
}

/**
 * La escalera: cada fase con cuántas ramas llegaron y cuáles se cortaron
 * ahí. Lo que se cayó antes de llegar al portón (escribiendo, o sin poder
 * abrir el worktree) es el primer escalón.
 */
export function escaleraDe(cosecha: Pick<Cosecha, "candidatos">): Escalon[] {
  const fases: string[] = [];
  for (const c of cosecha.candidatos) for (const p of c.pasadas) if (!fases.includes(p.verificador)) fases.push(p.verificador);

  const muerte = (c: Candidato) => ({ rama: c.universo.id, ...(c.modelo ? { modelo: c.modelo } : {}), porQue: c.porQue ?? "" });
  const antes = cosecha.candidatos.filter((c) => !c.vivo && c.murioEn !== undefined && !fases.includes(c.murioEn));

  // Rebotó en esta fase (la primera vuelta falló) y al final la pasó.
  const corrigio = (c: Candidato, fase: string) => {
    const vueltas = c.pasadas.filter((p) => p.verificador === fase);
    return vueltas.length > 1 && vueltas[0]?.paso === false && vueltas[vueltas.length - 1]?.paso === true;
  };
  const correccion = (c: Candidato, fase: string) => ({
    rama: c.universo.id,
    ...(c.modelo ? { modelo: c.modelo } : {}),
    porQue: c.pasadas.find((p) => p.verificador === fase && !p.paso)?.detalle ?? "",
    ...((c.correcciones ?? []).some((v) => v.fase === fase) ? { vueltas: (c.correcciones ?? []).filter((v) => v.fase === fase) } : {}),
  });

  // Una corrección de otra fase la rompió acá y se volvió a la foto de antes.
  const deshechas = (fase: string) =>
    cosecha.candidatos.flatMap((c) =>
      c.pasadas
        // Las que rompió una corrección (rotaPor): el verde que trajo esa corrección también queda deshecho, pero no es una rotura.
        .filter((p) => p.verificador === fase && p.deshecha && p.rotaPor !== undefined)
        .map((p) => ({
          rama: c.universo.id,
          ...(c.modelo ? { modelo: c.modelo } : {}),
          porQue: `la corrección de «${p.rotaPor ?? "otra fase"}» lo rompió y se volvió atrás`,
        })),
    );

  // Pasó sin que la fase corriera: su última vuelta se salteó.
  const salteadas = (fase: string) =>
    cosecha.candidatos
      .filter((c) => c.vivo && fasesSalteadas(c).includes(fase))
      .map((c) => ({
        rama: c.universo.id,
        ...(c.modelo ? { modelo: c.modelo } : {}),
        porQue: c.pasadas.findLast((p) => p.verificador === fase)?.detalle ?? "",
      }));

  const escalera: Escalon[] = [];
  if (antes.length > 0)
    escalera.push({ fase: "escribiendo", entraron: cosecha.candidatos.length, murieron: antes.map(muerte), corregidas: [], deshechas: [], salteadas: [] });
  for (const fase of fases) {
    escalera.push({
      fase,
      entraron: cosecha.candidatos.filter((c) => c.pasadas.some((p) => p.verificador === fase)).length,
      murieron: cosecha.candidatos.filter((c) => !c.vivo && c.murioEn === fase).map(muerte),
      corregidas: cosecha.candidatos.filter((c) => corrigio(c, fase)).map((c) => correccion(c, fase)),
      deshechas: deshechas(fase),
      salteadas: salteadas(fase),
    });
  }
  return escalera;
}

export interface DatosDelParte {
  readonly cosecha: Cosecha;
  /** Cuándo terminó, ISO. */
  readonly cuando: string;
  readonly repo: string;
  /** El diff de la elegida, si su worktree sigue en disco. */
  readonly diff?: string;
  /** El compilado de los fallos, en `.dolphin/videos/`. */
  readonly compilado?: string;
}

const TOPE_DEL_DIFF = 400;

export function htmlDelParte(d: DatosDelParte): string {
  const c = d.cosecha;
  const vivos = c.candidatos.filter((x) => x.vivo).length;
  const fecha = new Date(d.cuando).toLocaleString("es-AR", { dateStyle: "long", timeStyle: "short", hourCycle: "h23" });
  const repoNombre = d.repo.split(/[\\/]/).filter(Boolean).pop() ?? d.repo;
  const cifras = [
    c.candidatos.length === 0
      ? "no se abrió ninguna rama"
      : c.candidatos.length === 1
        ? vivos === 1
          ? fasesSalteadas(c.candidatos[0]!).length > 0
            ? `la rama pasó, pero ${decirSalteadas(fasesSalteadas(c.candidatos[0]!))}`
            : "la rama pasó todas las fases"
          : `la rama se cortó en ${c.candidatos[0]?.murioEn ?? "el testing"}`
        : `${vivos} de ${c.candidatos.length} ramas pasaron todas las fases`,
    ...(c.candidatos.length > 1 && c.muertosGratis > 0 ? [`${c.muertosGratis} se cortaron gratis`] : []),
    `tardó ${reloj(c.ms)}`,
    ...(c.suscripcion ? [] : [costoEnPalabras(c.gastado, c.costoDesconocido)]),
  ];
  const modelos = c.modelos
    ? [
        // Codex y Antigravity no reciben modelo del reparto: el nombre lo dice la rama.
        `Escribió ${c.modelos.escribir ?? c.candidatos.find((x) => x.modelo)?.modelo ?? "el modelo por defecto"}`,
        ...(c.modelos.corregir && c.modelos.corregir !== c.modelos.escribir ? [`corrigió ${c.modelos.corregir}`] : []),
        c.modelos.revisar ? `revisó ${c.modelos.revisar}` : "sin revisión con modelo",
        `estrategia ${c.modelos.estrategia === "economia" ? "economía" : c.modelos.estrategia}`,
      ].join(" · ")
    : "";

  const escalera = escaleraDe(c);
  const videos = c.candidatos.flatMap((x) => x.pasadas.flatMap((p) => (p.videos ?? []).map((v) => ({ video: v, rama: x.universo.id, fase: p.verificador }))));
  const g = c.ganador;
  const titulo = tituloDeTarea(c.tarea);
  // Lo que vio el agente además del pedido (el elemento que tocaste, los asuntos de la bandeja): cerrado, a mano.
  const resto = restoDeTarea(c.tarea);

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Parte · ${esc(recortar(titulo, 60))}</title>
<style>
  :root { --fondo:#0a0a0a; --tarjeta:#171717; --linea:#ffffff14; --texto:#fafafa; --suave:#a1a1a1; --paso:#5fb07c; --murio:#e5776d; --corrige:#d4a300; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--fondo); color:var(--texto); font: 15px/1.55 Inter, system-ui, -apple-system, "Segoe UI", sans-serif; -webkit-font-smoothing:antialiased; }
  main { max-width: 880px; margin: 0 auto; padding: 40px 20px 64px; }
  h1, h2 { font-family: Satoshi, Inter, system-ui, sans-serif; letter-spacing: -0.02em; }
  h1 { font-size: 28px; line-height: 1.2; margin: 6px 0 12px; overflow-wrap: anywhere; }
  h2 { font-size: 18px; margin: 40px 0 14px; }
  .sello { color: var(--suave); font-size: 13px; margin: 0; }
  .cifras { margin: 0; font-size: 15px; }
  .cifras b { font-weight: 600; }
  .modelos { color: var(--suave); font-size: 13px; margin: 6px 0 0; }
  .pedido { color: var(--suave); font-size: 13px; margin: -4px 0 14px; }
  .pedido summary { cursor: pointer; width: max-content; }
  .pedido p { color: #d4d4d4; white-space: pre-wrap; overflow-wrap: anywhere; margin: 8px 0 0; }
  .escalon { background: var(--tarjeta); border-radius: 14px; padding: 14px 16px; margin-bottom: 8px; }
  .escalon header { display:flex; justify-content:space-between; gap:12px; font-size:14px; }
  .escalon header b { font-weight: 600; }
  .escalon header span { color: var(--suave); }
  .barra { display:flex; height:6px; border-radius:99px; overflow:hidden; background:#262626; margin-top:10px; }
  .barra .pasan { background: var(--paso); } .barra .mueren { background: var(--murio); } .barra .corregidas { background: var(--corrige); }
  .barra .salteadas { background: #5a5a5a; }
  .muertes { list-style:none; margin:10px 0 0; padding:0; font-size:13px; }
  .muertes li { padding: 4px 0; color: #d4d4d4; overflow-wrap:anywhere; }
  .muertes .murio b { color: var(--murio); font-weight: 600; }
  .muertes .corregida b { color: var(--corrige); font-weight: 600; }
  .muertes .deshecha { color: var(--suave); } .muertes .deshecha b { color: var(--suave); font-weight: 600; }
  .muertes .salteada { color: var(--suave); } .muertes .salteada b { color: var(--texto); font-weight: 600; }
  .muertes em { color: var(--paso); font-style: normal; }
  .muertes .vuelta { color: var(--suave); }
  .elegida { background: var(--tarjeta); border-radius: 14px; padding: 16px; }
  .elegida dl { display:grid; grid-template-columns: max-content 1fr; gap: 6px 16px; margin: 0; font-size: 14px; }
  .elegida dt { color: var(--suave); } .elegida dd { margin: 0; overflow-wrap:anywhere; }
  pre.diff { background: #0f0f0f; border-radius: 12px; padding: 14px; overflow-x: auto; font: 12.5px/1.6 ui-monospace, "Cascadia Code", Menlo, monospace; margin: 14px 0 0; }
  pre.diff { color: #8a8a8a; }
  pre.diff .mas { color: var(--paso); } pre.diff .menos { color: var(--murio); } pre.diff .trozo { color: #6ab0ff; } pre.diff .cabeza { color: #6f6f6f; }
  .nadie { color: var(--suave); }
  .videos { display:grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
  figure { margin:0; background: var(--tarjeta); border-radius: 14px; padding: 10px; }
  figure.grande { grid-column: 1 / -1; }
  video { width:100%; border-radius: 10px; background:#000; display:block; }
  figcaption { color: var(--suave); font-size: 12px; margin-top: 8px; }
  footer { color: var(--suave); font-size: 12px; margin-top: 48px; }
</style>
</head>
<body>
<main>
<header>
  <p class="sello">Parte de dolphin · ${esc(fecha)} · ${esc(repoNombre)}</p>
  <h1>${esc(titulo)}</h1>
  ${resto ? `<details class="pedido"><summary>El pedido entero</summary><p>${esc(resto)}</p></details>` : ""}
  <p class="cifras">${cifras.map((x) => esc(x)).join(" · ")}</p>
  ${modelos ? `<p class="modelos">${esc(modelos)}</p>` : ""}
  ${c.costoDesconocido && !c.suscripcion ? `<p class="modelos">Codex y Antigravity no informan cuánto cuesta lo que escriben: lo que no informaron no está en la cuenta.</p>` : ""}
</header>

<section>
  <h2>La escalera</h2>
  ${
    escalera.length === 0
      ? `<p class="nadie">No hubo fases: ninguna rama se probó.</p>`
      : escalera
          .map((e) => {
            const derecho = Math.max(e.entraron - e.murieron.length - e.corregidas.length - e.salteadas.length, 0);
            const total = Math.max(e.entraron, 1);
            const partes = [
              `${e.entraron} ${e.entraron === 1 ? "llegó" : "llegaron"}`,
              e.murieron.length === 0 ? "nadie se cortó" : `${e.murieron.length} ${e.murieron.length === 1 ? "se cortó" : "se cortaron"}`,
              ...(e.corregidas.length > 0 ? [`${e.corregidas.length} ${e.corregidas.length === 1 ? "pasó" : "pasaron"} tras corregir`] : []),
              ...(e.deshechas.length > 0
                ? [`${e.deshechas.length} ${e.deshechas.length === 1 ? "corrección deshecha" : "correcciones deshechas"}`]
                : []),
              ...(e.salteadas.length > 0 ? [`en ${e.salteadas.length} se salteó`] : []),
            ];
            const fila = (m: { rama: string; modelo?: string; porQue: string; vueltas?: readonly Correccion[] }, clase: string, cola = "") =>
              `<li class="${clase}"><b>${esc(m.rama)}</b>${m.modelo ? ` · ${esc(m.modelo)}` : ""} — ${esc(sinFase(m.porQue, e.fase))}${cola}${
                m.vueltas ? ` <span class="vuelta">(${esc(comoCorrigio(m.vueltas, !c.suscripcion))})</span>` : ""
              }</li>`;
            return `<div class="escalon">
    <header><b>${esc(e.fase)}</b><span>${esc(partes.join(" · "))}</span></header>
    <div class="barra" role="img" aria-label="${esc(partes.join(", "))}"><span class="pasan" style="width:${(derecho / total) * 100}%"></span><span class="corregidas" style="width:${(e.corregidas.length / total) * 100}%"></span><span class="salteadas" style="width:${(e.salteadas.length / total) * 100}%"></span><span class="mueren" style="width:${(e.murieron.length / total) * 100}%"></span></div>
    ${
      e.murieron.length + e.corregidas.length + e.deshechas.length + e.salteadas.length > 0
        ? `<ul class="muertes">${[
            ...e.murieron.map((m) => fila(m, "murio")),
            ...e.corregidas.map((m) => fila(m, "corregida", " <em>→ se corrigió y pasó</em>")),
            ...e.deshechas.map((m) => fila(m, "deshecha")),
            ...e.salteadas.map((m) => fila(m, "salteada")),
          ].join("")}</ul>`
        : ""
    }
  </div>`;
          })
          .join("\n  ")
  }
</section>

<section>
  <h2>${g ? "La elegida" : "Ninguna rama pasó"}</h2>
  ${
    g
      ? `<div class="elegida"><dl>
    <dt>rama</dt><dd>${esc(c.entregada?.rama ?? g.universo.rama)}</dd>
    ${g.modelo ? `<dt>escribió</dt><dd>${esc(g.modelo)}</dd>` : ""}
    ${g.enfoque ? `<dt>enfoque</dt><dd>${esc(g.enfoque)}</dd>` : ""}
    ${g.contrato?.resumen ? `<dt>qué cambia</dt><dd>${esc(g.contrato.resumen)}</dd>` : ""}
    ${c.porQueGano ? `<dt>por qué ella</dt><dd>${esc(c.porQueGano)}</dd>` : ""}
    ${g.correcciones && g.correcciones.length > 0 ? `<dt>el agente</dt><dd>${esc(cuentaDelAgente(g, !c.suscripcion))}</dd>` : ""}
    ${g.tokens ? `<dt>tokens</dt><dd>${esc(tokensEnPalabras(g.tokens))}</dd>` : ""}
    ${g.forma ? `<dt>tamaño</dt><dd>${g.forma.archivos} ${g.forma.archivos === 1 ? "archivo" : "archivos"} · +${g.forma.agregadas} −${g.forma.quitadas}</dd>` : ""}
    ${c.entregada ? `<dt>entregada</dt><dd>commit ${esc(c.entregada.commit.slice(0, 7))}, lista para mergear en ${esc(c.entregada.ramaBase ?? "la rama principal")}</dd>` : ""}
  </dl>
  ${d.diff ? `<pre class="diff">${diffEnHtml(d.diff)}</pre>` : `<p class="nadie">El código no está en disco: el worktree ya se limpió.</p>`}
  </div>`
      : `<p class="nadie">Todas se cortaron antes del final: la escalera dice dónde y por qué. La tarea se puede volver a sembrar con más ramas o con otra estrategia.</p>`
  }
</section>

${
  videos.length > 0
    ? `<section>
  <h2>Los fallos, en video</h2>
  <div class="videos">
    ${
      d.compilado
        ? `<figure class="grande"><video src="../videos/${encodeURIComponent(d.compilado)}" poster="../videos/${encodeURIComponent((videos[0]?.video ?? "").replace(/\.webm$/, ".png"))}" controls preload="metadata"></video><figcaption>Todos los fallos en un minuto: los últimos segundos de cada grabación, con el problema marcado.</figcaption></figure>`
        : ""
    }
    ${videos
      .map(
        (v) =>
          `<figure><video src="../videos/${encodeURIComponent(v.video)}" poster="../videos/${encodeURIComponent(v.video.replace(/\.webm$/, ".png"))}" controls preload="metadata"></video><figcaption>${esc(v.rama)} · ${esc(v.fase)} · ${esc(quienLoVio(v.video))}</figcaption></figure>`,
      )
      .join("\n    ")}
  </div>
</section>`
    : ""
}

<footer>Generado por dolphin. La cosecha completa está en .dolphin/cosechas/ y se mira en la consola.</footer>
</main>
</body>
</html>
`;
}

/** Escribe el parte en `.dolphin/partes/` y devuelve el nombre del archivo. */
export async function escribirParte(datos: DatosDelParte): Promise<string> {
  const carpeta = await carpetaDeDolphin(datos.repo, "partes");
  const nombre = `${datos.cuando.replace(/[:.]/g, "-")}.html`;
  await writeFile(join(carpeta, nombre), htmlDelParte(datos), "utf8");
  return nombre;
}

const correr = promisify(execFile);

/**
 * Los fallos en un minuto: los últimos 6 s de cada video (es donde la
 * persona midió y encontró el problema), uno atrás del otro, a 1280×720.
 * Hasta diez: más que eso no es un resumen. Sin ffmpeg, o si falla, no hay
 * compilado y quedan los videos sueltos: nunca frena el parte.
 */
export async function compilarFallos(carpetaVideos: string, videos: readonly string[], nombre: string): Promise<string | undefined> {
  const ffmpeg = resolverEjecutable("ffmpeg");
  const clips = videos.slice(0, 10);
  if (!ffmpeg || clips.length === 0) return undefined;

  const filtro = [
    ...clips.map(
      (_, i) => `[${i}:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x0a0a0a,setsar=1,fps=25[c${i}]`,
    ),
    `${clips.map((_, i) => `[c${i}]`).join("")}concat=n=${clips.length}:v=1:a=0[v]`,
  ].join(";");
  const destino = join(carpetaVideos, nombre);
  try {
    await correr(
      ffmpeg,
      [
        "-y",
        "-loglevel",
        "error",
        ...clips.flatMap((v) => ["-sseof", "-6", "-i", join(carpetaVideos, v)]),
        "-filter_complex",
        filtro,
        "-map",
        "[v]",
        "-an",
        "-c:v",
        "libvpx",
        "-deadline",
        "realtime",
        "-cpu-used",
        "8",
        "-b:v",
        "1M",
        destino,
      ],
      { windowsHide: true, timeout: 120_000 },
    );
    return (await stat(destino)).size > 0 ? nombre : undefined;
  } catch {
    return undefined;
  }
}

function diffEnHtml(diff: string): string {
  const lineas = diff.split("\n");
  const visibles = lineas.slice(0, TOPE_DEL_DIFF).map((l) => {
    const clase = l.startsWith("+++") || l.startsWith("---") || l.startsWith("diff ") || l.startsWith("index ")
      ? "cabeza"
      : l.startsWith("@@")
        ? "trozo"
        : l.startsWith("+")
          ? "mas"
          : l.startsWith("-")
            ? "menos"
            : "";
    return clase ? `<span class="${clase}">${esc(l)}</span>` : esc(l);
  });
  if (lineas.length > TOPE_DEL_DIFF) visibles.push(`<span class="cabeza">… y ${lineas.length - TOPE_DEL_DIFF} líneas más: el diff entero está en la rama.</span>`);
  return visibles.join("\n");
}

/** «u1-pulgar-alta-1792….webm» → «lo que vio pulgar en alta». */
function quienLoVio(video: string): string {
  const [, persona, ...resto] = video.replace(/\.webm$/, "").split("-");
  const pantalla = resto.slice(0, -1).join("-");
  return `lo que vio ${persona ?? "la persona"}${pantalla ? ` en ${pantalla}` : ""}`;
}

function esc(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function recortar(texto: string, largo: number): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  return limpio.length > largo ? `${limpio.slice(0, largo - 1)}…` : limpio;
}

/** «retomó su sesión · US$ 0,02»: cómo se encaró cada vuelta y, si se muestra la plata, cuánto costó. */
export function comoCorrigio(vueltas: readonly Correccion[], conPlata: boolean): string {
  return vueltas
    .map((v) =>
      [v.cayo ? "se cayó" : v.reanudada ? "retomó su sesión" : "de cero", ...(conPlata ? [v.costoDesconocido ? "sin costo informado" : plata(v.gastado)] : [])].join(" · "),
    )
    .join("; ");
}

/** «costó US$ 0,19», o un piso si algún motor no informó su costo: nunca un cero inventado. */
export function costoEnPalabras(dolares: number, desconocido?: boolean): string {
  if (!desconocido) return `costó ${plata(dolares)}`;
  return dolares > 0 ? `costó al menos ${plata(dolares)}` : "costo sin informar";
}

/** «20.261 de entrada (13.312 del caché) · 1.204 de salida». */
export function tokensEnPalabras(t: Tokens): string {
  const n = (x: number) => x.toLocaleString("es-AR");
  return `${n(t.entrada)} de entrada${t.cache ? ` (${n(t.cache)} del caché)` : ""} · ${n(t.salida)} de salida`;
}

/** Lo que hizo el agente en la elegida: escribir y cada corrección, con lo que costó cada cosa. */
export function cuentaDelAgente(g: Candidato, conPlata: boolean): string {
  const vueltas = g.correcciones ?? [];
  const corrigiendo = vueltas.reduce((n, v) => n + v.gastado, 0);
  const escribir = Math.max(0, (g.gastadoAgente ?? 0) - corrigiendo);
  // De la memoria de respuestas no costó nada, pero «por US$ 0» diría que escribir es gratis.
  const escribio = g.deCache
    ? `escribió de memoria${conPlata && g.ahorro ? ` (ahorró ${plata(g.ahorro)})` : ""}`
    : conPlata && !g.costoDesconocido
      ? `escribió por ${plata(escribir)}`
      : conPlata
        ? "escribió sin informar su costo"
        : "escribió";
  return [
    escribio,
    // La rama cambió de manos a mitad de camino: lo que gastó el que se fue está adentro de los
    // números de arriba, así que sin decirlo el total no se entiende.
    ...(g.relevo ? [`la siguió ${g.relevo.entro} porque ${g.relevo.salio.join(" y ")} no ${g.relevo.salio.length > 1 ? "pudieron" : "pudo"} trabajar`] : []),
    ...vueltas.map((v) => {
      const como = v.cayo ? "y se cayó" : v.reanudada ? "retomando su sesión" : "de cero";
      return `corrigió «${v.fase}» ${como}${conPlata && !v.costoDesconocido ? ` por ${plata(v.gastado)}` : ""}`;
    }),
  ].join("; ");
}

function plata(dolares: number): string {
  if (dolares === 0) return "US$ 0";
  if (dolares < 0.01) return "menos de 1¢";
  return `US$ ${dolares.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function reloj(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${Math.round(ms / 1000)} s`;
  return `${Math.round(ms / 60_000)} min`;
}
