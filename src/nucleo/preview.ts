import { request } from "node:http";
import { connect } from "node:net";
import type { Duplex } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * La app de una rama, adentro de la consola.
 *
 * Mirar un diff no dice si la pantalla quedó bien. El preview levanta la app de la rama en su
 * worktree (el comando de siempre del repo, ver tester/levantar.ts) y la sirve POR EL ORIGEN DE LA
 * CONSOLA, en `/preview/<id>/…`. Eso último no es un detalle de implementación: es lo único que
 * permite inspeccionarla. Un iframe de otro origen —`http://127.0.0.1:5173`— no deja leer ni un
 * nodo de su DOM, así que «tocá el botón y decime qué cambiarle» sería imposible. Pasando por acá
 * la app queda en el mismo origen y el inspector se puede inyectar.
 *
 * Lo que se inyecta es un `<script>` en cada respuesta HTML, y nada más: ni se reescriben rutas ni
 * se toca el resto. Las rutas relativas funcionan porque el preview vive bajo su propio prefijo y
 * el `<base>` lo acompaña; las absolutas (`/assets/x.js`) se arreglan con el mismo prefijo.
 *
 * **Seguridad.** Un proxy que acepte cualquier puerto es un agujero: desde la consola se podría
 * leer cualquier servicio de loopback de la máquina (el panel de otra app, una base con interfaz
 * web). Por eso el proxy NO toma un puerto: toma el id de un preview que Dolphin abrió, y el
 * puerto sale del registro. Lo que no está en el registro no se proxea.
 *
 * Y se apagan solos: una app levantada que nadie mira consume CPU para nadie. Cada pedido renueva
 * su reloj y a los `MINUTOS_SIN_MIRAR` sin pedidos se cierra.
 */

/** Cuánto vive un preview que nadie mira. */
export const MINUTOS_SIN_MIRAR = 10;

export interface AppDelPreview {
  /** Dónde contesta de verdad, en loopback: «http://127.0.0.1:5173/». */
  readonly url: string;
  /** Lo último que escribió el proceso: si la pantalla sale en blanco, es lo primero que mirar. */
  salida(): string;
  detener(): Promise<void>;
}

export interface Preview {
  readonly id: string;
  readonly rama: string;
  /** El worktree donde corre. */
  readonly ruta: string;
  readonly app: AppDelPreview;
  readonly desde: number;
  /** Última vez que alguien pidió algo por el proxy. */
  ultimoUso: number;
}

/** Lo que la consola necesita saber de un preview, sin el proceso adentro. */
export interface PreviewParaLaConsola {
  readonly id: string;
  readonly rama: string;
  /** La dirección a poner en el iframe: del origen de la consola, no de la app. */
  readonly enLaConsola: string;
  readonly desde: number;
}

const abiertos = new Map<string, Preview>();

/** Un id corto que sirva en una URL. Es lo que ata el proxy a un puerto: no lo elige quien pide. */
function idNuevo(): string {
  for (let i = 1; ; i += 1) {
    const id = `p${i}`;
    if (!abiertos.has(id)) return id;
  }
}

export function paraLaConsola(preview: Preview): PreviewParaLaConsola {
  return { id: preview.id, rama: preview.rama, enLaConsola: `/preview/${preview.id}/`, desde: preview.desde };
}

export function previewDe(id: string): Preview | undefined {
  return abiertos.get(id);
}

export function previewDeRama(rama: string): Preview | undefined {
  return [...abiertos.values()].find((p) => p.rama === rama);
}

export function previewsAbiertos(): readonly PreviewParaLaConsola[] {
  return [...abiertos.values()].map(paraLaConsola);
}

/**
 * Registra una app ya levantada como preview.
 *
 * Levantarla es de quien llama (`levantarApp`): así este archivo no sabe de procesos ni de puertos
 * libres, y los tests lo prueban con un servidor de mentira.
 */
export function registrarPreview(datos: { rama: string; ruta: string; app: AppDelPreview; ahora?: number }): Preview {
  const ahora = datos.ahora ?? Date.now();
  const preview: Preview = { id: idNuevo(), rama: datos.rama, ruta: datos.ruta, app: datos.app, desde: ahora, ultimoUso: ahora };
  abiertos.set(preview.id, preview);
  return preview;
}

export async function cerrarPreview(id: string): Promise<boolean> {
  const preview = abiertos.get(id);
  if (!preview) return false;
  abiertos.delete(id);
  await preview.app.detener().catch(() => {});
  return true;
}

/** Al cerrar el servidor: nadie se queda con un `npm run dev` corriendo de fondo. */
export async function cerrarTodosLosPreviews(): Promise<void> {
  await Promise.all([...abiertos.keys()].map((id) => cerrarPreview(id)));
}

