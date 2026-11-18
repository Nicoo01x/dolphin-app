/**
 * La rueda del mouse adentro del cuadrito de Cmd+K.
 *
 * Monaco escucha la rueda en un ancestro del cuadrito y, cuando la usa, le hace `preventDefault`:
 * scrollea el editor y la respuesta larga de adentro no se mueve. Acá se corta el viaje SÓLO cuando
 * hay algo del cuadrito que todavía puede scrollear para ese lado; en el borde, o sobre una parte
 * que no scrollea, la rueda sigue hasta el editor como siempre.
 */

/** Si este elemento puede moverse un poco más en la dirección de la rueda. */
function puedeScrollear(elemento: HTMLElement, dx: number, dy: number): boolean {
  if (dy !== 0 && elemento.scrollHeight > elemento.clientHeight) {
    const arriba = elemento.scrollTop > 0
    const abajo = elemento.scrollTop + elemento.clientHeight < elemento.scrollHeight - 1
    if ((dy < 0 && arriba) || (dy > 0 && abajo)) {
      return true
    }
  }
  if (dx !== 0 && elemento.scrollWidth > elemento.clientWidth) {
    const izquierda = elemento.scrollLeft > 0
    const derecha = elemento.scrollLeft + elemento.clientWidth < elemento.scrollWidth - 1
    if ((dx < 0 && izquierda) || (dx > 0 && derecha)) {
      return true
    }
  }
  return false
}

export function hayDondeScrollear(
  desde: EventTarget | null,
  hasta: HTMLElement,
  dx: number,
  dy: number
): boolean {
  let elemento = desde instanceof HTMLElement ? desde : null
  while (elemento && elemento !== hasta) {
    if (puedeScrollear(elemento, dx, dy)) {
      return true
    }
    elemento = elemento.parentElement
  }
  return false
}

export function dejarQueElCuadritoScrollee(nodo: HTMLElement): void {
  nodo.addEventListener(
    'wheel',
    (evento) => {
      if (hayDondeScrollear(evento.target, nodo, evento.deltaX, evento.deltaY)) {
        evento.stopPropagation()
      }
    },
    { passive: true }
  )
}
