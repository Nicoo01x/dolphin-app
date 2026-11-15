import { cambiosDe, diffDe, type Cambio } from "./cambios.js";
import { asercionesQuitadasDeDiff, resumirTrampas, trampasDe } from "./trampas.js";
import type { HallazgoTrampa, Verificador } from "./tipos.js";

/**
 * El truco más viejo para ponerse verde: cambiar la prueba en vez del
 * código. Sumar tests está bien —es lo que hace el enfoque «test
 * primero»—; lo que se vigila es tocar los que ya existían: quitarles o
 * cambiarles líneas, o borrarlos.
 *
 * Hay tres políticas, en `"testsExistentes"` de dolphin.config.json:
 * «avisar» (la de siempre: la consola la marca y quien mergea decide),
 * «aprobar» (mergearla o abrirle un PR exige una aprobación explícita) y
 * «cortar» (se corta en esta fase, gratis, antes de correr nada). Con
 * cualquiera, al elegir pierde contra una rama que dejó las pruebas en paz.
 */

export const ES_TEST = /(\.test\.|\.spec\.|(^|\/)tests?\/|__tests__)/i;

export interface TestCambiado {
  readonly ruta: string;
  /** Cuántas líneas le sacó o le cambió; un borrado cuenta el archivo entero. */
  readonly quitadas: number;
  readonly borrado?: boolean;
  readonly asercionesQuitadas?: number;
}

/** Los tests que ya existían y la rama cambió. Los agregados no cuentan: sumar pruebas está bien. */
export async function testsCambiados(ruta: string, contra = "HEAD"): Promise<TestCambiado[]> {
  const [cambios, diff] = await Promise.all([cambiosDe(ruta, contra), diffDe(ruta, contra)]);
  const aserciones = asercionesQuitadasDeDiff(diff);
  return testsCambiadosDe(cambios).map((test) => {
    const cantidad = aserciones.get(test.ruta);
    return cantidad ? { ...test, asercionesQuitadas: cantidad } : test;
  });
}

/**
 * Sin renombres (ver cambios.ts): mover un test a otro nombre es borrar el
 * viejo, y se ve. Con renombres, `{a => b}` no cruzaba entre las dos
 * salidas de git y un test renombrado al que le sacaron casos pasaba limpio.
 */
export function testsCambiadosDe(cambios: readonly Cambio[]): TestCambiado[] {
  const cambiados: TestCambiado[] = [];
  for (const c of cambios) {
    if (!ES_TEST.test(c.ruta)) continue;
    if (c.estado === "D") cambiados.push({ ruta: c.ruta, quitadas: c.quitadas, borrado: true });
    // Agregarle casos a un test que ya existía está bien: lo que cuenta es sacarle.
    else if ((c.estado === "M" || c.estado === "T") && c.quitadas > 0) cambiados.push({ ruta: c.ruta, quitadas: c.quitadas });
  }
  return cambiados;
}

export function contarCambios(cambiados: readonly TestCambiado[]): string {
  return cambiados
    .slice(0, 3)
    .map((t) => `${t.borrado ? `borró ${t.ruta}` : `${t.ruta} (−${t.quitadas})`}${t.asercionesQuitadas ? `; sacó ${t.asercionesQuitadas} expect/assert` : ""}`)
    .join(", ") + (cambiados.length > 3 ? ` y ${cambiados.length - 3} más` : "");
}

/**
 * Con la política «aprobar», por qué la rama elegida necesita tu visto
 * bueno antes de mergearla o abrirle un PR; `null` si no lo necesita.
 */
export function motivoDeAprobacion(
  politica: "avisar" | "aprobar" | "cortar" | undefined,
  ganador: { readonly forma?: { readonly testsCambiados?: readonly TestCambiado[]; readonly trampas?: readonly HallazgoTrampa[] } } | undefined,
): string | null {
  const cambiados = ganador?.forma?.testsCambiados ?? [];
  const trampas = ganador?.forma?.trampas ?? [];
  if (politica !== "aprobar" || (cambiados.length === 0 && trampas.length === 0)) return null;
  const partes = [];
  if (cambiados.length > 0) partes.push(`cambió pruebas que ya existían — ${contarCambios(cambiados)}`);
  if (trampas.length > 0) partes.push(`detectó trampas — ${resumirTrampas(trampas)}`);
  return partes.join("; ");
}

export function verificadorDeTestsIntactos(): Verificador {
  return {
    nombre: "tests intactos",
    costo: "gratis",
    async correr(universo) {
      const [cambiados, trampas] = await Promise.all([testsCambiados(universo.ruta), trampasDe(universo.ruta)]);
      if (cambiados.length === 0 && trampas.length === 0) return { paso: true, detalle: "tests intactos: no tocó las pruebas que ya existían ni agregó trampas", gastado: 0 };
      const partes = [];
      if (cambiados.length > 0) partes.push(`cambió pruebas que ya existían — ${contarCambios(cambiados)}`);
      if (trampas.length > 0) partes.push(`detectó trampas — ${resumirTrampas(trampas)}`);
      return {
        paso: false,
        detalle: `tests intactos: ${partes.join("; ")}. Para ponerse verde se arregla el código, no la prueba`,
        evidencia: JSON.stringify({ cambiados, trampas }),
        gastado: 0,
      };
    },
  };
}
