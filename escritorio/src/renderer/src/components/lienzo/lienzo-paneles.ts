import type { Rect } from './canvas'

/**
 * Las ventanas del lienzo: qué es cada una y dónde está.
 *
 * La geometría —el zoom, el encuadre, el imán, la inercia— vive en `canvas/`, portado de Tallow.
 * Acá queda solo lo que es de Dolphin: qué puede haber adentro de una ventana y el orden en que
 * se apilan.
 */

export type TipoDePanel = 'consola' | 'terminal' | 'archivos' | 'navegador'

export type PanelDelLienzo = {
  readonly id: string
  readonly tipo: TipoDePanel
  readonly titulo: string
  /** La vista de la consola, la ruta o la rama: lo chico debajo del título. */
  readonly subtitulo?: string
  /** En coordenadas del plano, no de la pantalla: el zoom no las cambia. */
  readonly rect: Rect
  /**
   * Dónde estaba antes de agrandarla, si está agrandada.
   *
   * Que viva acá y no en un estado aparte es a propósito: así se guarda con la disposición y una
   * ventana que quedó agrandada al cerrar la app vuelve agrandada, y todavía sabe a qué tamaño
   * achicarse. Con el dato afuera, «volver» perdía el destino en cada reinicio.
   */
  readonly antesDeAgrandar?: Rect
}

/** Menos que esto no es una ventana: no entra ni su cabecera. */
export const LIMITES = { minWidth: 280, minHeight: 160 } as const

/** El panel tocado va último en la lista, que es el que se dibuja arriba. */
export function traerAlFrente(paneles: readonly PanelDelLienzo[], id: string): PanelDelLienzo[] {
  const cual = paneles.find((p) => p.id === id)
  return cual ? [...paneles.filter((p) => p.id !== id), cual] : [...paneles]
}

/**
 * Deja un panel con otro rectángulo; los demás quedan como estaban.
 *
 * Mover o estirar una ventana agrandada la deja de agrandar: si no, el botón de volver la
 * mandaría de golpe a un lugar que ya no tiene nada que ver con donde la pusiste.
 */
export function conRect(
  paneles: readonly PanelDelLienzo[],
  id: string,
  rect: Rect
): PanelDelLienzo[] {
  return paneles.map((p) => {
    if (p.id !== id) {
      return p
    }
    const { antesDeAgrandar: _ya, ...resto } = p
    return { ...resto, rect }
  })
}

/**
 * Agranda una ventana a todo lo que se ve, o la devuelve a donde estaba.
 *
 * `aLaVista` viene en coordenadas del plano, con lo que tapa el chrome ya descontado: una ventana
 * agrandada hasta abajo del dock se come su propia barra de zoom.
 */
export function agrandarOVolver(
  paneles: readonly PanelDelLienzo[],
  id: string,
  aLaVista: Rect
): PanelDelLienzo[] {
  return paneles.map((p) => {
    if (p.id !== id) {
      return p
    }
    if (p.antesDeAgrandar) {
      const { antesDeAgrandar, ...resto } = p
      return { ...resto, rect: antesDeAgrandar }
    }
    return { ...p, rect: aLaVista, antesDeAgrandar: p.rect }
  })
}

/** Contra qué se imanta el que se está moviendo: contra todos menos él mismo. */
export function losOtros(paneles: readonly PanelDelLienzo[], id: string): Rect[] {
  return paneles.filter((p) => p.id !== id).map((p) => p.rect)
}

export const rectsDe = (paneles: readonly PanelDelLienzo[]): Rect[] => paneles.map((p) => p.rect)
