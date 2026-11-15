/**
 * El worker de TypeScript que trae Monaco, y cuándo se calla.
 *
 * Monaco corre su propio TypeScript en un worker y contesta hover, completado, definición… con lo
 * que ve: sólo los archivos abiertos, sin el tsconfig ni las dependencias del proyecto. Con un
 * servidor de lenguaje atendiendo, eso es una segunda respuesta, peor, pegada a la buena: dos
 * hovers, el completado repetido, la definición en un peek en vez de saltar.
 *
 * Así que mientras haya un servidor vivo para el lenguaje, lo que el servidor cubre se le apaga al
 * worker; y vuelve apenas no hay servidor (no arrancó, se cayó, se cerró el último archivo): sin
 * servidor, mejor el worker que nada. Lo demás del worker —colores de sintaxis, símbolos, plegado,
 * formateo por rango— sigue igual.
 *
 * Es por lenguaje y no por archivo porque así es la configuración de Monaco: una sola para todo
 * `typescript` y otra para todo `javascript`.
 */

import type { typescript } from 'monaco-editor'

/** Lo que el servidor de lenguaje cubre y por eso se le apaga al worker. */
export const LO_QUE_CUBRE_EL_SERVIDOR = [
  'completionItems',
  'hovers',
  'definitions',
  'references',
  'rename',
  'signatureHelp',
  // Con marcas del servidor en el modelo, el worker armaba sus propios arreglos con esos códigos.
  'codeActions'
] as const satisfies readonly (keyof typescript.ModeConfiguration)[]

/** La parte de `monaco.typescript.typescriptDefaults` que se usa acá. */
export type DefaultsDelWorker = Pick<
  typescript.LanguageServiceDefaults,
  'modeConfiguration' | 'setModeConfiguration'
>

type MonacoConWorker = {
  readonly typescript?: {
    readonly typescriptDefaults?: DefaultsDelWorker
    readonly javascriptDefaults?: DefaultsDelWorker
  }
}

export function defaultsDelWorker(
  monaco: MonacoConWorker,
  lenguaje: string
): DefaultsDelWorker | undefined {
  if (lenguaje === 'typescript') {
    return monaco.typescript?.typescriptDefaults
  }
  if (lenguaje === 'javascript') {
    return monaco.typescript?.javascriptDefaults
  }
  return undefined
}

/**
 * Prende o apaga lo que el servidor cubre. No toca nada si ya está como tiene que estar: cambiar la
 * configuración reinicia el worker, y eso no se paga en cada archivo que se abre.
 */
export function ajustarWorkerDeTs(
  defaults: DefaultsDelWorker | undefined,
  hayServidor: boolean
): void {
  if (!defaults) {
    return
  }
  const actual = defaults.modeConfiguration
  const prendido = !hayServidor
  if (LO_QUE_CUBRE_EL_SERVIDOR.every((clave) => (actual[clave] ?? true) === prendido)) {
    return
  }
  const cambios = Object.fromEntries(LO_QUE_CUBRE_EL_SERVIDOR.map((clave) => [clave, prendido]))
  defaults.setModeConfiguration({ ...actual, ...cambios })
}
