/** El ajuste del Tab predictivo, en su propio módulo como los demás grupos. */

/**
 * Hasta dónde llega la predicción de la próxima edición.
 *
 * Son tres escalones y no un booleano porque cuestan cosas distintas, y la persona tiene que poder
 * elegir qué paga:
 *
 * - `apagada`: no corre nada. Es la única que no gasta ni memoria ni plata.
 * - `local`: sólo lo que se deduce de la edición que acabás de hacer —renombrar algo y ver los
 *   otros lugares que lo dicen—. No hay modelo, no hay red: se resuelve con el texto que ya está
 *   en memoria, así que responde al instante y nunca inventa. Es el default.
 * - `con-modelo`: además le pregunta a un modelo por lo que el camino local no puede deducir
 *   (cambiar la forma de una función y reescribir cada llamada distinto). Eso gasta cuota y suma
 *   latencia, así que se prende a mano.
 */
export type AlcanceDePrediccion = 'apagada' | 'local' | 'con-modelo'

export const ALCANCE_DE_PREDICCION_POR_DEFECTO: AlcanceDePrediccion = 'local'

export type PrediccionDeEdicionSettings = {
  /**
   * El Tab predictivo del editor. Ausente vale `local`.
   *
   * Por qué el default no es `apagada`: el escalón local no abre procesos ni pide red — es una
   * búsqueda de texto sobre el archivo abierto. Y por qué no es `con-modelo`: eso sí gasta, y lo
   * que gasta plata lo prende la persona.
   */
  prediccionDeEdicion?: AlcanceDePrediccion
}

export function resolverAlcanceDePrediccion(
  valor: AlcanceDePrediccion | undefined
): AlcanceDePrediccion {
  return valor === 'apagada' || valor === 'con-modelo' || valor === 'local'
    ? valor
    : ALCANCE_DE_PREDICCION_POR_DEFECTO
}

/** Si en este escalón hay que mirar la edición anterior para proponer la próxima. */
export function prediccionLocalActiva(valor: AlcanceDePrediccion | undefined): boolean {
  return resolverAlcanceDePrediccion(valor) !== 'apagada'
}

/** Si además hay que gastar en preguntarle a un modelo. */
export function prediccionConModeloActiva(valor: AlcanceDePrediccion | undefined): boolean {
  return resolverAlcanceDePrediccion(valor) === 'con-modelo'
}
