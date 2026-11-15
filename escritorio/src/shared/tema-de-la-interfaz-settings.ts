/** El ajuste del tema propio de la interfaz, en su propio módulo como los demás grupos. */

import { tokensDelTema, type PerillasDelTema, type TokensDelTema } from './tema-de-la-interfaz'

/**
 * Los colores que eligió la persona, o nada.
 *
 * Ausente significa «el tema que trae la app», no «un tema gris por defecto»: mientras nadie toque
 * las perillas, la interfaz es exactamente la de siempre. Personalizar es una decisión, y una
 * decisión que no se tomó no tiene que cambiar nada.
 */
export type TemaDeLaInterfazSettings = {
  temaPropio?: {
    /** Apagado deja el tema de la app sin borrar lo que la persona había elegido. */
    activo?: boolean
    claro?: PerillasDelTema
    oscuro?: PerillasDelTema
  }
}

/**
 * Los tokens que hay que pisar, o null si no hay que pisar ninguno.
 *
 * Null en dos casos distintos a propósito: cuando no hay tema propio, y cuando las perillas no
 * forman colores válidos. Los dos terminan igual —la app se queda con su tema— y eso es lo que
 * corresponde: un valor guardado roto no puede dejar la interfaz a medio pintar.
 */
export function tokensDelTemaElegido(
  ajuste: TemaDeLaInterfazSettings['temaPropio'],
  oscuro: boolean
): TokensDelTema | null {
  if (!ajuste || ajuste.activo === false) {
    return null
  }
  const perillas = oscuro ? ajuste.oscuro : ajuste.claro
  return perillas ? tokensDelTema(perillas) : null
}
