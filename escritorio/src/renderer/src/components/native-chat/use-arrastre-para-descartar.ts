import { useCallback, useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { Draggable } from 'gsap/Draggable'
import { InertiaPlugin } from 'gsap/InertiaPlugin'

gsap.registerPlugin(Draggable, InertiaPlugin)

/**
 * La ventana se agarra de cualquier punto, se achica como una miniatura desde donde la tocaste, y
 * se cierra si la soltás lejos o la tirás fuerte; si la soltás cerca, vuelve con un rebote.
 *
 * Es la física de `/nico-mockup`, portada tal cual: los números de la tabla no se tocan. Lo único
 * que cambia respecto de la referencia es el enganche a React —`useLayoutEffect` en vez de
 * `useGSAP`, que vive en `@gsap/react` y no está instalado— y que acá la ventana se monta y
 * desmonta con el estado en vez de esconderse con `hidden`.
 */

/** Tramos de la escala: a los 220 px de distancia vale .75, a los 350 .5, a los 500 .12. */
const ESCALA: readonly (readonly [number, number])[] = [
  [0, 1],
  [220, 0.75],
  [350, 0.5],
  [500, 0.12]
]

/** Quien pidió menos movimiento la ve aparecer e irse sin viaje: el arrastre sigue, la animación no. */
function sinMovimiento(): boolean {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

function escalaPara(distancia: number): number {
  for (let i = 1; i < ESCALA.length; i += 1) {
    const [d0, s0] = ESCALA[i - 1]!
    const [d1, s1] = ESCALA[i]!
    if (distancia <= d1) {
      return gsap.utils.mapRange(d0, d1, s0, s1, distancia)
    }
  }
  return ESCALA.at(-1)![1]
}

/**
 * Las ventanas abiertas con este arrastre, la de más arriba al final. Puede haber dos a la vez —el
 * aviso urgente de poca RAM sale encima de otro— y Escape cierra sólo la de arriba.
 */
const abiertas: object[] = []

export type ArrastreParaDescartar = {
  fondoRef: React.RefObject<HTMLDivElement | null>
  ventanaRef: React.RefObject<HTMLDivElement | null>
  /** El cierre con animación, para la ×, el Escape y el clic en el fondo. */
  descartar: () => void
}

/** De dónde nace y a dónde vuelve la ventana: la caja del botón que la abrió. */
function desplazamientoHasta(ventana: HTMLElement, nace: DOMRect | null): { x: number; y: number } {
  if (!nace) {
    return { x: 0, y: 0 }
  }
  const caja = ventana.getBoundingClientRect()
  return {
    x: nace.left + nace.width / 2 - (caja.left + caja.width / 2),
    y: nace.top + nace.height / 2 - (caja.top + caja.height / 2)
  }
}

export function useArrastreParaDescartar(
  alCerrar: () => void,
  nace: DOMRect | null
): ArrastreParaDescartar {
  const fondoRef = useRef<HTMLDivElement>(null)
  const ventanaRef = useRef<HTMLDivElement>(null)
  const naceRef = useRef(nace)
  /** El transform-origin vigente, en porcentaje: lo necesita la compensación del rebote. */
  const origen = useRef({ x: 50, y: 50 })
  const cerrarRef = useRef(alCerrar)
  cerrarRef.current = alCerrar

  const descartar = useCallback(() => {
    const fondo = fondoRef.current
    const ventana = ventanaRef.current
    if (!fondo || !ventana || sinMovimiento()) {
      cerrarRef.current()
      return
    }
    gsap.killTweensOf([fondo, ventana])
    // Vuelve al botón que la abrió, que es de donde salió; sin botón, se va donde está.
    const vuelta = desplazamientoHasta(ventana, naceRef.current)
    gsap.to(ventana, {
      x: vuelta.x,
      y: vuelta.y,
      scale: naceRef.current ? 0.12 : 0.94,
      opacity: 0,
      duration: naceRef.current ? 0.3 : 0.18,
      ease: 'power2.in',
      onComplete: () => cerrarRef.current()
    })
    gsap.to(fondo, { opacity: 0, duration: 0.18, ease: 'power2.out' })
  }, [])

  useLayoutEffect(() => {
    const fondo = fondoRef.current
    const ventana = ventanaRef.current
    if (!fondo || !ventana) {
      return
    }
    origen.current = { x: 50, y: 50 }
    gsap.set(ventana, { x: 0, y: 0, transformOrigin: '50% 50%', filter: 'blur(0px)' })
    // De dónde sale: se mide con la ventana ya en su lugar, antes de moverla.
    const sale = desplazamientoHasta(ventana, naceRef.current)

    // Why: Draggable no tiene getVelocity(); la trackea InertiaPlugin, que Draggable activa con
    // solo estar registrado aunque `inertia` sea false.
    const velocidad = (eje: 'x' | 'y'): number => InertiaPlugin.getVelocity(ventana, eje)

    const [arrastre] = Draggable.create(ventana, {
      type: 'x,y',
      inertia: false,
      zIndexBoost: false,
      cursor: 'grab',
      activeCursor: 'grabbing',

      onPress(this: Draggable, evento: PointerEvent | TouchEvent) {
        gsap.killTweensOf([ventana, fondo])
        gsap.to(fondo, { opacity: 1, duration: 0.15 })
        const caja = ventana.getBoundingClientRect()
        const x = 'clientX' in evento ? evento.clientX : this.pointerX - window.scrollX
        const y = 'clientY' in evento ? evento.clientY : this.pointerY - window.scrollY
        const ox = ((x - caja.left) / caja.width) * 100
        const oy = ((y - caja.top) / caja.height) * 100
        // Agarrarla en pleno rebote (escala distinta de 1) la haría saltar al cambiar el origen.
        const escala = gsap.getProperty(ventana, 'scale') as number
        const dx = ((ox - origen.current.x) / 100) * (caja.width / escala) * (1 - escala)
        const dy = ((oy - origen.current.y) / 100) * (caja.height / escala) * (1 - escala)
        origen.current = { x: ox, y: oy }
        gsap.set(ventana, {
          transformOrigin: `${ox}% ${oy}%`,
          x: this.x - dx,
          y: this.y - dy
        })
        this.update()
      },

      onDrag(this: Draggable) {
        const distancia = Math.hypot(this.x, this.y)
        gsap.set(ventana, {
          x: this.x,
          y: this.y,
          scale: escalaPara(distancia),
          opacity: gsap.utils.interpolate(1, 0.86, gsap.utils.clamp(0, 1, (distancia - 350) / 180)),
          filter: `blur(${gsap.utils.interpolate(0, 3, gsap.utils.clamp(0, 1, (distancia - 220) / 280))}px)`
        })
      },

      onDragEnd(this: Draggable) {
        const distancia = Math.hypot(this.x, this.y)
        const vx = velocidad('x')
        const vy = velocidad('y')
        const rapidez = Math.hypot(vx, vy)
        const cierra =
          escalaPara(distancia) <= 0.35 || distancia > 430 || (rapidez > 900 && distancia > 260)
        if (cierra && sinMovimiento()) {
          cerrarRef.current()
          return
        }
        if (cierra) {
          gsap.to(ventana, {
            x: this.x + vx * 0.12,
            y: this.y + vy * 0.12,
            scale: 0.08,
            opacity: 0,
            duration: 0.18,
            ease: 'power2.in',
            onComplete: () => cerrarRef.current()
          })
          gsap.to(fondo, { opacity: 0, duration: 0.18, ease: 'power2.out' })
          return
        }
        gsap.to(ventana, {
          x: 0,
          y: 0,
          scale: 1,
          opacity: 1,
          filter: 'blur(0px)',
          duration: sinMovimiento() ? 0 : 0.58,
          ease: 'elastic.out(0.75, 0.55)'
        })
      }
    })

    // Why después de crear el Draggable: al registrarse normaliza el transform del elemento y pisa
    // un tween de x/y en curso, y la ventana se quedaba a mitad de camino entre el botón y el
    // centro. La entrada va cuando el arrastre ya está puesto.
    const quieta = sinMovimiento()
    gsap.fromTo(
      fondo,
      { opacity: 0 },
      { opacity: 1, duration: quieta ? 0 : 0.22, ease: 'power2.out' }
    )
    // La ventana nace del botón que la abrió y crece hasta el centro; sin botón, la entrada de
    // /nico-mockup tal cual (escala .94 y 16 px desde abajo).
    gsap.fromTo(
      ventana,
      naceRef.current
        ? { x: sale.x, y: sale.y, scale: 0.12, opacity: 0 }
        : { x: 0, y: 16, scale: 0.94, opacity: 0 },
      {
        x: 0,
        y: 0,
        scale: 1,
        opacity: 1,
        duration: quieta ? 0 : naceRef.current ? 0.44 : 0.34,
        ease: 'power3.out',
        // El arrastre arranca desde donde la ventana quedó, no desde donde nació.
        onComplete: () => arrastre?.update()
      }
    )
    ventana.focus({ preventScroll: true })

    const esta = {}
    abiertas.push(esta)
    const alTeclear = (evento: KeyboardEvent): void => {
      if (evento.key === 'Escape' && abiertas.at(-1) === esta) {
        evento.stopPropagation()
        descartar()
      }
    }
    // En la captura de `window`, antes que todo lo del `document`: si hay un modal de la app
    // abajo, su Escape no llega a enterarse y queda abierto.
    window.addEventListener('keydown', alTeclear, true)
    return () => {
      arrastre?.kill()
      abiertas.splice(abiertas.indexOf(esta), 1)
      window.removeEventListener('keydown', alTeclear, true)
      gsap.killTweensOf([ventana, fondo])
    }
  }, [descartar])

  return { fondoRef, ventanaRef, descartar }
}
