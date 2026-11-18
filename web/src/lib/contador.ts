/**
 * Los dos contadores de la web: qué página se vio y en qué sistema se tocó «Descargar».
 *
 * Van con `sendBeacon`, que no espera respuesta ni frena la navegación (el clic en Descargar se va
 * del sitio enseguida). No llevan cookie ni identificador: el servidor suma 1 en «hoy, esta página,
 * de este sitio» y nada más (web/servidor/visitas.mjs).
 *
 * Sólo cuentan en odolphin.tech o en el servidor de prueba local (puerto 18800): en `next dev` no
 * hay /api y cada visita sería un 404 en la consola.
 */

function hayContador(): boolean {
  if (typeof window === "undefined" || typeof navigator.sendBeacon !== "function") return false;
  const { hostname, port } = window.location;
  return hostname === "odolphin.tech" || port === "18800";
}

function mandar(ruta: string, datos: Record<string, string>) {
  if (!hayContador()) return;
  try {
    navigator.sendBeacon(ruta, JSON.stringify(datos));
  } catch {
    // Un contador que falla no puede romper la página.
  }
}

export function contarVisita(ruta: string) {
  mandar("/api/visita", { ruta, ref: document.referrer });
}

export function contarDescarga(sistema: "windows" | "macos" | "linux") {
  mandar("/api/descarga", { sistema });
}
