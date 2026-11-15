import { centerOn, clampZoom, lerpViewport, ZOOM_MAX, ZOOM_MIN } from './canvas'
import type { Insets, Point, Rect, Size, ViewportTransform } from './canvas'

/**
 * Cómo se mueve la cámara del lienzo: los saltos de zoom y los viajes con animación.
 *
 * Los dos son de Deska (`apps/desktop/src/renderer/src/controllers/viewport.ts`).
 *
 * El zoom va por una escalera de valores fijos y no multiplicando por un factor. Parece un
 * detalle y no lo es: multiplicando por 1,2 la pastilla marca 45 %, 54 %, 65 %, y nunca caés
 * justo en 100 %. Con la escalera, los pasos son los mismos que los de cualquier herramienta de
 * diseño y el 100 % está siempre a un clic.
 */
export const PASOS_DE_ZOOM = [0.3, 0.4, 0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 2.5, 3] as const

/** El escalón siguiente para arriba o para abajo; en las puntas, el tope. */
export function siguienteZoom(actual: number, hacia: 1 | -1): number {
  if (hacia > 0) {
    return PASOS_DE_ZOOM.find((p) => p > actual + 0.001) ?? ZOOM_MAX
  }
  return PASOS_DE_ZOOM.toReversed().find((p) => p < actual - 0.001) ?? ZOOM_MIN
}

/**
 * La curva del viaje: `1 - (1-t)⁴`, la de Deska.
 *
 * Arranca rápido y llega frenando largo, que es lo que hace que un salto de un lado del plano
 * al otro se lea como un viaje y no como un corte.
 */
export const curvaDelVuelo = (t: number): number => 1 - (1 - t) ** 4

export type Vuelo = {
  /** Qué vista toca en este instante, o `null` cuando el viaje terminó. */
  readonly paso: (ahora: number) => ViewportTransform | null
}

/**
 * Prepara un viaje de la vista actual a otra. No toca nada por sí solo: devuelve la función que
 * dice dónde está la cámara en cada cuadro, y quien la llama decide cuándo pedirle el próximo.
 *
 * Así se puede probar sin un `requestAnimationFrame` de mentira.
 */
export function prepararVuelo(
  desde: ViewportTransform,
  hasta: ViewportTransform,
  medida: Size,
  { arranca, duracion = 260 }: { arranca: number; duracion?: number }
): Vuelo {
  return {
    paso: (ahora: number): ViewportTransform | null => {
      const t = Math.min(1, (ahora - arranca) / duracion)
      if (t >= 1) {
        return null
      }
      return lerpViewport(desde, hasta, curvaDelVuelo(t), medida)
    }
  }
}

/** A dónde hay que ir para que un punto del plano quede en el medio de lo que se ve. */
export function vistaQueCentra(
  punto: Point,
  medida: Size,
  zoom: number,
  loQueTapa: Insets
): ViewportTransform {
  return centerOn(punto, medida, clampZoom(zoom), loQueTapa)
}

/** El aire que queda alrededor de una ventana cuando se la va a buscar. */
const AIRE_AL_REVELAR = 80

/**
 * Con qué zoom mostrar una ventana a la que se va a buscar, portado del `reveal` de Deska.
 *
 * Dos reglas, y las dos importan: **nunca aleja** —si estabas trabajando de cerca, ir a ver otra
 * ventana no te saca de donde estabas—, y **no pasa del 100 %**, porque agrandar una ventana más
 * allá de su tamaño real no agrega nada para leer. En el medio, acerca lo justo para que entre
 * con aire.
 */
export function zoomParaRevelar(rect: Rect, aLaVista: Size, zoomActual: number): number {
  const entra = Math.min(
    1,
    (aLaVista.width - AIRE_AL_REVELAR) / rect.width,
    (aLaVista.height - AIRE_AL_REVELAR) / rect.height
  )
  return clampZoom(Math.max(zoomActual, entra))
}
