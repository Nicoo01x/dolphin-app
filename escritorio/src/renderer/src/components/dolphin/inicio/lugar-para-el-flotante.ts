import { useLayoutEffect, useState, type RefObject } from 'react'

/**
 * El lugar que el compositor del inicio le deja al botón flotante del espacio de trabajo de la base
 * (`FloatingTerminalToggleButton`, abajo a la derecha de la ventana, 36 px, y arrastrable).
 *
 * Why: ese botón va `fixed` a 24 px del borde derecho y 72 del de abajo de la VENTANA, y el
 * compositor va centrado en el área del inicio. En una ventana angosta —800 px con la barra lateral
 * abierta— el botón quedaba encima de «Empezar» y no se podía tocar. El botón es de la base y la
 * persona puede haberlo dejado donde quiso: no se lo mueve; el compositor se corre.
 *
 * Sólo se corre si se pisarían: en una ventana ancha, el compositor (centrado, 672 px de tope) no
 * llega al botón y queda centrado como siempre.
 */

/** Lo que el compositor deja libre entre su borde y el botón. */
const AIRE = 12
/** El `px-6` de la ranura y el `max-w-2xl` del compositor. */
const MARGEN_DE_LA_RANURA = 24
const ANCHO_DEL_COMPOSITOR = 672

export const SELECTOR_DEL_FLOTANTE = '[data-floating-terminal-toggle]'

type Caja = Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>

/**
 * Cuánto tiene que ocupar el margen derecho de la ranura para que el compositor no pise el botón;
 * null si no se pisan (queda el margen de siempre). Se calcula con el lugar que el compositor tendría
 * SIN correrse —centrado en la ranura—, así correrlo no cambia la cuenta de la vez siguiente.
 */
export function margenParaElFlotante(ranura: Caja, boton: Caja | null): number | null {
  if (!boton) {
    return null
  }
  const seCruzanEnAlto = boton.top < ranura.bottom && boton.bottom > ranura.top
  const libre = ranura.right - ranura.left - MARGEN_DE_LA_RANURA * 2
  const ancho = Math.min(ANCHO_DEL_COMPOSITOR, Math.max(0, libre))
  const centro = (ranura.left + ranura.right) / 2
  const izquierda = centro - ancho / 2
  const derecha = centro + ancho / 2
  const seCruzanEnAncho = boton.left < derecha + AIRE && boton.right > izquierda
  if (!seCruzanEnAlto || !seCruzanEnAncho) {
    return null
  }
  return Math.max(MARGEN_DE_LA_RANURA, ranura.right - boton.left + AIRE)
}

/**
 * El margen derecho que necesita la ranura, medido contra el botón de verdad. Se vuelve a medir
 * cuando la ranura cambia de tamaño (ventana, barra lateral) y cuando se suelta el puntero, que es
 * cuando el botón termina de arrastrarse a otro lugar.
 */
export function useMargenParaElFlotante(ranura: RefObject<HTMLElement | null>): number | null {
  const [margen, setMargen] = useState<number | null>(null)
  useLayoutEffect(() => {
    const caja = ranura.current
    if (!caja) {
      return
    }
    let cuadro = 0
    const medir = (): void => {
      const boton = document.querySelector(SELECTOR_DEL_FLOTANTE)
      setMargen(
        margenParaElFlotante(caja.getBoundingClientRect(), boton?.getBoundingClientRect() ?? null)
      )
    }
    // Después de soltar, el botón se acomoda en el render que sigue: se mide en el cuadro siguiente.
    const medirDespues = (): void => {
      cancelAnimationFrame(cuadro)
      cuadro = requestAnimationFrame(medir)
    }
    medir()
    window.addEventListener('resize', medirDespues)
    window.addEventListener('pointerup', medirDespues, true)
    const alCambiar =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(medirDespues)
    alCambiar?.observe(caja)
    return () => {
      cancelAnimationFrame(cuadro)
      window.removeEventListener('resize', medirDespues)
      window.removeEventListener('pointerup', medirDespues, true)
      alCambiar?.disconnect()
    }
  }, [ranura])
  return margen
}
