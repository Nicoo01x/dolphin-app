import type { PosicionDeIsla } from '../../shared/dolphin-isla-types'

export type AreaDePantalla = { id: number; x: number; y: number; width: number; height: number }

export function acotarPosicionDeIsla(
  x: number,
  y: number,
  ancho: number,
  alto: number,
  area: AreaDePantalla
): { x: number; y: number } {
  return {
    x: Math.round(Math.min(Math.max(x, area.x), area.x + area.width - ancho)),
    y: Math.round(Math.min(Math.max(y, area.y), area.y + area.height - alto))
  }
}

export function posicionGuardadaDeIsla(
  posicion: PosicionDeIsla | undefined,
  ancho: number,
  alto: number,
  pantallas: readonly AreaDePantalla[],
  principal: AreaDePantalla
): { x: number; y: number; displayId: number } {
  const area = pantallas.find((pantalla) => pantalla.id === posicion?.displayId)
  if (!posicion || !area) {
    return {
      x: Math.round(principal.x + (principal.width - ancho) / 2),
      y: principal.y + 8,
      displayId: principal.id
    }
  }
  const bounds = { x: posicion.centro - ancho / 2, y: posicion.arriba }
  const dentro =
    bounds.x >= area.x &&
    bounds.y >= area.y &&
    bounds.x + ancho <= area.x + area.width &&
    bounds.y + alto <= area.y + area.height
  if (!dentro) {
    return {
      x: Math.round(principal.x + (principal.width - ancho) / 2),
      y: principal.y + 8,
      displayId: principal.id
    }
  }
  return { x: Math.round(bounds.x), y: Math.round(bounds.y), displayId: area.id }
}

export function posicionDeIsla(
  x: number,
  y: number,
  ancho: number,
  pantalla: AreaDePantalla
): PosicionDeIsla {
  return { centro: x + ancho / 2, arriba: y, displayId: pantalla.id }
}
