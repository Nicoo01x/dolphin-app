// Las descargas las cuenta GitHub: cada archivo de una Release tiene su `download_count`.
//
// Se reparten por lo que significan, no por archivo:
// - instalador de Windows (.exe), de macOS (.dmg/.zip) y de Linux (.AppImage/.deb/.rpm): gente nueva o
//   que bajó a mano;
// - `latest*.yml`: lo pide la app instalada cada vez que se fija si hay versión nueva. No es gente, es
//   la señal más cercana a «instalaciones vivas» que hay sin telemetría;
// - `.blockmap`: actualizaciones que se bajaron por partes (Windows/Linux).

const REPO = "Nicoo01x/dolphin-app";
const CACHE_MS = 10 * 60 * 1000;

export function clasificarArchivo(nombre) {
  const n = nombre.toLowerCase();
  if (/^latest(-mac|-linux)?(-arm64)?\.yml$/.test(n)) {
    return { clase: "chequeo", sistema: n.includes("mac") ? "macos" : n.includes("linux") ? "linux" : "windows" };
  }
  if (n.endsWith(".blockmap")) return { clase: "actualizacion", sistema: sistemaPorNombre(n) };
  if (n.endsWith(".exe") || n.endsWith(".msi")) return { clase: "instalador", sistema: "windows" };
  if (n.endsWith(".dmg") || (n.endsWith(".zip") && /mac|darwin/.test(n))) return { clase: "instalador", sistema: "macos" };
  if (n.endsWith(".appimage") || n.endsWith(".deb") || n.endsWith(".rpm")) return { clase: "instalador", sistema: "linux" };
  return { clase: "otro", sistema: "otro" };
}

function sistemaPorNombre(n) {
  if (n.includes(".exe") || n.includes("win")) return "windows";
  if (n.includes("mac") || n.includes(".dmg") || n.includes(".zip")) return "macos";
  if (n.includes("linux") || n.includes("appimage")) return "linux";
  return "otro";
}

const cero = () => ({ windows: 0, macos: 0, linux: 0 });

/** De la lista de Releases de la API de GitHub al resumen del panel. Pura: se testea sin red. */
export function resumirDescargas(releases) {
  const total = { instaladores: cero(), chequeos: cero(), actualizaciones: 0 };
  const versiones = [];
  for (const r of releases) {
    if (r.draft) continue;
    const v = { tag: r.tag_name, publicada: r.published_at, prerelease: Boolean(r.prerelease), instaladores: cero(), chequeos: cero(), actualizaciones: 0, archivos: [] };
    for (const a of r.assets ?? []) {
      const { clase, sistema } = clasificarArchivo(a.name);
      const n = Number(a.download_count) || 0;
      if (clase === "instalador") {
        v.instaladores[sistema] += n;
        total.instaladores[sistema] += n;
      } else if (clase === "chequeo") {
        v.chequeos[sistema] += n;
        total.chequeos[sistema] += n;
      } else if (clase === "actualizacion") {
        v.actualizaciones += n;
        total.actualizaciones += n;
      }
      if (clase === "instalador") v.archivos.push({ nombre: a.name, descargas: n, sistema });
    }
    v.archivos.sort((a, b) => b.descargas - a.descargas);
    versiones.push(v);
  }
  versiones.sort((a, b) => String(b.publicada).localeCompare(String(a.publicada)));
  return { total, versiones };
}

/** Pide las Releases a GitHub con un caché de 10 minutos (sin token, la API da 60 pedidos por hora). */
export function crearFuenteDeDescargas({ fetchImpl = fetch, token = process.env.GITHUB_TOKEN, ahora = Date.now } = {}) {
  let cache = null;
  return async function descargas() {
    if (cache && ahora() - cache.en < CACHE_MS) return cache.datos;
    const cabeceras = { accept: "application/vnd.github+json", "user-agent": "odolphin-panel" };
    if (token) cabeceras.authorization = `Bearer ${token}`;
    const releases = [];
    for (let pagina = 1; pagina <= 5; pagina++) {
      const r = await fetchImpl(`https://api.github.com/repos/${REPO}/releases?per_page=100&page=${pagina}`, { headers: cabeceras });
      if (!r.ok) {
        if (cache) return { ...cache.datos, viejo: true };
        throw new Error(`GitHub contestó ${r.status}`);
      }
      const lote = await r.json();
      releases.push(...lote);
      if (lote.length < 100) break;
    }
    const datos = { ...resumirDescargas(releases), consultado: new Date(ahora()).toISOString() };
    cache = { en: ahora(), datos };
    return datos;
  };
}