/** Cierra los que nadie mira desde hace rato. Lo llama el reloj del servidor. */
export async function cerrarLosOlvidados(ahora = Date.now(), minutos = MINUTOS_SIN_MIRAR): Promise<readonly string[]> {
  const viejos = [...abiertos.values()].filter((p) => ahora - p.ultimoUso > minutos * 60_000).map((p) => p.id);
  await Promise.all(viejos.map((id) => cerrarPreview(id)));
  return viejos;
}

/**
 * El script del inspector, inyectado en cada página del preview.
 *
 * Vive como texto acá y no como archivo aparte porque tiene que viajar adentro del HTML de la app
 * ajena: un `<script src>` a un archivo nuestro sería otro pedido que la CSP de esa app puede
 * bloquear, y el preview se quedaría sin inspector sin ningún síntoma. Hace tres cosas y nada más:
 * resalta lo que está debajo del puntero, al hacer clic manda el elemento al padre, y avisa cuando
 * la página de adentro cambió de dirección.
 *
 * Lo que manda tiene la MISMA forma que `ElementoTocado` del modo live (ver servidor.ts): el
 * preview no abre un segundo camino para pedir un cambio, usa el que ya existe.
 *
 * También repite para afuera lo que la app escribe en la consola del navegador y los errores que
 * tira. Es la parte de «devtools» que de verdad se usa: una pantalla que quedó en blanco casi
 * siempre tiene el motivo ahí, y sin esto hay que abrir F12 sobre un iframe para encontrarlo.
 */
