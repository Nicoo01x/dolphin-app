import type { Point, Rect, Size } from './canvas'

/**
 * La cuenta del minimapa: llevar el plano entero a un rectángulo de 142×88.
 *
 * Portado de Deska (`apps/desktop/src/renderer/src/chrome/Dock.tsx`, función `Minimap`), que es
 * de donde sale el lienzo entero. Lo único propio es que acá vive aparte y con tests: la
 * proyección es la que decide si un clic cae donde uno miraba, y eso no se verifica a ojo.
 *
 * Dos decisiones que vienen de allá y conviene no deshacer:
 *
 * 1. **Lo que entra en el mapa es la unión de las ventanas Y de lo que se está viendo.** Sin el
 *    segundo, al alejarte de todas las ventanas el rectángulo de la vista se sale del mapa y el
 *    minimapa deja de decir dónde estás, que es justo cuando lo mirás.
 * 2. **Un margen de 40 en coordenadas del plano**, no en píxeles del mapa: así el aire de
 *    alrededor se achica cuando el plano crece, en vez de comerse el mapa.
 */

/** Cuánto aire alrededor de todo lo que entra, en coordenadas del plano. */
const MARGEN = 40

export type Proyeccion = {
  /** De coordenadas del plano a píxeles del mapa. */
  readonly escala: number
  /** Dónde arranca el contenido adentro del mapa, ya centrado. */
  readonly ox: number
  readonly oy: number
  /** La esquina del mundo que corresponde al origen. */
  readonly minX: number
  readonly minY: number
}

/** Qué pedazo del plano tiene que entrar: las ventanas y lo que se está mirando. */
export function loQueEntra(ventanas: readonly Rect[], aLaVista: Rect): Rect {
  let minX = aLaVista.x
  let minY = aLaVista.y
  let maxX = aLaVista.x + aLaVista.width
  let maxY = aLaVista.y + aLaVista.height
  for (const v of ventanas) {
    minX = Math.min(minX, v.x)
    minY = Math.min(minY, v.y)
    maxX = Math.max(maxX, v.x + v.width)
    maxY = Math.max(maxY, v.y + v.height)
  }
  return {
    x: minX - MARGEN,
    y: minY - MARGEN,
    width: maxX - minX + MARGEN * 2,
    height: maxY - minY + MARGEN * 2
  }
}

/** La escala y el corrimiento para que `mundo` entre centrado en un mapa de `caja`. */
export function proyeccionDelMinimapa(mundo: Rect, caja: Size): Proyeccion {
  const escala = Math.min(caja.width / mundo.width, caja.height / mundo.height)
  return {
    escala,
    ox: (caja.width - mundo.width * escala) / 2,
    oy: (caja.height - mundo.height * escala) / 2,
    minX: mundo.x,
    minY: mundo.y
  }
}

/**
 * Un rectángulo del plano, en píxeles del mapa.
 *
 * El mínimo de 2 px es de Deska: una ventana chica vista desde muy lejos da menos de un píxel y
 * desaparece del mapa, que es donde uno la está buscando.
 */
export function alMinimapa(r: Rect, p: Proyeccion): Rect {
  return {
    x: p.ox + (r.x - p.minX) * p.escala,
    y: p.oy + (r.y - p.minY) * p.escala,
    width: Math.max(2, r.width * p.escala),
    height: Math.max(2, r.height * p.escala)
  }
}

/** Un punto del mapa, de vuelta en coordenadas del plano: es lo que usa el clic. */
export function desdeElMinimapa(punto: Point, p: Proyeccion): Point {
  return {
    x: (punto.x - p.ox) / p.escala + p.minX,
    y: (punto.y - p.oy) / p.escala + p.minY
  }
}
