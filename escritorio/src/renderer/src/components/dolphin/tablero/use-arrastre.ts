import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type {
  ColumnaDelTablero,
  TarjetaDelTablero
} from '../../../../../shared/dolphin-tablero-types'
import { columnaBajo, empezoAArrastrar, type CajaDeColumna } from './arrastre-de-tarjetas'

/** Al soltar fuera de una columna, la tarjeta vuelve con un rebote corto. */
const REBOTE = { duration: 300, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }

/** Cómo se ve la tarjeta levantada: un tono más arriba y la sombra de un flotante. */
export const LEVANTADA = [
  'bg-[color-mix(in_srgb,var(--popover)_90%,var(--foreground))]',
  'shadow-floating',
  'cursor-grabbing'
]

type EnCurso = {
  tarjeta: TarjetaDelTablero
  elemento: HTMLElement
  x0: number
  y0: number
  fantasma: HTMLElement | null
  soltar: () => void
}

function cajasDe(tablero: HTMLElement | null): CajaDeColumna[] {
  return [...(tablero?.querySelectorAll<HTMLElement>('[data-columna]') ?? [])].map((seccion) => {
    const caja = seccion.getBoundingClientRect()
    return {
      columna: seccion.dataset.columna as ColumnaDelTablero,
      izquierda: caja.left,
      derecha: caja.right,
      arriba: caja.top,
      abajo: caja.bottom
    }
  })
}

/**
 * La copia que viaja con el puntero. Va fija sobre todo, así no la recorta el scroll de su columna;
 * la original queda en su lugar, atenuada, como el hueco de donde salió.
 */
function levantar(elemento: HTMLElement): HTMLElement {
  const caja = elemento.getBoundingClientRect()
  const fantasma = elemento.cloneNode(true) as HTMLElement
  fantasma.removeAttribute('tabindex')
  fantasma.setAttribute('aria-hidden', 'true')
  fantasma.classList.add(...LEVANTADA)
  Object.assign(fantasma.style, {
    // En línea y no sólo por clase: la copia trae también el fondo y el cursor de la tarjeta en
    // reposo, y entre dos clases de la misma propiedad no se sabe cuál gana.
    backgroundColor: 'color-mix(in srgb, var(--popover) 90%, var(--foreground))',
    cursor: 'grabbing',
    position: 'fixed',
    left: `${caja.left}px`,
    top: `${caja.top}px`,
    width: `${caja.width}px`,
    margin: '0',
    zIndex: '60',
    pointerEvents: 'none'
  })
  // En el body y no adentro del tablero: React no sabe de este nodo y no tiene que tropezar con él.
  document.body.appendChild(fantasma)
  elemento.style.opacity = '0.35'
  return fantasma
}

/**
 * Arrastrar una tarjeta con el puntero: una copia sigue al puntero, la columna de abajo se marca y
 * al soltar sobre otra columna se pide moverla (y se desliza desde donde se soltó); fuera de una
 * columna, o con Escape, vuelve a su lugar con un rebote. Un toque que apenas se mueve es un clic.
 */
