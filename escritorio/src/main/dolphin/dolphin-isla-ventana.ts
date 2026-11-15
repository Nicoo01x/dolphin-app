import { screen, type BrowserWindowConstructorOptions } from 'electron'
import type { PosicionDeIsla } from '../../shared/dolphin-isla-types'
import { posicionGuardadaDeIsla, type AreaDePantalla } from './dolphin-isla-posicion'

/** Al nacer; enseguida la página pide lo que mide su forma (compacta, aviso o abierta). */
export const ANCHO_ISLA = 420
export const ALTO_ISLA = 56
// Los límites de lo que la página puede pedir, en sus píxeles (con zoom se multiplican).
const ANCHO_MINIMO_ISLA = 200
const ANCHO_MAXIMO_ISLA = 480
const ALTO_MINIMO_ISLA = 48
export const ALTO_MAXIMO_ISLA = 560

/**
 * Cómo nace la ventana de la isla: sin marco, transparente (lo que se ve es la pastilla que dibuja
 * la página), siempre arriba, fuera de la barra de tareas y centrada arriba de la pantalla principal.
 * Redimensionable sin borde (thickFrame false): la página le pide el tamaño en cada cambio de forma,
 * y en Windows una ventana no redimensionable ignora ese pedido.
 */
export function opcionesDeVentanaIsla(posicion?: PosicionDeIsla): BrowserWindowConstructorOptions {
  const area = screen.getPrimaryDisplay().workArea
  const pantallas: AreaDePantalla[] = screen.getAllDisplays().map((display) => ({
    id: display.id,
    ...display.workArea
  }))
  const bounds = posicionGuardadaDeIsla(posicion, ANCHO_ISLA, ALTO_ISLA, pantallas, {
    id: screen.getPrimaryDisplay().id,
    ...area
  })
  return {
    width: ANCHO_ISLA,
    height: ALTO_ISLA,
    x: bounds.x,
    y: bounds.y,
    minWidth: ANCHO_MINIMO_ISLA,
    minHeight: ALTO_MINIMO_ISLA,
    frame: false,
    thickFrame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'Dolphin'
  }
}

const acotar = (valor: number, minimo: number, maximo: number): number =>
  Math.round(Math.min(Math.max(valor, minimo), maximo))

/**
 * El tamaño de la ventana para lo que mide la página. La página mide en sus píxeles y, con el zoom
 * de la interfaz, la ventana necesita `zoom` veces eso (los topes crecen con el zoom).
 */
export function tamanoDeIsla(pedido: unknown, zoom = 1): { ancho: number; alto: number } | null {
  if (!pedido || typeof pedido !== 'object') {
    return null
  }
  const { ancho, alto } = pedido as Record<string, unknown>
  if (typeof ancho !== 'number' || !Number.isFinite(ancho)) {
    return null
  }
  if (typeof alto !== 'number' || !Number.isFinite(alto)) {
    return null
  }
  const factor = Number.isFinite(zoom) && zoom > 0 ? zoom : 1
  return {
    ancho: acotar(ancho * factor, ANCHO_MINIMO_ISLA, ANCHO_MAXIMO_ISLA * factor),
    alto: acotar(alto * factor, ALTO_MINIMO_ISLA, ALTO_MAXIMO_ISLA * factor)
  }
}
