import { useCallback, useEffect, useRef, useState } from 'react'
import {
  inertiaStep,
  interpretWheel,
  isInertiaDone,
  safeRect,
  VelocityTracker,
  zoomAt,
  clampZoom,
  type Point,
  type Rect,
  type Size,
  type ViewportTransform
} from './canvas'
import { prepararVuelo, vistaQueCentra, zoomParaRevelar } from './camara'
import { LO_QUE_TAPA } from './ChromeDelLienzo'

/**
 * Cómo se mira el plano: la rueda, el arrastre con inercia y los viajes con animación.
 *
 * Vive aparte de `LienzoPage` porque es un asunto cerrado —acá nadie sabe qué ventanas hay ni
 * qué tienen adentro— y porque los tres gestos comparten un solo cuadro de animación: el que
 * empieza cancela al anterior, y tenerlos repartidos era la forma segura de que un vuelo y una
 * inercia se pelearan por la cámara.
 */
export function useCamaraDelLienzo({
  plano,
  medida
}: {
  plano: React.RefObject<HTMLDivElement | null>
  /** El tamaño del plano en pantalla, leído en el momento y no guardado. */
  medida: () => Size
}): {
  vista: ViewportTransform
  setVista: React.Dispatch<React.SetStateAction<ViewportTransform>>
  alRodar: (evento: React.WheelEvent) => void
  alBajarEnElFondo: (evento: React.PointerEvent) => void
  alMoverElFondo: (evento: React.PointerEvent) => void
  alSoltarElFondo: (evento: React.PointerEvent) => void
  volarA: (punto: Point) => void
  revelarRect: (rect: Rect) => void
  zoomAlMedio: (hasta: number) => void
} {
  const [vista, setVista] = useState<ViewportTransform>({ x: 0, y: 0, zoom: 1 })
  const paneo = useRef<{ x: number; y: number } | null>(null)
  const velocidad = useRef(new VelocityTracker())
  const cuadro = useRef(0)

  useEffect(() => () => cancelAnimationFrame(cuadro.current), [])

  /** La rueda, como en una herramienta de diseño: ctrl o pellizco acercan, el resto corre el plano. */
  const alRodar = useCallback(
    (evento: React.WheelEvent) => {
      const caja = plano.current?.getBoundingClientRect()
      if (!caja) {
        return
      }
      const que = interpretWheel(evento)
      if (que.kind === 'zoom') {
        const donde = { x: evento.clientX - caja.left, y: evento.clientY - caja.top }
        setVista((v) => zoomAt(v, donde, v.zoom * que.factor))
        return
      }
      setVista((v) => ({ ...v, x: v.x + que.dx, y: v.y + que.dy }))
    },
    [plano]
  )

  const alBajarEnElFondo = useCallback((evento: React.PointerEvent) => {
    if (evento.button !== 0 && evento.button !== 1) {
      return
    }
    cancelAnimationFrame(cuadro.current)
    paneo.current = { x: evento.clientX, y: evento.clientY }
    velocidad.current.reset()
    velocidad.current.push(performance.now(), { x: evento.clientX, y: evento.clientY })
    evento.currentTarget.setPointerCapture(evento.pointerId)
  }, [])

  const alMoverElFondo = useCallback((evento: React.PointerEvent) => {
    const desde = paneo.current
    if (!desde) {
      return
    }
    setVista((v) => ({
      ...v,
      x: v.x + (evento.clientX - desde.x),
      y: v.y + (evento.clientY - desde.y)
    }))
    paneo.current = { x: evento.clientX, y: evento.clientY }
    velocidad.current.push(performance.now(), { x: evento.clientX, y: evento.clientY })
  }, [])

  /** Al soltar, el plano sigue un poco y frena, como cualquier mapa. */
  const alSoltarElFondo = useCallback((evento: React.PointerEvent) => {
    if (!paneo.current) {
      return
    }
    paneo.current = null
    if (evento.currentTarget.hasPointerCapture(evento.pointerId)) {
      evento.currentTarget.releasePointerCapture(evento.pointerId)
    }
    let v: Point = velocidad.current.velocity(performance.now())
    let antes = performance.now()
    const seguir = (ahora: number): void => {
      const paso = inertiaStep(v, Math.min(32, ahora - antes))
      antes = ahora
      v = paso.velocity
      setVista((actual) => ({ ...actual, x: actual.x + paso.dx, y: actual.y + paso.dy }))
      if (!isInertiaDone(v)) {
        cuadro.current = requestAnimationFrame(seguir)
      }
    }
    if (!isInertiaDone(v)) {
      cuadro.current = requestAnimationFrame(seguir)
    }
  }, [])

  /**
   * Volar hasta un punto del plano: es lo que hace el mapa al tocarlo.
   *
   * Con animación y no de un salto, por la misma razón que en Deska: aterrizar seco en otra
   * parte del plano te deja sin saber de dónde viniste, y con un plano grande eso se paga caro.
   */
  const volarA = useCallback(
    (punto: Point) => {
      cancelAnimationFrame(cuadro.current)
      const caja = medida()
      const destino = vistaQueCentra(punto, caja, vista.zoom, LO_QUE_TAPA)
      const vuelo = prepararVuelo(vista, destino, caja, { arranca: performance.now() })
      const seguir = (ahora: number): void => {
        const paso = vuelo.paso(ahora)
        if (!paso) {
          setVista(destino)
          return
        }
        setVista(paso)
        cuadro.current = requestAnimationFrame(seguir)
      }
      cuadro.current = requestAnimationFrame(seguir)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `vista` y `medida` se leen al tocar
    [vista]
  )

  /**
   * Ir a ver una ventana: la pone en el medio y, si venías de lejos, acerca hasta que se lea.
   *
   * Es el `reveal` de Deska. Sin esto, el rail «traía al frente» una ventana que podía estar
   * fuera de la pantalla: la tocabas y no pasaba nada visible, que es exactamente lo que me pasó
   * buscando la Terminal a 448 px arriba del borde.
   */
  const revelarRect = useCallback(
    (rect: Rect) => {
      cancelAnimationFrame(cuadro.current)
      const caja = medida()
      const aLaVista = safeRect(caja, LO_QUE_TAPA)
      const centro = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
      const destino = vistaQueCentra(
        centro,
        caja,
        zoomParaRevelar(rect, aLaVista, vista.zoom),
        LO_QUE_TAPA
      )
      const vuelo = prepararVuelo(vista, destino, caja, { arranca: performance.now() })
      const seguir = (ahora: number): void => {
        const paso = vuelo.paso(ahora)
        if (!paso) {
          setVista(destino)
          return
        }
        setVista(paso)
        cuadro.current = requestAnimationFrame(seguir)
      }
      cuadro.current = requestAnimationFrame(seguir)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `vista` y `medida` se leen al tocar
    [vista]
  )

  /** Acercar y alejar pasan por el medio de la pantalla, que es a donde está mirando el que toca. */
  const zoomAlMedio = useCallback(
    (hasta: number) => {
      const caja = medida()
      setVista((v) => zoomAt(v, { x: caja.width / 2, y: caja.height / 2 }, clampZoom(hasta)))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `medida` se lee al tocar
    []
  )

  return {
    vista,
    setVista,
    alRodar,
    alBajarEnElFondo,
    alMoverElFondo,
    alSoltarElFondo,
    volarA,
    revelarRect,
    zoomAlMedio
  }
}