export function useArrastre({
  tablero,
  quieto,
  alSoltar,
  desdeAca
}: {
  tablero: RefObject<HTMLElement | null>
  quieto: boolean
  alSoltar: (tarjeta: TarjetaDelTablero, columna: ColumnaDelTablero) => void
  desdeAca: (id: string, caja: DOMRect) => void
}) {
  const [arrastrando, setArrastrando] = useState<string | null>(null)
  const [destino, setDestino] = useState<ColumnaDelTablero | null>(null)
  const enCurso = useRef<EnCurso | null>(null)
  // El clic que el navegador manda al soltar un arrastre no es un clic: no carga el prompt.
  const recienSoltada = useRef(false)

  const terminar = useCallback(
    (x: number | null, y: number | null) => {
      const actual = enCurso.current
      if (!actual) {
        return
      }
      enCurso.current = null
      actual.soltar()
      const { elemento, tarjeta, fantasma } = actual
      if (!fantasma) {
        return
      }
      recienSoltada.current = true
      setTimeout(() => (recienSoltada.current = false), 0)
      setArrastrando(null)
      setDestino(null)
      const columna = x === null || y === null ? null : columnaBajo(x, y, cajasDe(tablero.current))
      const volver = (): void => {
        fantasma.remove()
        elemento.style.opacity = ''
      }
      if (columna && columna !== tarjeta.columna) {
        desdeAca(tarjeta.id, fantasma.getBoundingClientRect())
        volver()
        alSoltar(tarjeta, columna)
        return
      }
      if (quieto || typeof fantasma.animate !== 'function') {
        volver()
        return
      }
      const rebote = fantasma.animate(
        [{ transform: fantasma.style.transform }, { transform: 'translate(0, 0)' }],
        REBOTE
      )
      rebote.onfinish = volver
      rebote.oncancel = volver
    },
    [tablero, quieto, alSoltar, desdeAca]
  )

  const alApretar = useCallback(
    (evento: React.PointerEvent<HTMLElement>, tarjeta: TarjetaDelTablero) => {
      if (evento.button !== 0 || enCurso.current) {
        return
      }
      const elemento = evento.currentTarget
      const id = evento.pointerId
      const mover = (e: PointerEvent): void => {
        const actual = enCurso.current
        if (!actual) {
          return
        }
        const dx = e.clientX - actual.x0
        const dy = e.clientY - actual.y0
        if (!actual.fantasma && !empezoAArrastrar(dx, dy)) {
          return
        }
        if (!actual.fantasma) {
          // Lo que el navegador alcanzó a seleccionar antes de que el arrastre arrancara no queda
          // resaltado mientras la tarjeta viaja (el tablero, además, no se deja seleccionar).
          window.getSelection?.()?.removeAllRanges()
          actual.fantasma = levantar(elemento)
          setArrastrando(tarjeta.id)
        }
        actual.fantasma.style.transform = `translate(${dx}px, ${dy}px)`
        setDestino(columnaBajo(e.clientX, e.clientY, cajasDe(tablero.current)))
      }
      const arriba = (e: PointerEvent): void => terminar(e.clientX, e.clientY)
      const cancelar = (): void => terminar(null, null)
      const escape = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') {
          terminar(null, null)
        }
      }
      // Capturado desde el primer momento: un movimiento rápido no se escapa de la tarjeta. Un
      // puntero que ya no está activo no se puede capturar, y eso no impide arrastrar.
      try {
        elemento.setPointerCapture?.(id)
      } catch {
        // sin captura: los movimientos llegan igual mientras el puntero esté sobre la tarjeta
      }
      elemento.addEventListener('pointermove', mover)
      elemento.addEventListener('pointerup', arriba)
      elemento.addEventListener('pointercancel', cancelar)
      window.addEventListener('keydown', escape)
      enCurso.current = {
        tarjeta,
        elemento,
        x0: evento.clientX,
        y0: evento.clientY,
        fantasma: null,
        soltar: () => {
          elemento.removeEventListener('pointermove', mover)
          elemento.removeEventListener('pointerup', arriba)
          elemento.removeEventListener('pointercancel', cancelar)
          window.removeEventListener('keydown', escape)
          if (elemento.hasPointerCapture?.(id)) {
            elemento.releasePointerCapture(id)
          }
        }
      }
    },
    [tablero, terminar]
  )

  // Si el tablero se va a mitad de un arrastre (se cambia de pantalla, llega otro tablero), la
  // copia no puede quedar colgada sobre todo lo demás.
  useEffect(
    () => () => {
      const actual = enCurso.current
      enCurso.current = null
      actual?.soltar()
      actual?.fantasma?.remove()
    },
    []
  )

  const alHacerClic = useCallback((evento: React.MouseEvent) => {
    if (recienSoltada.current) {
      evento.preventDefault()
      evento.stopPropagation()
    }
  }, [])

  return { arrastrando, destino, alApretar, alHacerClic }
}
