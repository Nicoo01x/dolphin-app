// Las rutas de /api. `crearApp` no abre puertos ni lee variables de entorno: recibe todo armado, así
// los tests le hablan directo y servidor.mjs es lo único que sabe del VPS.

import { mkdirSync, readFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { gzip } from "node:zlib";
import { leerReporte, aRegistro, ReporteInvalido, TOPE_CUERPO } from "./reportes.mjs";
import { claveCorrecta, crearSesion, sesionValida, leerCookie, cookieDeSesion, cookieVencida, COOKIE } from "./sesion.mjs";
import { crearLimitador, ipDe } from "./limites.mjs";
import { normalizarVisita, sistemaDeClic } from "./visitas.mjs";
import { rutasDelPanel } from "./panel.mjs";
import { servirEstatico } from "./estatico.mjs";

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;
const comprimir = promisify(gzip);
/** Reportes que se procesan a la vez: cada uno puede ocupar unas veces su tamaño en memoria. */
const REPORTES_EN_VUELO = 2;
/** Lo que se guarda en adjuntos por día, entre todos: el disco es el mismo de la web y la consola. */
const TOPE_DE_ADJUNTOS_POR_DIA = 500 * 1024 * 1024;
/** Los adjuntos (diagnóstico e imágenes) se borran pasado esto; el texto del reporte queda. */
const VIDA_DE_LOS_ADJUNTOS_MS = 90 * DIA;

export function crearApp({ base, datos, claveAdmin, secreto, descargas, avisador, cookieSegura = true, sitio = "odolphin.tech", estatico = null, ahora = () => new Date(), log = console }) {
  const limites = {
    reportes: crearLimitador({ maximo: 30, ventanaMs: HORA }),
    contadores: crearLimitador({ maximo: 600, ventanaMs: HORA }),
    entrar: crearLimitador({ maximo: 10, ventanaMs: 15 * 60 * 1000 }),
    // Entre todas las IP: frena una contraseña probada desde muchas direcciones. A cambio, alguien
    // puede trabar el ingreso un rato; el panel no es crítico y la contraseña vale más.
    entrarGlobal: crearLimitador({ maximo: 60, ventanaMs: 15 * 60 * 1000 }),
  };
  let enVuelo = 0;
  const escritos = [];
  const ctx = { base, datos, descargas, ahora, log, leerAdjunto, listarImagenes };
  const panel = rutasDelPanel(ctx);

  /** Cuánto se escribió en adjuntos en las últimas 24 h (en memoria: al reiniciar arranca de cero). */
  function escritoHoy(t) {
    while (escritos.length && t - escritos[0].t > DIA) escritos.shift();
    return escritos.reduce((s, e) => s + e.bytes, 0);
  }

  async function guardarAdjuntos(id, leido) {
    if (!leido.diagnostico && leido.imagenes.length === 0) return true;
    const t = ahora().getTime();
    const bytes = (leido.diagnostico?.length ?? 0) + leido.imagenes.reduce((s, i) => s + i.datos.length, 0);
    if (escritoHoy(t) + bytes > TOPE_DE_ADJUNTOS_POR_DIA) {
      log.warn?.(`[reportes] tope diario de adjuntos alcanzado: el reporte ${id} se guarda sin adjuntos`);
      return false;
    }
    escritos.push({ t, bytes });
    const carpeta = join(datos, "adjuntos", id);
    mkdirSync(carpeta, { recursive: true });
    if (leido.diagnostico) await writeFile(join(carpeta, "diagnostico.ndjson.gz"), await comprimir(leido.diagnostico));
    for (const [i, img] of leido.imagenes.entries()) {
      const ext = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" }[img.tipo] ?? "bin";
      await writeFile(join(carpeta, `imagen-${i}.${ext}`), img.datos);
    }
    return true;
  }

  /** Borra los adjuntos de más de 90 días. Corre al arrancar y una vez por día (servidor.mjs). */
  function limpiarAdjuntosViejos() {
    const antes = new Date(ahora().getTime() - VIDA_DE_LOS_ADJUNTOS_MS).toISOString();
    const ids = base.reportesConAdjuntosAntesDe(antes);
    for (const id of ids) rmSync(join(datos, "adjuntos", id), { recursive: true, force: true });
    base.olvidarAdjuntos(ids);
    return ids.length;
  }

  function leerAdjunto(id, nombre) {
    if (!/^[0-9a-f-]{36}$/.test(id) || !/^[a-z0-9.\-]+$/.test(nombre)) return null;
    const ruta = join(datos, "adjuntos", id, nombre);
    return existsSync(ruta) ? readFileSync(ruta) : null;
  }

  function listarImagenes(id) {
    if (!/^[0-9a-f-]{36}$/.test(id)) return [];
    const carpeta = join(datos, "adjuntos", id);
    return existsSync(carpeta) ? readdirSync(carpeta).filter((n) => n.startsWith("imagen-")).sort() : [];
  }

  async function recibirReporte(pedido, respuesta) {
    if (!limites.reportes(ipDe(pedido))) return json(respuesta, 429, { ok: false, error: "demasiados reportes" });
    // Antes de leer un byte: lo que anuncia más que el tope ni se recibe.
    // `resume()` descarta lo que siga llegando sin guardarlo: el cliente recibe su 413 limpio en vez
    // de un corte de conexión, y la memoria no se toca.
    if (Number(pedido.headers["content-length"] ?? 0) > TOPE_CUERPO) {
      pedido.resume();
      return json(respuesta, 413, { ok: false, error: "el reporte es demasiado grande" });
    }
    if (enVuelo >= REPORTES_EN_VUELO) {
      pedido.resume();
      return json(respuesta, 503, { ok: false, error: "ocupado, probá en un momento" }, { "retry-after": "5" });
    }
    enVuelo += 1;
    try {
      const cuerpo = await leerCuerpo(pedido, TOPE_CUERPO);
      if (cuerpo === null) return json(respuesta, 413, { ok: false, error: "el reporte es demasiado grande" });
      let leido;
      try {
        leido = await leerReporte(cuerpo, pedido.headers["content-type"]);
      } catch (error) {
        if (error instanceof ReporteInvalido) return json(respuesta, 400, { ok: false, error: error.message });
        throw error;
      }
      const registro = aRegistro(leido, ahora());
      const conAdjuntos = await guardarAdjuntos(registro.id, leido);
      const estado = base.guardarReporte(conAdjuntos ? registro : { ...registro, diagnostico_bytes: 0, imagenes: 0 });
      avisador?.avisar(registro, estado).catch(() => {});
      log.info?.(`[reportes] ${registro.tipo} ${registro.firma ?? ""} v${registro.version ?? "?"} ${registro.plataforma ?? ""}`);
      return json(respuesta, 200, { ok: true, id: registro.id, imagesDelivered: conAdjuntos });
    } finally {
      enVuelo -= 1;
    }
  }

  async function contarVisita(pedido, respuesta) {
    if (!limites.contadores(ipDe(pedido))) return vacio(respuesta, 429);
    const datosVisita = parsear(await leerCuerpo(pedido, 4096));
    const visita = normalizarVisita({ ruta: datosVisita?.ruta, referente: datosVisita?.ref, agente: pedido.headers["user-agent"], sitio });
    if (visita) base.sumarVisita(ahora().toISOString().slice(0, 10), visita.ruta, visita.origen);
    return vacio(respuesta, 204);
  }

  async function contarClic(pedido, respuesta) {
    if (!limites.contadores(ipDe(pedido))) return vacio(respuesta, 429);
    const sistema = sistemaDeClic(parsear(await leerCuerpo(pedido, 1024))?.sistema);
    if (sistema) base.sumarClic(ahora().toISOString().slice(0, 10), sistema);
    return vacio(respuesta, 204);
  }

  async function entrar(pedido, respuesta) {
    const ip = ipDe(pedido);
    if (!limites.entrar(ip) || !limites.entrarGlobal("todas")) {
      log.warn?.(`[panel] ingreso frenado por el limitador: ${ip}`);
      return json(respuesta, 429, { ok: false, error: "Demasiados intentos. Probá en unos minutos." });
    }
    const clave = parsear(await leerCuerpo(pedido, 2048))?.clave;
    if (!claveAdmin || !secreto || !(await claveCorrecta(clave, claveAdmin))) {
      log.warn?.(`[panel] contraseña equivocada desde ${ip}`);
      return json(respuesta, 401, { ok: false, error: "Esa no es la contraseña." });
    }
    log.info?.(`[panel] ingreso desde ${ip}`);
    respuesta.setHeader("set-cookie", cookieDeSesion(crearSesion(secreto, base.epocaDeSesion()), { segura: cookieSegura }));
    return json(respuesta, 200, { ok: true });
  }

  manejar.limpiarAdjuntosViejos = limpiarAdjuntosViejos;
  return manejar;

  async function manejar(pedido, respuesta) {
    try {
      const url = new URL(pedido.url, "http://local");
      const { pathname: ruta } = url;
      const metodo = pedido.method ?? "GET";
      respuesta.setHeader("x-content-type-options", "nosniff");

      if (ruta === "/api/salud") return json(respuesta, 200, { ok: true });
      if (metodo === "POST" && ruta === "/api/reportes") return await recibirReporte(pedido, respuesta);
      if (metodo === "POST" && ruta === "/api/visita") return await contarVisita(pedido, respuesta);
      if (metodo === "POST" && ruta === "/api/descarga") return await contarClic(pedido, respuesta);

      if (ruta.startsWith("/api/admin/")) {
        respuesta.setHeader("cache-control", "no-store");
        if (metodo === "POST" && !origenPropio(pedido, sitio)) return json(respuesta, 403, { ok: false, error: "origen ajeno" });
        if (metodo === "POST" && ruta === "/api/admin/entrar") return await entrar(pedido, respuesta);
        const conSesion = sesionValida(leerCookie(pedido.headers.cookie, COOKIE), secreto, base.epocaDeSesion());
        if (metodo === "POST" && ruta === "/api/admin/salir") {
          // Salir sube la época: cualquier copia de la cookie deja de valer. Sólo con sesión, así
          // nadie de afuera puede echar a Nico mandando este pedido.
          if (conSesion) base.subirEpocaDeSesion();
          respuesta.setHeader("set-cookie", cookieVencida({ segura: cookieSegura }));
          return json(respuesta, 200, { ok: true });
        }
        // El panel pregunta esto al abrir: contestar 200 en los dos casos evita un 401 rojo en la
        // consola cada vez que alguien llega a la puerta sin sesión, que es lo normal.
        if (metodo === "GET" && ruta === "/api/admin/sesion") return json(respuesta, 200, { ok: true, sesion: conSesion });
        if (!conSesion) {
          return json(respuesta, 401, { ok: false, error: "Entrá de nuevo." });
        }
        const cuerpo = metodo === "POST" ? parsear(await leerCuerpo(pedido, 4096)) ?? {} : {};
        const resultado = await panel(metodo, ruta.slice("/api/admin".length), url.searchParams, cuerpo);
        if (!resultado) return json(respuesta, 404, { ok: false, error: "no existe" });
        if (resultado.archivo) {
          respuesta.writeHead(200, { "content-type": resultado.tipo, "content-disposition": `attachment; filename="${resultado.nombre}"` });
          return respuesta.end(resultado.archivo);
        }
        return json(respuesta, 200, resultado.json);
      }

      if (ruta.startsWith("/api/")) return json(respuesta, 404, { ok: false, error: "no existe" });
      if (estatico && (metodo === "GET" || metodo === "HEAD")) return servirEstatico(estatico, ruta, respuesta);
      return json(respuesta, 404, { ok: false, error: "no existe" });
    } catch (error) {
      log.error(`[api] ${pedido.method} ${pedido.url}: ${error.stack ?? error}`);
      if (!respuesta.headersSent) json(respuesta, 500, { ok: false, error: "error del servidor" });
      else respuesta.end();
    }
  }
}

function json(respuesta, estado, datos, extra = {}) {
  respuesta.writeHead(estado, { "content-type": "application/json; charset=utf-8", ...extra });
  respuesta.end(JSON.stringify(datos));
}

function vacio(respuesta, estado) {
  respuesta.writeHead(estado);
  respuesta.end();
}

function parsear(cuerpo) {
  if (!cuerpo || cuerpo.length === 0) return null;
  try {
    const v = JSON.parse(cuerpo.toString("utf8"));
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

/** Un POST al panel sólo desde la propia web: con SameSite=Strict ya alcanza, esto es el cinturón. */
function origenPropio(pedido, sitio) {
  const origen = pedido.headers.origin;
  if (!origen) return true;
  try {
    const host = new URL(origen).hostname;
    return host === sitio || host === "127.0.0.1" || host === "localhost";
  } catch {
    return false;
  }
}

/** Lee el cuerpo entero; null si pasa el tope (y deja de leer). */
export function leerCuerpo(pedido, tope) {
  return new Promise((resolver, rechazar) => {
    const partes = [];
    let total = 0;
    let pasado = false;
    pedido.on("data", (parte) => {
      if (pasado) return;
      total += parte.length;
      if (total > tope) {
        pasado = true;
        resolver(null);
        pedido.resume();
        return;
      }
      partes.push(parte);
    });
    pedido.on("end", () => !pasado && resolver(Buffer.concat(partes)));
    pedido.on("error", rechazar);
  });
}
