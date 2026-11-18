// Lo que lee y toca el panel de admin, ya con la sesión verificada (eso lo hace app.mjs).
// Devuelve `{ json }`, `{ archivo, tipo, nombre }` o null (no existe).

const DIA = 24 * 60 * 60 * 1000;

const dias = (params, porDefecto) => {
  const n = Number(params.get("dias"));
  return Number.isInteger(n) && n > 0 && n <= 365 ? n : porDefecto;
};

export function rutasDelPanel({ base, descargas, ahora, leerAdjunto, listarImagenes }) {
  const desde = (n) => new Date(ahora().getTime() - n * DIA).toISOString();

  return async function panel(metodo, ruta, params, cuerpo) {
    if (metodo === "GET" && ruta === "/resumen") {
      return { json: { ok: true, dias: dias(params, 7), ...base.resumen(desde(dias(params, 7))) } };
    }

    if (metodo === "GET" && ruta === "/crashes") return { json: { ok: true, firmas: base.firmasDeCrash() } };

    let m = ruta.match(/^\/crashes\/([0-9a-f]{16})$/);
    if (metodo === "GET" && m) return { json: { ok: true, reportes: base.reportesDeFirma(m[1]) } };

    m = ruta.match(/^\/crashes\/([0-9a-f]{16})\/(resolver|reabrir|visto)$/);
    if (metodo === "POST" && m) {
      const [, firma, accion] = m;
      if (accion === "resolver") base.resolverFirma(firma, ahora().toISOString(), typeof cuerpo.version === "string" ? cuerpo.version.slice(0, 40) : null);
      else if (accion === "reabrir") base.reabrirFirma(firma);
      else base.marcarFirmaVista(firma);
      return { json: { ok: true } };
    }

    if (metodo === "GET" && ruta === "/comentarios") return { json: { ok: true, comentarios: base.comentarios() } };

    m = ruta.match(/^\/reportes\/([0-9a-f-]{36})$/);
    if (metodo === "GET" && m) {
      const reporte = base.reporte(m[1]);
      if (!reporte) return null;
      base.marcarVisto([reporte.id]);
      return { json: { ok: true, reporte: { ...reporte, visto: 1, imagenes: listarImagenes(reporte.id) } } };
    }

    m = ruta.match(/^\/reportes\/([0-9a-f-]{36})\/diagnostico$/);
    if (metodo === "GET" && m) {
      const archivo = leerAdjunto(m[1], "diagnostico.ndjson.gz");
      return archivo ? { archivo, tipo: "application/gzip", nombre: `dolphin-diagnostico-${m[1].slice(0, 8)}.ndjson.gz` } : null;
    }

    m = ruta.match(/^\/reportes\/([0-9a-f-]{36})\/(imagen-\d+\.(?:png|jpg|webp|gif|bin))$/);
    if (metodo === "GET" && m) {
      const archivo = leerAdjunto(m[1], m[2]);
      const tipo = { png: "image/png", jpg: "image/jpeg", webp: "image/webp", gif: "image/gif" }[m[2].split(".").pop()] ?? "application/octet-stream";
      return archivo ? { archivo, tipo, nombre: m[2] } : null;
    }

    if (metodo === "POST" && ruta === "/comentarios/visto") {
      const ids = Array.isArray(cuerpo.ids) ? cuerpo.ids.filter((i) => typeof i === "string").slice(0, 500) : [];
      base.marcarVisto(ids);
      return { json: { ok: true } };
    }

    if (metodo === "GET" && ruta === "/descargas") {
      const n = dias(params, 30);
      const desdeDia = desde(n).slice(0, 10);
      let github = null;
      let error = null;
      try {
        github = await descargas();
      } catch (e) {
        error = `No se pudo leer GitHub: ${e.message}`;
      }
      return { json: { ok: true, dias: n, github, error, clics: base.clicsPorDia(desdeDia) } };
    }

    if (metodo === "GET" && ruta === "/visitas") {
      const n = dias(params, 30);
      const desdeDia = desde(n).slice(0, 10);
      return {
        json: { ok: true, dias: n, porDia: base.visitasPorDia(desdeDia), porRuta: base.visitasPorRuta(desdeDia), porOrigen: base.visitasPorOrigen(desdeDia) },
      };
    }

    return null;
  };
}