export const INSPECTOR = String.raw`
(() => {
  if (window.__dolphinInspector) return;
  window.__dolphinInspector = true;
  var MARCAS = ["data-testid", "data-test-id", "data-test", "data-cy", "data-qa", "data-dolphin"];
  var ID_GENERADO = [/^:/, /^(?:radix|headlessui|mui|reach|ember|ng|rc)[-_]/i, /^[a-f0-9]{16,}$/i, /^[0-9]/, /^(?:react|_)/i];
  var CLASE_MALA = [/[^\w-]/, /^css-[a-z0-9]{4,}$/i, /^sc-[a-z0-9]{5,}$/i, /^jsx-\d+$/, /^[a-z][\w-]*?[-_][a-f0-9]{6,}$/i];
  var prendido = false;
  var marco = null;

  function nodo(el) {
    var marca;
    for (var i = 0; i < MARCAS.length; i++) {
      var v = el.getAttribute && el.getAttribute(MARCAS[i]);
      if (v) { marca = { atributo: MARCAS[i], valor: v }; break; }
    }
    var hermanos = el.parentElement ? Array.prototype.filter.call(el.parentElement.children, function (h) { return h.tagName === el.tagName; }) : [el];
    return {
      etiqueta: el.tagName.toLowerCase(),
      id: el.id || undefined,
      clases: el.classList ? Array.prototype.slice.call(el.classList) : [],
      marca: marca,
      posicion: hermanos.indexOf(el) + 1,
      hermanosIguales: hermanos.length,
    };
  }

  function usable(id) { return !!id && !ID_GENERADO.some(function (p) { return p.test(id); }); }
  function clases(cs) { return (cs || []).filter(function (c) { return c && !CLASE_MALA.some(function (p) { return p.test(c); }); }).slice(0, 2); }

  function nombre(n) {
    if (n.marca) return { s: "[" + n.marca.atributo + '="' + n.marca.valor + '"]', unico: true };
    if (usable(n.id)) return { s: "#" + n.id, unico: true };
    var base = n.etiqueta + clases(n.clases).map(function (c) { return "." + c; }).join("");
    return { s: n.hermanosIguales > 1 ? base + ":nth-of-type(" + n.posicion + ")" : base, unico: false };
  }

  // El mismo orden que nucleo/preview-selector.ts, que es donde se prueba.
  function selectorDe(camino) {
    var suyo = nombre(camino[0]);
    if (suyo.unico) return suyo.s;
    var partes = [suyo.s];
    for (var i = 1; i < camino.length && i < 4; i++) {
      var n = nombre(camino[i]);
      partes.unshift(n.s);
      if (n.unico) break;
    }
    return partes.join(" > ");
  }

  var ESTILOS = ["color", "background-color", "font-size", "font-weight", "padding", "margin", "border-radius", "border", "display", "width", "height", "gap"];

  function mirar(el) {
    var camino = [];
    for (var a = el; a && a.tagName && a.tagName !== "HTML" && camino.length < 8; a = a.parentElement) camino.push(nodo(a));
    var vivo = getComputedStyle(el);
    var estilos = {};
    for (var i = 0; i < ESTILOS.length; i++) estilos[ESTILOS[i]] = vivo.getPropertyValue(ESTILOS[i]);
    // La dirección es la de la app, no la del proxy: es la que el agente tiene que buscar.
    var donde = location.pathname.replace(/^\/preview\/[^/]+/, "") + location.search + location.hash;
    return {
      url: donde || "/",
      selector: selectorDe(camino),
      texto: (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 300),
      html: el.outerHTML.slice(0, 3000),
      estilos: estilos,
    };
  }

  function resaltar(el) {
    if (!marco) {
      marco = document.createElement("div");
      marco.style.cssText = "position:fixed;z-index:2147483647;pointer-events:none;border:2px solid #22d3ee;background:rgba(34,211,238,.12);border-radius:3px;transition:all 60ms";
      document.body.appendChild(marco);
    }
    var caja = el.getBoundingClientRect();
    marco.style.top = caja.top + "px";
    marco.style.left = caja.left + "px";
    marco.style.width = caja.width + "px";
    marco.style.height = caja.height + "px";
    marco.style.display = "block";
  }

  function sobre(evento) { if (prendido && evento.target && evento.target.tagName) resaltar(evento.target); }

  function tocar(evento) {
    if (!prendido) return;
    // El clic no llega a la app: tocar «Borrar» para pedir un cambio de color no puede borrar nada.
    evento.preventDefault();
    evento.stopPropagation();
    parent.postMessage({ dolphin: "elemento", elemento: mirar(evento.target) }, "*");
  }

  function prender(valor) {
    prendido = valor;
    document.documentElement.style.cursor = valor ? "crosshair" : "";
    if (!valor && marco) marco.style.display = "none";
  }

  // La consola de la app, repetida para afuera. Se envuelve en vez de reemplazar: la app sigue
  // escribiendo donde escribía, y quien abra F12 ve lo mismo de siempre.
  function contar(nivel, args) {
    var texto = Array.prototype.map
      .call(args, function (a) {
        if (a instanceof Error) return a.message;
        if (typeof a === "object") { try { return JSON.stringify(a).slice(0, 300); } catch (e) { return String(a); } }
        return String(a);
      })
      .join(" ");
    parent.postMessage({ dolphin: "consola", nivel: nivel, texto: texto.slice(0, 500) }, "*");
  }
  ["error", "warn"].forEach(function (nivel) {
    var antes = console[nivel];
    console[nivel] = function () {
      contar(nivel, arguments);
      return antes.apply(console, arguments);
    };
  });
  window.addEventListener("error", function (e) { contar("error", [e.message]); });
  window.addEventListener("unhandledrejection", function (e) { contar("error", [String(e.reason)]); });

  document.addEventListener("mousemove", sobre, true);
  document.addEventListener("click", tocar, true);
  window.addEventListener("message", function (e) {
    if (e.data && e.data.dolphin === "inspeccionar") prender(!!e.data.prendido);
  });
  // Para que la consola sepa en qué pantalla está parado el preview.
  var avisarRuta = function () {
    parent.postMessage({ dolphin: "ruta", ruta: location.pathname.replace(/^\/preview\/[^/]+/, "") || "/" }, "*");
  };
  avisarRuta();
  window.addEventListener("popstate", avisarRuta);
  parent.postMessage({ dolphin: "listo" }, "*");
})();
`;

/**
 * Le mete el inspector al HTML.
 *
 * Va con `<base>` para que las rutas relativas de la app sigan resolviendo adentro del prefijo del
 * preview, y antes de `</head>` para que corra antes de que la app pinte. Sin `</head>` (hay
 * páginas que no lo traen) se pone al principio: perder el inspector es perder la función entera.
 */
export function conInspector(html: string, id: string): string {
  const etiquetas = `<base href="/preview/${id}/"><script>${INSPECTOR}</script>`;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (cabeza) => `${cabeza}${etiquetas}`);
  return `${etiquetas}${html}`;
}

/** Las cabeceras que no se reenvían: son de la conexión, no del contenido. */
const NO_SE_REENVIAN = new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade", "host"]);

function limpias(cabeceras: NodeJS.Dict<string | string[]>): Record<string, string | string[]> {
  return Object.fromEntries(Object.entries(cabeceras).filter(([k, v]) => v !== undefined && !NO_SE_REENVIAN.has(k.toLowerCase()))) as Record<string, string | string[]>;
}

/** El puerto y el host de la app, sacados de su URL. */
function dondeContesta(url: string): { host: string; puerto: number } {
  const u = new URL(url);
  return { host: u.hostname, puerto: Number(u.port || (u.protocol === "https:" ? 443 : 80)) };
}

