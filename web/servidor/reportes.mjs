// Lo que manda la app de escritorio cuando alguien acepta enviar un crash o escribe un comentario.
//
// El formato NO se inventa acá: es el que arma `escritorio/src/main/ipc/feedback-request.ts`.
// - Sin adjuntos: JSON con feedback, submissionType ('crash' | 'feedback'), githubLogin, githubEmail,
//   appVersion, platform, osRelease, arch.
// - Con adjuntos: multipart con esos mismos campos, más `diagnosticBundleFile` (NDJSON) y las
//   imágenes en `feedbackImage`.
// La app da por entregado cualquier 2xx y lee `imagesDelivered` / `ok` del JSON de respuesta.

import { createHash, randomUUID } from "node:crypto";

/**
 * El tope de un pedido. La app manda a lo sumo 4 imágenes que suman 4 MB
 * (escritorio/src/shared/feedback-image-limits.ts), el texto cortado en 64 KB y el bundle de
 * diagnóstico; si el bundle no entra, la app reintenta sin él al recibir el 413. Más alto era
 * peligroso: el multipart se parte en memoria y tres pedidos de 25 MB a la vez pasaban el tope de
 * memoria del servicio (revisión de seguridad del 18/11).
 */
export const TOPE_CUERPO = 8 * 1024 * 1024;
const TOPE_TEXTO = 70_000;
const TOPE_CAMPO = 300;
const MAXIMO_IMAGENES = 4;
const PLATAFORMAS = new Set(["win32", "darwin", "linux", "freebsd", "openbsd", "sunos", "aix"]);

export class ReporteInvalido extends Error {}

/** Una línea, sin saltos: un salto en `version` permitía inventar líneas en el log del servicio. */
const corto = (v) => (typeof v === "string" ? v.replace(/[\r\n\t]+/g, " ").slice(0, TOPE_CAMPO).trim() || null : null);

/** Lee el cuerpo ya recibido (Buffer) según su tipo y devuelve los campos y los adjuntos. */
export async function leerReporte(cuerpo, tipoContenido) {
  const tipo = String(tipoContenido || "").toLowerCase();
  if (tipo.startsWith("application/json")) {
    let datos;
    try {
      datos = JSON.parse(cuerpo.toString("utf8"));
    } catch {
      throw new ReporteInvalido("el JSON no se puede leer");
    }
    return normalizar(datos, null, []);
  }
  if (tipo.startsWith("multipart/form-data")) {
    // `Request` de Node ya sabe partir un multipart: no hace falta una librería para esto.
    let formulario;
    try {
      formulario = await new Request("http://local/", {
        method: "POST",
        headers: { "content-type": tipoContenido },
        body: cuerpo,
      }).formData();
    } catch {
      throw new ReporteInvalido("el formulario no se puede leer");
    }
    const campo = (n) => {
      const v = formulario.get(n);
      return typeof v === "string" ? v : undefined;
    };
    const datos = Object.fromEntries(
      ["feedback", "submissionType", "githubLogin", "githubEmail", "appVersion", "platform", "osRelease", "arch"].map(
        (n) => [n, campo(n)],
      ),
    );
    const bundle = formulario.get("diagnosticBundleFile");
    const diagnostico = bundle && typeof bundle !== "string" ? Buffer.from(await bundle.arrayBuffer()) : null;
    const archivos = formulario.getAll("feedbackImage").filter((img) => typeof img !== "string");
    if (archivos.length > MAXIMO_IMAGENES) throw new ReporteInvalido(`más de ${MAXIMO_IMAGENES} imágenes`);
    const imagenes = [];
    for (const img of archivos) {
      imagenes.push({ tipo: img.type || "application/octet-stream", datos: Buffer.from(await img.arrayBuffer()) });
    }
    return normalizar(datos, diagnostico, imagenes);
  }
  throw new ReporteInvalido("tipo de contenido no soportado");
}

function normalizar(datos, diagnostico, imagenes) {
  if (!datos || typeof datos !== "object") throw new ReporteInvalido("cuerpo vacío");
  const texto = typeof datos.feedback === "string" ? datos.feedback.slice(0, TOPE_TEXTO) : "";
  if (!texto.trim()) throw new ReporteInvalido("falta el texto");
  const tipo = datos.submissionType === "crash" ? "crash" : "feedback";
  const plataforma = PLATAFORMAS.has(datos.platform) ? datos.platform : null;
  const campos = tipo === "crash" ? camposDelCrash(texto) : {};
  return {
    tipo,
    texto,
    version: corto(datos.appVersion),
    plataforma,
    sistema: corto(datos.osRelease),
    arch: corto(datos.arch),
    github: corto(datos.githubLogin),
    correo: corto(datos.githubEmail),
    ...campos,
    diagnostico,
    imagenes,
  };
}

/** Saca del texto del crash las líneas que lo identifican (formatCrashReportText en la app). */
export function camposDelCrash(texto) {
  const linea = (nombre) => {
    const m = texto.match(new RegExp(`^${nombre}: (.*)$`, "m"));
    return m ? m[1].trim() : null;
  };
  const proceso = linea("Process")?.slice(0, 80) ?? null;
  const motivo = linea("Reason")?.slice(0, 120) ?? null;
  const salida = linea("Exit code");
  const chequeo = linea("Check failure");
  // El offset dentro del módulo cambia con cada build: agrupar por él partiría el mismo crash en mil.
  const modulo = linea("Faulting module")?.replace(/\+0x[0-9a-f]+$/i, "") ?? null;
  const partes = [proceso, motivo, salida, chequeo, modulo].map((p) => p ?? "");
  const firma = createHash("sha256").update(partes.join("\u0000")).digest("hex").slice(0, 16);
  const titulo = [proceso, motivo, modulo || chequeo || (salida && salida !== "unknown" ? `código ${salida}` : null)]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 200);
  return { firma, titulo: titulo || "Crash sin datos", proceso, motivo };
}

/** El registro listo para la base, con su id y la hora en que llegó. */
export function aRegistro(leido, ahora = new Date()) {
  return {
    id: randomUUID(),
    recibido: ahora.toISOString(),
    tipo: leido.tipo,
    firma: leido.firma ?? null,
    titulo: leido.titulo ?? null,
    version: leido.version,
    plataforma: leido.plataforma,
    sistema: leido.sistema,
    arch: leido.arch,
    proceso: leido.proceso ?? null,
    motivo: leido.motivo ?? null,
    texto: leido.texto,
    github: leido.github,
    correo: leido.correo,
    diagnostico_bytes: leido.diagnostico?.length ?? 0,
    imagenes: leido.imagenes.length,
  };
}
