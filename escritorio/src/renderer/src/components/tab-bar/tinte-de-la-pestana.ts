import type { CSSProperties } from 'react'

/**
 * El color de una pestaña, pintándola entera.
 *
 * Why y no el punto de 8px que había hasta el 08/11/2026: un círculo al lado del título no se ve
 * sin buscarlo, que era justo para lo que estaba el color.
 *
 * Why una capa de `background-image` y no `backgroundColor`: el fondo de la pestaña lo pone una
 * clase (`bg-card`, o la mezcla más clara cuando está activa) y un `backgroundColor` en línea la
 * REEMPLAZA — la pestaña quedaría translúcida y la activa dejaría de distinguirse de las otras.
 * `background-image` es otra propiedad: se pinta ENCIMA del color de la clase, así que el tinte se
 * suma a lo que la pestaña ya decía en vez de taparlo. Al 22 % el texto se sigue leyendo en claro
 * y en oscuro. La línea de abajo va a pleno color: es la que se distingue de un vistazo cuando hay
 * muchas pestañas del mismo tono.
 */
export function tinteDeLaPestana(color: string | null | undefined): CSSProperties | undefined {
  if (!color) {
    return undefined
  }
  const capa = `color-mix(in srgb, ${color} 22%, transparent)`
  return {
    backgroundImage: `linear-gradient(${capa}, ${capa})`,
    boxShadow: `inset 0 -2px 0 0 ${color}`
  }
}