/**
 * Sirve `/preview/<id>/<resto>` desde la app de ese preview.
 *
 * Devuelve `false` si la ruta no es de un preview, para que el servidor siga buscando. Si el id no
 * existe contesta 404 y devuelve `true`: la ruta era de un preview, solo que de uno que ya se
 * cerró, y hay que decirlo en vez de servir la consola en su lugar.
 */
export function servirPreview(ruta: string, pedido: IncomingMessage, respuesta: ServerResponse, ahora = Date.now()): boolean {
  const [, id = "", resto = ""] = /^\/preview\/([^/]+)(\/.*)?$/.exec(ruta) ?? [];
  if (!id) return false;
  const preview = abiertos.get(id);
  if (!preview) {
    respuesta.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    respuesta.end("ese preview ya no está abierto");
    return true;
  }
  preview.ultimoUso = ahora;

  const { host, puerto } = dondeContesta(preview.app.url);
  const consulta = (pedido.url ?? "").split("?")[1];
  const hacia = request(
    {
      host,
      port: puerto,
      method: pedido.method,
      path: `${resto === "" ? "/" : resto}${consulta ? `?${consulta}` : ""}`,
      headers: { ...limpias(pedido.headers), host: `${host}:${puerto}` },
    },
    (deLaApp) => {
      const tipo = String(deLaApp.headers["content-type"] ?? "");
      const cabeceras = limpias(deLaApp.headers);
      // Una redirección de la app apunta a su propia raíz: hay que traerla al prefijo o el iframe
      // se va del preview (y, al ser otro origen, deja de poder inspeccionarse).
      const lugar = deLaApp.headers.location;
      if (typeof lugar === "string" && lugar.startsWith("/") && !lugar.startsWith(`/preview/${id}/`)) {
        cabeceras.location = `/preview/${id}${lugar}`;
      }

      if (!tipo.includes("text/html")) {
        respuesta.writeHead(deLaApp.statusCode ?? 200, cabeceras);
        deLaApp.pipe(respuesta);
        return;
      }

      // El HTML se junta entero: hay que inyectarle el inspector, y eso cambia su largo.
      const trozos: Buffer[] = [];
      deLaApp.on("data", (t: Buffer) => trozos.push(t));
      deLaApp.on("end", () => {
        const cuerpo = Buffer.from(conInspector(Buffer.concat(trozos).toString("utf8"), id), "utf8");
        delete cabeceras["content-length"];
        // La CSP de la app bloquearía el script inyectado: adentro del preview manda el preview.
        delete cabeceras["content-security-policy"];
        delete cabeceras["content-security-policy-report-only"];
        respuesta.writeHead(deLaApp.statusCode ?? 200, { ...cabeceras, "content-length": cuerpo.length });
        respuesta.end(cuerpo);
      });
    },
  );

  hacia.on("error", (error) => {
    if (respuesta.headersSent) return respuesta.destroy();
    respuesta.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    // La salida del proceso es lo que explica por qué no contesta (el puerto ocupado, un error de
    // compilación): sin eso, la pantalla en blanco no dice nada.
    respuesta.end(`la app de ${preview.rama} no contestó: ${error.message}\n\n${preview.app.salida().slice(-2000)}`);
  });

  pedido.pipe(hacia);
  return true;
}

/**
 * El WebSocket del preview: el recambio en caliente de Vite y compañía.
 *
 * Sin esto el cliente de la app intenta conectarse, falla, y recarga la página en loop: el preview
 * de cualquier app moderna quedaría parpadeando. Se engancha en el evento `upgrade` del servidor.
 */
export function servirUpgradeDePreview(pedido: IncomingMessage, socket: Duplex, cabeza: Buffer): boolean {
  const [, id = "", resto = ""] = /^\/preview\/([^/]+)(\/.*)?$/.exec((pedido.url ?? "").split("?")[0] ?? "") ?? [];
  const preview = id ? abiertos.get(id) : undefined;
  if (!preview) return false;
  preview.ultimoUso = Date.now();

  const { host, puerto } = dondeContesta(preview.app.url);
  const consulta = (pedido.url ?? "").split("?")[1];
  const alla = connect(puerto, host, () => {
    const lineas = [
      `GET ${resto === "" ? "/" : resto}${consulta ? `?${consulta}` : ""} HTTP/1.1`,
      ...Object.entries({ ...limpias(pedido.headers), host: `${host}:${puerto}`, connection: "Upgrade", upgrade: String(pedido.headers.upgrade ?? "websocket") }).map(
        ([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`,
      ),
      "",
      "",
    ];
    alla.write(lineas.join("\r\n"));
    if (cabeza.length > 0) alla.write(cabeza);
    alla.pipe(socket);
    socket.pipe(alla);
  });
  // Que se caiga el recambio en caliente no puede tirar la consola.
  alla.on("error", () => socket.destroy());
  socket.on("error", () => alla.destroy());
  return true;
}
