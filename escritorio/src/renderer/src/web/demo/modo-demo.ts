import type { RuntimeRpcResponse } from '../../../../shared/runtime-rpc-envelope'
import { RESPUESTAS_DE_DEMO } from './datos-de-demo'

/**
 * El modo demo del cliente web: la app de verdad, sin ningún servidor del otro lado.
 *
 * Es el mismo renderer que se instala —los mismos componentes, el mismo store, la misma pantalla—
 * servido en una página pública. Lo único que cambia es de dónde salen los datos: en vez de hablar
 * por WebSocket con un runtime emparejado, cada llamada se contesta desde un guion escrito acá.
 *
 * Why acá y no en cada `create*Api`: TODAS las llamadas al runtime pasan por un embudo
 * (`callRuntimeEnvelope` en `../preload-api/web-runtime-calls.ts`). Interceptando ese único punto,
 * la app entera queda en modo demo sin tocar ninguno de los cuarenta módulos del API web, y sin
 * que el código de producto se entere de que existe una demo.
 *
 * Why no apuntarla a un runtime real: un runtime de verdad detrás de una página pública es una
 * máquina con un repo adentro, expuesta a cualquiera que entre. La demo muestra el producto, no
 * presta una computadora.
 *
 * Lo que no está en el guion NO inventa datos: contesta un fallo con su código. La app ya sabe
 * convivir con eso —cada API tiene su `.catch(() => <vacío>)`— así que una pantalla sin guion se
 * ve vacía en vez de romperse, y queda anotada para completarla.
 */

/** La bandera en la URL: `?demo=1`. Se lee una sola vez, al arrancar. */
const PARAMETRO = 'demo'

let decidido: boolean | null = null

export function enModoDemo(): boolean {
  if (decidido !== null) {
    return decidido
  }
  decidido = leerBandera()
  return decidido
}

function leerBandera(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  try {
    return new URLSearchParams(window.location.search).get(PARAMETRO) === '1'
  } catch {
    // Una URL rara no puede dejar la app sin arrancar: sin bandera legible, no hay demo.
    return false
  }
}

/** Sólo para los tests: vuelve a leer la bandera en la próxima consulta. */
export function olvidarModoDemo(): void {
  decidido = null
}

/** Los métodos que la app pidió y el guion no tiene. Sirve para saber qué falta completar. */
const pedidosSinGuion = new Set<string>()

export function metodosSinGuion(): readonly string[] {
  return [...pedidosSinGuion].sort()
}

/**
 * La respuesta del guion para una llamada.
 *
 * Devuelve siempre un sobre, nunca lanza: quien llama espera un `RuntimeRpcResponse` y la mitad
 * de los llamadores de la app leen `response.ok` sin envolver en try/catch.
 */
export function respuestaDeDemo<TResult>(
  method: string,
  params?: unknown
): RuntimeRpcResponse<TResult> {
  const guion = RESPUESTAS_DE_DEMO[method]
  if (!guion) {
    pedidosSinGuion.add(method)
    return {
      id: `demo-${method}`,
      ok: false,
      error: {
        code: 'demo_sin_guion',
        message: `La demo no tiene guion para «${method}».`
      },
      _meta: { runtimeId: null }
    }
  }
  return {
    id: `demo-${method}`,
    ok: true,
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: el guion declara el resultado de cada método; el tipo lo pone quien llama.
    result: guion(params) as TResult,
    _meta: { runtimeId: 'demo' }
  }
}
