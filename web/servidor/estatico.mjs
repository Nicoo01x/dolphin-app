// Sólo para probar en local: sirve el `out/` de la web como lo hace Caddy en el VPS
// (`try_files {path} {path}.html {path}/index.html`), así la web y /api salen del mismo origen.
// En producción esto no se usa: los archivos los sirve Caddy.

import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ico": "image/x-icon",
};

export function servirEstatico(raiz, ruta, respuesta) {
  const base = normalize(raiz);
  const candidatos = [ruta, `${ruta}.html`, join(ruta, "index.html")];
  for (const c of candidatos) {
    const archivo = normalize(join(base, decodeURIComponent(c)));
    if (!archivo.startsWith(base + sep) && archivo !== base) continue;
    if (existsSync(archivo) && statSync(archivo).isFile()) {
      respuesta.writeHead(200, { "content-type": TIPOS[extname(archivo)] ?? "application/octet-stream" });
      return respuesta.end(readFileSync(archivo));
    }
  }
  const noEncontrada = join(base, "404.html");
  respuesta.writeHead(404, { "content-type": "text/html; charset=utf-8" });
  return respuesta.end(existsSync(noEncontrada) ? readFileSync(noEncontrada) : "404");
}
