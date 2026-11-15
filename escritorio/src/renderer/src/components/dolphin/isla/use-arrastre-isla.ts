import { useCallback, useEffect, useRef } from 'react'
import { superaUmbralDeArrastre } from '../../../../../shared/dolphin-isla-types'

type Punto = { x: number; y: number }

export function useArrastreDeIsla(): {
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void
  onPointerMove: (event: React.PointerEvent<HTMLElement>) => void
  onPointerUp: (event: React.PointerEvent<HTMLElement>) => void
  onPointerCancel: () => void
  onLostPointerCapture: () => void
  onClickCapture: (event: React.MouseEvent<HTMLElement>) => void
} {
  const inicio = useRef<Punto | null>(null)
  const anterior = useRef<Punto | null>(null)
  const pendiente = useRef<Punto>({ x: 0, y: 0 })
  const arrastrando = useRef(false)
  const raf = useRef<number | null>(null)
  const suprimirClick = useRef(false)
  const elementoCapturado = useRef<HTMLElement | null>(null)
  const idPuntero = useRef<number | null>(null)

  const enviar = useCallback((soltar: boolean): void => {
    const delta = pendiente.current
    pendiente.current = { x: 0, y: 0 }
    if (delta.x !== 0 || delta.y !== 0 || soltar) {
      void window.api.dolphin.moverIsla(delta.x, delta.y, soltar)
    }
  }, [])

  const programar = useCallback((): void => {
    if (raf.current !== null) {
      return
    }
    raf.current = window.requestAnimationFrame(() => {
      raf.current = null
      enviar(false)
    })
  }, [enviar])

  const terminar = useCallback(
    (event?: React.PointerEvent<HTMLElement>): void => {
      if (raf.current !== null) {
        window.cancelAnimationFrame(raf.current)
        raf.current = null
      }
      if (arrastrando.current) {
        event?.preventDefault()
        suprimirClick.current = true
        enviar(true)
      }
      if (elementoCapturado.current && idPuntero.current !== null) {
        if (elementoCapturado.current.hasPointerCapture(idPuntero.current)) {
          elementoCapturado.current.releasePointerCapture(idPuntero.current)
        }
      }
      elementoCapturado.current = null
      idPuntero.current = null
      inicio.current = null
      anterior.current = null
      arrastrando.current = false
    },
    [enviar]
  )

  useEffect(() => {
    const alPerderFoco = (): void => terminar()
    window.addEventListener('blur', alPerderFoco)
    return () => {
      window.removeEventListener('blur', alPerderFoco)
      if (raf.current !== null) {
        window.cancelAnimationFrame(raf.current)
      }
    }
  }, [terminar])

  return {
    onPointerDown: (event) => {
      if (event.button !== 0) {
        return
      }
      inicio.current = { x: event.screenX, y: event.screenY }
      anterior.current = inicio.current
      pendiente.current = { x: 0, y: 0 }
      arrastrando.current = false
      elementoCapturado.current = event.currentTarget
      idPuntero.current = event.pointerId
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    onPointerMove: (event) => {
      const primero = inicio.current
      const previo = anterior.current
      if (!primero || !previo) {
        return
      }
      const dx = event.screenX - primero.x
      const dy = event.screenY - primero.y
      if (!arrastrando.current && !superaUmbralDeArrastre(dx, dy)) {
        return
      }
      arrastrando.current = true
      pendiente.current = {
        x: pendiente.current.x + event.screenX - previo.x,
        y: pendiente.current.y + event.screenY - previo.y
      }
      anterior.current = { x: event.screenX, y: event.screenY }
      event.preventDefault()
      programar()
    },
    onPointerUp: terminar,
    onPointerCancel: () => terminar(),
    onLostPointerCapture: () => terminar(),
    // Why no hay doble clic para volver al centro: demoraba cada clic 250 ms para esperar
    // el segundo y la isla dejaba de responder al toque. Volver está en «Armá la isla».
    onClickCapture: (event) => {
      if (suprimirClick.current) {
        suprimirClick.current = false
        event.preventDefault()
        event.stopPropagation()
      }
    }
  }
}
