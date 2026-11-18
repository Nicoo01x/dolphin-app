// Visitas de la web contadas como en un cuaderno: «hoy, /preguntas, desde google.com: 14».
//
// Sin cookies, sin identificador, sin IP guardada: no se puede seguir a nadie de una página a otra
// ni de un día al siguiente, y por eso no hace falta pedir permiso para contarlas. Lo que sí dice es
// qué páginas se leen y de dónde llega la gente, que es lo que hace falta para el SEO.

const BOTS = /bot|crawl|spider|slurp|preview|fetch|monitor|headless|lighthouse|curl|wget|python|go-http|node/i;
const RUTA_VALIDA = /^\/[a-z0-9\-/]*$/;

/** Devuelve `{ ruta, origen }` o null si no hay que contarla (bots, rutas raras, el panel). */
export function normalizarVisita({ ruta, referente, agente, sitio = "odolphin.tech" }) {
  if (!agente || BOTS.test(agente)) return null;
  if (typeof ruta !== "string") return null;
  let limpia = ruta.split(/[?#]/)[0].toLowerCase();
  if (limpia.length > 1) limpia = limpia.replace(/\/+$/, "");
  if (!RUTA_VALIDA.test(limpia) || limpia.length > 120) return null;
  if (limpia === "/admin" || limpia.startsWith("/admin/")) return null;
  // ChatGPT y otros asistentes no mandan Referer pero sí `utm_source`: sin esto figuran como «directo».
  const utm = ruta.match(/[?&]utm_source=([^&#]+)/)?.[1];
  const origen = origenDe(referente, sitio);
  const porUtm = utm ? decodeURIComponent(utm).toLowerCase().replace(/[^a-z0-9.\-_]/g, "").slice(0, 80) : "";
  return { ruta: limpia, origen: origen === "directo" && porUtm ? porUtm : origen };
}

/** Sólo el dominio de donde vino, sin `www.`; «directo» si no hay; «interno» si es la propia web. */
export function origenDe(referente, sitio = "odolphin.tech") {
  if (!referente) return "directo";
  try {
    const host = new URL(referente).hostname.replace(/^www\./, "").toLowerCase();
    if (!host) return "directo";
    if (host === sitio) return "interno";
    return host.slice(0, 80);
  } catch {
    return "directo";
  }
}

const SISTEMAS = new Set(["windows", "macos", "linux"]);
export const sistemaDeClic = (s) => (SISTEMAS.has(s) ? s : null);
