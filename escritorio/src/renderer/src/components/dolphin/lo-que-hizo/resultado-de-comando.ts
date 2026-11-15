/**
 * Qué dijo un comando, en pocas palabras: «1 falló», «12 pasaron», «salió con 2». La forma, no el
 * texto: lo traduce la tarjeta (`TarjetaLoQueHizo.tsx`).
 *
 * Sólo se dice lo que la salida dice. Los conteos de tests se leen de los formatos que imprimen
 * vitest, jest, pytest, mocha, go test y cargo test; si no hay conteo y el comando falló, se dice
 * que falló (con el código si el transcript lo trae). Si salió bien y no hay conteo, no se agrega
 * nada: «Corrió npm run build» ya lo dice todo.
 */
export type DetalleDeComando =
  | { readonly tipo: 'fallaron' | 'pasaron' | 'codigo'; readonly n: number }
  | { readonly tipo: 'fallo' }

export type ResultadoDeComando = {
  readonly fallo: boolean
  readonly detalle: DetalleDeComando | null
}

const FALLARON = /\b(\d+)\s+(?:failed|failing|failures?)\b/i
const PASARON = /\b(\d+)\s+(?:passed|passing)\b/i
const CARGO = /test result: \w+\. (\d+) passed; (\d+) failed/i
const GO_FALLO = /^--- FAIL:/m

function conteo(salida: string): { fallaron: number; pasaron: number } | null {
  const cargo = CARGO.exec(salida)
  if (cargo) {
    return { pasaron: Number(cargo[1]), fallaron: Number(cargo[2]) }
  }
  const fallaron = FALLARON.exec(salida)
  const pasaron = PASARON.exec(salida)
  if (!fallaron && !pasaron) {
    return null
  }
  return { fallaron: fallaron ? Number(fallaron[1]) : 0, pasaron: pasaron ? Number(pasaron[1]) : 0 }
}

export function resultadoDeComando(
  salida: string,
  codigo: number | undefined,
  marcadoComoError: boolean
): ResultadoDeComando {
  const tests = conteo(salida)
  const salioMal = marcadoComoError || (typeof codigo === 'number' && codigo !== 0)
  if (tests && tests.fallaron > 0) {
    return { fallo: true, detalle: { tipo: 'fallaron', n: tests.fallaron } }
  }
  if (tests && tests.pasaron > 0 && !salioMal) {
    return { fallo: false, detalle: { tipo: 'pasaron', n: tests.pasaron } }
  }
  if (GO_FALLO.test(salida)) {
    return { fallo: true, detalle: { tipo: 'fallo' } }
  }
  if (salioMal) {
    return {
      fallo: true,
      detalle:
        typeof codigo === 'number' && codigo !== 0
          ? { tipo: 'codigo', n: codigo }
          : { tipo: 'fallo' }
    }
  }
  return { fallo: false, detalle: null }
}
