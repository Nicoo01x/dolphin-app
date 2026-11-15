import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/class-names'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import { cargarLamina } from './cargar-lamina'
import { armarEscena, MOMENTO_QUIETO, pintarGrabado, type Escena } from './pintar-grabado'
import type { Lente, Luminancia } from './trama'

/** Lo que tarda en dibujarse la lámina al abrir: de lo hondo a la superficie, en menos de un segundo. */
const DIBUJO_MS = 900
/** Después, el oleaje: pocos cuadros por segundo, que es lo que pide algo casi quieto. */
const CUADRO_MS = 1000 / 12
const RADIO_DEL_CATALEJO = 76
/** Cuántas veces más se pide la lámina si falla: a los 0,8 s, 1,6 s y 3,2 s. */
const REINTENTOS_DE_LA_LAMINA = 3

/** Para las capturas: un instante fijo, sin bucle. */
export type GrabadoCongelado = { progreso?: number; ms?: number; lente?: Lente | null }

type Vivo = {
  escena: Escena | null
  color: string
  alfa: number
  inicioDelDibujo: number | null
  montado: number
  lente: Lente & { metaX: number; metaY: number; metaRadio: number }
}

/** Si la tinta de la piel es clara (tema oscuro) o oscura (tema claro). */
function esTintaClara(color: string): boolean {
  const [r = 0, g = 0, b = 0] = (color.match(/[\d.]+/g) ?? []).map(Number)
  return 0.299 * r + 0.587 * g + 0.114 * b > 128
}

/**
 * Una lámina de dominio público dibujada en vivo como trama de puntos, en la tinta de la piel: el
 * mundo de Dolphin. Al abrir se dibuja una vez de lo hondo a la superficie; después queda con un
 * oleaje apenas perceptible. Bajo el cursor, el
 * catalejo: un círculo donde la trama se afina y se ve el buril del grabado.
 *
 * Decorativo (`aria-hidden`). Frena con «reducir movimiento» (una escena fija) y cuando la ventana
 * o el canvas no están a la vista: no queda ningún bucle corriendo para nadie.
 */
