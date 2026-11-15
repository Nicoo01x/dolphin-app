import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react'

type Punto = { x: number; y: number }

const DURACION = 260
const SALIDA = 'cubic-bezier(0.165, 0.84, 0.44, 1)'

/** Cuántas tarjetas se están deslizando dentro de cada lista que se soltó. */
const deslizandoEn = new WeakMap<HTMLElement, number>()

/**
 * La lista de una columna tiene scroll propio, y una tarjeta que llega desde otra columna pasa por
 * afuera de esa caja: recortada a mitad de camino, y encima asomaban las barras de scroll. Mientras
 * dura el deslizamiento la lista deja ver lo que se sale, siempre que no esté scrolleando de verdad
 * (con cuarenta tarjetas se queda como está: soltarla mostraría las que están fuera de vista).
 */
function soltarLaLista(lista: HTMLElement | null): void {
  if (!lista || lista.scrollHeight > lista.clientHeight + 1) {
    return
  }
  deslizandoEn.set(lista, (deslizandoEn.get(lista) ?? 0) + 1)
  lista.style.overflow = 'visible'
  // Por reloj y no por el `finish` de la animación: una cancelada (otro dibujo a mitad de camino)
  // no puede dejar la lista suelta para siempre.
  window.setTimeout(() => {
    const quedan = (deslizandoEn.get(lista) ?? 1) - 1
    deslizandoEn.set(lista, quedan)
    if (quedan <= 0) {
      lista.style.overflow = ''
    }
  }, DURACION + 40)
}

/**
 * Cuando una tarjeta cambia de lugar, se desliza hasta el nuevo en vez de aparecer (FLIP: se mide
 * dónde estaba, se mide dónde quedó y se anima la diferencia con `transform`). Las vecinas que se
 * corren también se deslizan. Las posiciones se guardan relativas al tablero, así un scroll de la
 * pantalla entre dos dibujos no se confunde con un movimiento.
 *
 * `desdeAca` deja anotado de dónde parte una tarjeta que se soltó arrastrándola: arranca desde donde
 * la dejó el puntero y no desde su lugar viejo.
 */
export function useDeslizamiento(
  raiz: RefObject<HTMLElement | null>,
  clave: string,
  quieto: boolean
): { desdeAca: (id: string, caja: DOMRect) => void } {
  const antes = useRef(new Map<string, Punto>())
  const forzadas = useRef(new Map<string, DOMRect>())

  useLayoutEffect(() => {
    const tablero = raiz.current
    if (!tablero) {
      return
    }
    const base = tablero.getBoundingClientRect()
    const ahora = new Map<string, Punto>()
    for (const tarjeta of tablero.querySelectorAll<HTMLElement>('[data-tarjeta-id]')) {
      const id = tarjeta.dataset.tarjetaId ?? ''
      const caja = tarjeta.getBoundingClientRect()
      const punto = { x: caja.left - base.left, y: caja.top - base.top }
      ahora.set(id, punto)
      const forzada = forzadas.current.get(id)
      const previo = forzada
        ? { x: forzada.left - base.left, y: forzada.top - base.top }
        : antes.current.get(id)
      const dx = (previo?.x ?? punto.x) - punto.x
      const dy = (previo?.y ?? punto.y) - punto.y
      if (!quieto && Math.hypot(dx, dy) > 1 && typeof tarjeta.animate === 'function') {
        tarjeta.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
          { duration: DURACION, easing: SALIDA }
        )
        soltarLaLista(tarjeta.parentElement)
      }
    }
    antes.current = ahora
    forzadas.current.clear()
  }, [raiz, clave, quieto])

  const desdeAca = useCallback((id: string, caja: DOMRect) => {
    forzadas.current.set(id, caja)
  }, [])
  return { desdeAca }
}
