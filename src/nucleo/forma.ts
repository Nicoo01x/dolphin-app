import type { Forma } from "./tipos.js";
import { cambiosDe, diffDe, type Cambio } from "./cambios.js";
import { asercionesQuitadasDeDiff, hallazgosDeTrampas } from "./trampas.js";
import { testsCambiadosDe } from "./tests-intactos.js";

/**
 * Cuánto cambió un universo.
 *
 * Es lo único que mira `elegir` para decidir quién es el más simple, así
 * que acá se define en la práctica qué significa "simple" en Dolphin:
 * archivos tocados, líneas movidas y —sobre todo— dependencias nuevas.
 *
 * Los archivos nuevos cuentan (un agente que resuelve creando un archivo
 * —el enfoque «test primero» hace eso— se medía como «no tocó nada» y se
 * lo mataba), y lo que Dolphin le agregó al worktree no (un `.env` copiado
 * hacía que toda rama «tocara un archivo» antes de empezar): ver cambios.ts.
 */
export async function medirForma(ruta: string, contra = "HEAD"): Promise<Forma> {
  const [cambios, paquete, diff] = await Promise.all([
    cambiosDe(ruta, contra),
    diffDe(ruta, contra, ["package.json"]).catch(() => ""),
    diffDe(ruta, contra),
  ]);
  const { archivos, agregadas, quitadas, tocados } = resumenDeCambios(cambios);
  const aserciones = asercionesQuitadasDeDiff(diff);
  const testsCambiados = testsCambiadosDe(cambios).map((test) => {
    const cantidad = aserciones.get(test.ruta);
    return cantidad ? { ...test, asercionesQuitadas: cantidad } : test;
  });
  return {
    archivos,
    agregadas,
    quitadas,
    dependenciasNuevas: contarDependenciasNuevas(paquete),
    tocados,
    // Los tests que ya existían y la rama cambió: el truco de ponerse verde
    // tocando la prueba. Sumar tests no entra acá. Siempre, aunque vacío:
    // así la consola distingue «no cambió ninguno» de una cosecha vieja que no lo medía.
    testsCambiados,
    trampas: hallazgosDeTrampas(diff),
  };
}

/** Archivos, líneas y la lista de lo tocado (hasta 30, que es lo que entra en la consola). */
export function resumenDeCambios(cambios: readonly Cambio[]): {
  archivos: number;
  agregadas: number;
  quitadas: number;
  tocados: { ruta: string; agregadas: number; quitadas: number }[];
} {
  let agregadas = 0;
  let quitadas = 0;
  for (const c of cambios) {
    // Un binario no tiene líneas: cuenta como archivo.
    agregadas += c.agregadas;
    quitadas += c.quitadas;
  }
  const tocados = cambios.slice(0, 30).map((c) => ({ ruta: c.ruta, agregadas: c.agregadas, quitadas: c.quitadas }));
  return { archivos: cambios.length, agregadas, quitadas, tocados };
}

/** Las claves de package.json que tienen forma de «nombre: versión» y no son dependencias. */
const NO_SON_DEPENDENCIAS = new Set(["name", "version", "description", "license", "main", "module", "types", "typings", "node", "npm", "pnpm", "yarn", "bun", "packageManager"]);

/**
 * Una dependencia nueva se paga para siempre, así que vale más que cien
 * líneas a la hora de elegir. Se cuentan los paquetes que aparecen en las
 * líneas agregadas del diff de package.json y no en las quitadas: subirle
 * la versión a uno que ya estaba no es sumar una dependencia, ni lo es el
 * `"version"` del propio paquete o un `engines`.
 */
export function contarDependenciasNuevas(diffDePackageJson: string): number {
  const nombres = (signo: "+" | "-") =>
    new Set(
      diffDePackageJson
        .split("\n")
        .filter((l) => l.startsWith(signo) && !l.startsWith(signo.repeat(3)))
        .map((l) => /^[+-]\s*"([^"]+)"\s*:\s*"[~^>=<* \d][^"]*"\s*,?\s*$/.exec(l)?.[1])
        .filter((n): n is string => n !== undefined && !NO_SON_DEPENDENCIAS.has(n)),
    );
  const quitados = nombres("-");
  return [...nombres("+")].filter((n) => !quitados.has(n)).length;
}