export function GrabadoEnPuntos({
  className,
  congelado
}: {
  className?: string
  congelado?: GrabadoCongelado
}): React.JSX.Element {
  const lienzo = useRef<HTMLCanvasElement>(null)
  const quieto = usePrefersReducedMotion()
  const [lamina, setLamina] = useState<Luminancia | null>(null)
  // Por valor: un objeto nuevo con el mismo instante no tiene que rearmar el canvas.
  const claveCongelada = congelado ? JSON.stringify(congelado) : ''

  // La lámina se pide después del primer pintado: el inicio aparece sin esperarla.
  useEffect(() => {
    let vigente = true
    let espera: ReturnType<typeof setTimeout> | null = null
    // Si la lámina no llega (el pedazo del bundle falló al bajar), se vuelve a pedir unas veces,
    // cada vez más espaciado: sin esto el inicio se quedaba sin mundo hasta reabrir la app.
    const pedir = (intento: number): void => {
      cargarLamina()
        .then((leida) => vigente && setLamina(leida))
        .catch((error: unknown) => {
          if (!vigente || intento >= REINTENTOS_DE_LA_LAMINA) {
            console.warn('[dolphin] no se pudo cargar la lámina del inicio', error)
            return
          }
          espera = setTimeout(() => pedir(intento + 1), 800 * 2 ** intento)
        })
    }
    const cuadro = requestAnimationFrame(() => pedir(0))
    return () => {
      vigente = false
      cancelAnimationFrame(cuadro)
      if (espera !== null) {
        clearTimeout(espera)
      }
    }
  }, [])

  useEffect(() => {
    const canvas = lienzo.current
    const g = canvas?.getContext('2d')
    if (!canvas || !g || !lamina) {
      return
    }
    const fijo = claveCongelada !== ''
    const congelado: GrabadoCongelado = fijo ? (JSON.parse(claveCongelada) as GrabadoCongelado) : {}
    const vivo: Vivo = {
      escena: null,
      color: '',
      alfa: 0.5,
      inicioDelDibujo: null,
      montado: performance.now(),
      lente: { x: 0, y: 0, radio: 0, metaX: 0, metaY: 0, metaRadio: 0 }
    }
    let cuadro: number | null = null
    let ultimo = 0
    let aLaVista = true

    const ahora = (): { ms: number; progreso: number } => {
      if (fijo) {
        return { ms: congelado.ms ?? MOMENTO_QUIETO, progreso: congelado.progreso ?? 1 }
      }
      if (quieto) {
        return { ms: MOMENTO_QUIETO, progreso: 1 }
      }
      const t = performance.now()
      vivo.inicioDelDibujo ??= t
      return { ms: t - vivo.montado, progreso: Math.min(1, (t - vivo.inicioDelDibujo) / DIBUJO_MS) }
    }
    const pintar = (): void => {
      if (!vivo.escena) {
        return
      }
      const lente = fijo ? (congelado.lente ?? null) : vivo.lente
      pintarGrabado(g, vivo.escena, { ...ahora(), lente, color: vivo.color, alfa: vivo.alfa })
    }
    const medir = (): void => {
      const { width, height } = canvas.getBoundingClientRect()
      const ppp = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.max(1, Math.round(width * ppp))
      canvas.height = Math.max(1, Math.round(height * ppp))
      g.setTransform(ppp, 0, 0, ppp, 0, 0)
      vivo.color = getComputedStyle(canvas).color
      // Es fondo: la tinta no pasa de la mitad, y encima se lee. En claro un poco menos, porque
      // tinta oscura sobre papel pesa más que plata sobre negro.
      vivo.alfa = esTintaClara(vivo.color) ? 0.5 : 0.56
      vivo.escena = armarEscena(width, height, lamina)
      pintar()
    }

    const moviendose = (): boolean => {
      const l = vivo.lente
      return Math.abs(l.metaRadio - l.radio) > 0.5 || Math.hypot(l.metaX - l.x, l.metaY - l.y) > 0.5
    }
    const paso = (t: number): void => {
      cuadro = null
      const dibujando = ahora().progreso < 1
      const lente = vivo.lente
      lente.x += (lente.metaX - lente.x) * 0.25
      lente.y += (lente.metaY - lente.y) * 0.25
      lente.radio += (lente.metaRadio - lente.radio) * 0.2
      if (dibujando || moviendose() || t - ultimo >= CUADRO_MS) {
        ultimo = t
        pintar()
      }
      seguir()
    }
    const seguir = (): void => {
      const enMovimiento = !quieto || moviendose()
      if (!fijo && cuadro === null && aLaVista && !document.hidden && enMovimiento) {
        cuadro = requestAnimationFrame(paso)
      }
    }
    const frenar = (): void => {
      if (cuadro !== null) {
        cancelAnimationFrame(cuadro)
        cuadro = null
      }
    }

    const alMover = (evento: PointerEvent): void => {
      if (evento.pointerType !== 'mouse' || fijo) {
        return
      }
      const caja = canvas.getBoundingClientRect()
      const x = evento.clientX - caja.left
      const y = evento.clientY - caja.top
      const adentro = x >= 0 && y >= 0 && x <= caja.width && y <= caja.height
      const lente = vivo.lente
      if (lente.radio < 1) {
        lente.x = x
        lente.y = y
      }
      lente.metaX = x
      lente.metaY = y
      lente.metaRadio = adentro ? RADIO_DEL_CATALEJO : 0
      if (quieto) {
        // Sin animación: el lente va donde está el puntero, de una.
        Object.assign(lente, { x, y, radio: lente.metaRadio })
        pintar()
        return
      }
      seguir()
    }
    const alSalir = (): void => {
      vivo.lente.metaRadio = 0
      seguir()
    }
    const alCambiarVisibilidad = (): void => (document.hidden ? frenar() : seguir())
    const mirando =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(([entrada]) => {
            aLaVista = entrada?.isIntersecting ?? true
            if (aLaVista) {
              seguir()
            } else {
              frenar()
            }
          })
    mirando?.observe(canvas)
    const alCambiarTamano = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(medir)
    alCambiarTamano?.observe(canvas)
    // El tema cambia la clase de <html>: se relee la tinta y se vuelve a tramar.
    const alCambiarTema = new MutationObserver(medir)
    alCambiarTema.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme']
    })
    window.addEventListener('pointermove', alMover, { passive: true })
    document.documentElement.addEventListener('pointerleave', alSalir)
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    medir()
    canvas.dataset.listo = ''
    seguir()
    return () => {
      frenar()
      mirando?.disconnect()
      alCambiarTamano?.disconnect()
      alCambiarTema.disconnect()
      window.removeEventListener('pointermove', alMover)
      document.documentElement.removeEventListener('pointerleave', alSalir)
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
    }
  }, [lamina, quieto, claveCongelada])

  return (
    <canvas
      ref={lienzo}
      aria-hidden="true"
      className={cn('pointer-events-none block size-full text-foreground', className)}
    />
  )
}
