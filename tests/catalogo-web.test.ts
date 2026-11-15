import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { CUANTAS_FUNCIONES, FUNCIONES, TODAS_LAS_FUNCIONES } from "../web/src/lib/funciones.js";

/**
 * El catálogo de la web dice que cada función existe de verdad y que `archivo` dice dónde está,
 * «para poder abrirla y comprobarla». Esa promesa sin un test se rompe sola: alcanza con mover un
 * archivo o renombrar un módulo para que el sitio público mande a la gente a una ruta que no
 * existe, y nadie se entera hasta que alguien la busca.
 *
 * Este test NO opina sobre qué dice cada función: vigila que lo que se promete sea comprobable.
 */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("el catálogo de la web", () => {
  it("tiene el inventario entero, no una muestra", () => {
    expect(CUANTAS_FUNCIONES).toBeGreaterThan(100);
    expect(FUNCIONES.length).toBeGreaterThanOrEqual(8);
  });

  it("cada función apunta a un archivo que existe en el repo", () => {
    const perdidas = TODAS_LAS_FUNCIONES.filter((f) => !existsSync(join(RAIZ, f.archivo))).map((f) => `${f.id} → ${f.archivo}`);
    expect(perdidas).toEqual([]);
  });

  it("los ids no se repiten: son el ancla de cada ficha", () => {
    const vistos = new Set<string>();
    const repetidos = TODAS_LAS_FUNCIONES.filter((f) => (vistos.has(f.id) ? true : (vistos.add(f.id), false))).map((f) => f.id);
    expect(repetidos).toEqual([]);
  });

  it("todo comando que se muestra se puede escribir en algún lado del producto", () => {
    // Tres formas, y ninguna más: el comando de la terminal (`dolphin …`), lo que se tipea adentro
    // de la app de terminal (`/algo`) y un atajo de teclado. Cualquier otra cosa es una línea
    // suelta que alguien va a copiar y no le va a andar.
    const sePuedeEscribir = (c: string) => c.startsWith("dolphin ") || c.startsWith("/") || /^(Ctrl|Alt|Shift|Cmd)\+/.test(c);
    const raros = TODAS_LAS_FUNCIONES.filter((f) => f.comando && !sePuedeEscribir(f.comando)).map((f) => `${f.id}: ${f.comando}`);
    expect(raros).toEqual([]);
  });

  it("lo que está en camino dice qué le falta: una lista que promete lo que no anda es peor que una corta", () => {
    const sinExplicar = TODAS_LAS_FUNCIONES.filter((f) => f.enCamino && !f.queFalta).map((f) => f.id);
    expect(sinExplicar).toEqual([]);
  });
});
