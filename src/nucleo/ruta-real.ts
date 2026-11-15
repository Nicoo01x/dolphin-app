import { realpathSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

/**
 * La ruta como la escribe git: sin nombres cortos 8.3 (`RUNNER~1`), sin enlaces ni junctions en el
 * camino. Git guarda en `.git/worktrees/<id>/gitdir` la ruta REAL del worktree, y Dolphin arma las
 * suyas con `os.tmpdir()`, que en Windows puede venir corta (el runner de GitHub da
 * `C:\Users\RUNNER~1\…`) o pasar por un enlace (en macOS, `/var` es `/private/var`). Comparar las
 * dos sin pasarlas por acá dice «no es la misma» de una carpeta que sí lo es.
 *
 * Sirve también para una ruta que ya no existe: se resuelve el tramo que existe y se le pega el
 * resto tal cual. Es justo el caso de un worktree cuya carpeta se borró.
 */
export function rutaReal(ruta: string): string {
  const absoluta = resolve(ruta);
  let actual = absoluta;
  let resto: string[] = [];
  for (;;) {
    try {
      return join(realpathSync.native(actual), ...resto);
    } catch {
      const padre = dirname(actual);
      if (padre === actual) return absoluta;
      resto = [basename(actual), ...resto];
      actual = padre;
    }
  }
}

/** Si dos rutas son la misma carpeta, escritas como sea (ver `rutaReal`). En Windows, sin mayúsculas. */
export function mismaRuta(a: string, b: string): boolean {
  const clave = (r: string) => {
    const real = rutaReal(r).replace(/\\/g, "/").replace(/\/+$/, "");
    return process.platform === "win32" ? real.toLowerCase() : real;
  };
  return clave(a) === clave(b);
}
