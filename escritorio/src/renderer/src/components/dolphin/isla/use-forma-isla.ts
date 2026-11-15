import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import gsap from 'gsap'
import { RESORTE_ABRIR, RESORTE_CERRAR, easeDeResorte } from './resorte'

export type FormaDeIsla = 'compacta' | 'aviso' | 'abierta'

/** El aire que la ventana deja alrededor de la forma: arriba poco, a los costados y abajo, la sombra. */
export const MARGEN_ISLA = { arriba: 6, lados: 16, abajo: 28 } as const
// Radios concéntricos con lo que lleva adentro: la pastilla es una pastilla; abierta, 24 como siempre.
const RADIO: Record<FormaDeIsla, number> = { compacta: 22, aviso: 28, abierta: 24 }
// Ir a una forma más grande es abrir (rebota apenas); a una más chica, cerrar (sin rebote).
const PESO: Record<FormaDeIsla, number> = { compacta: 0, aviso: 1, abierta: 2 }
// Las formas cuya primera pieza es la cabecera de la isla (el aviso tiene la suya propia).
const ESCALERA_CON_CABECERA = new Set<FormaDeIsla>(['compacta', 'abierta'])
const ABRIR = easeDeResorte(RESORTE_ABRIR)
const CERRAR = easeDeResorte(RESORTE_CERRAR)

type Medida = { ancho: number; alto: number }

const medir = (elemento: HTMLElement): Medida => ({
  ancho: elemento.offsetWidth,
  alto: elemento.offsetHeight
})

const movimientoReducido = (): boolean =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/**
 * La coreografía de la isla, como la Dynamic Island: la forma negra estira o achica su ancho, su alto
 * y su radio con un resorte, y el contenido cruza con un desenfoque corto (el desenfoque va con una
 * curva, nunca con el resorte: un rebote lo dejaría en negativo y el filtro se rompe).
 *
 * Cada forma es una capa con su ancho natural, así que el texto no se reacomoda mientras la forma
 * crece: la forma solo lo deja ver. Por eso se anima el tamaño de la forma y no una escala, que
 * deformaría letras y radios. La ventana crece antes, hasta la más grande de las dos formas, y se
 * achica al terminar: así nunca recorta, y en reposo no tapa más que la isla.
 *
 * Las capas cruzan con opacidad y no con autoAlpha: autoAlpha las deja en `visibility: hidden`
 * mientras arrancan, y ahí no pueden recibir el foco que la que entra necesita de entrada. Lo que
 * no se ve lo apaga `inert`, que pone React.
 */
export function useFormaDeIsla({
  forma,
  caparazon,
  capas
}: {
  forma: FormaDeIsla
  caparazon: RefObject<HTMLElement | null>
  capas: Record<FormaDeIsla, RefObject<HTMLElement | null>>
}): void {
  const anterior = useRef<FormaDeIsla | null>(null)
  const linea = useRef<gsap.core.Timeline | null>(null)
  // No alcanza con `isActive()`: una línea recién creada no cuenta como activa hasta su primer
  // cuadro, y ahí un acomodo la pisaría.
  const animando = useRef(false)
  const pendiente = useRef(false)
  // Lo último que se le pidió a main, en px de la página (con los márgenes): el zoom se nota
  // comparando contra esto.
  const ultimoPedido = useRef<Medida | null>(null)

  // La ventana mide lo que la MÁS GRANDE de las tres formas, siempre: así no cambia de tamaño en
  // medio de un cambio de forma. Antes crecía al abrir y se achicaba al cerrar, y Windows mueve y
  // agranda la ventana un cuadro antes o después de que la página se reacomode: la isla saltaba
  // ~80 px de costado al abrirse. Lo transparente deja pasar el mouse (ver `ratonEnIsla`).
  const pedirVentana = (): void => {
    const medidas = Object.values(capas)
      .map((capa) => capa.current)
      .filter((capa): capa is HTMLElement => capa !== null)
      .map(medir)
    if (medidas.length === 0) {
      return
    }
    const pedido = {
      ancho: Math.ceil(Math.max(...medidas.map((m) => m.ancho))) + MARGEN_ISLA.lados * 2,
      alto:
        Math.ceil(Math.max(...medidas.map((m) => m.alto))) + MARGEN_ISLA.arriba + MARGEN_ISLA.abajo
    }
    const previo = ultimoPedido.current
    if (previo && previo.ancho === pedido.ancho && previo.alto === pedido.alto) {
      return
    }
    ultimoPedido.current = pedido
    void window.api.dolphin.tamanoDeIsla?.(pedido.ancho, pedido.alto)
  }

  // Una forma se acomoda a su contenido (otra pestaña, una fila más) con una curva corta.
  const acomodar = (cual: FormaDeIsla): void => {
    const negra = caparazon.current
    const capa = capas[cual].current
    if (!negra || !capa) {
      return
    }
    const destino = medir(capa)
    const actual = medir(negra)
    if (Math.abs(destino.ancho - actual.ancho) < 1 && Math.abs(destino.alto - actual.alto) < 1) {
      return
    }
    gsap.to(negra, {
      width: destino.ancho,
      height: destino.alto,
      duration: movimientoReducido() ? 0 : 0.3,
      ease: 'expo.out',
      overwrite: 'auto'
    })
  }

  useLayoutEffect(() => {
    const negra = caparazon.current
    const capa = capas[forma].current
    if (!negra || !capa) {
      return
    }
    const desde = anterior.current
    anterior.current = forma
    for (const [nombre, otra] of Object.entries(capas)) {
      gsap.set(otra.current, { xPercent: -50, transformOrigin: '50% 0%' })
      if (nombre !== forma && nombre !== desde) {
        gsap.set(otra.current, { opacity: 0 })
      }
    }
    // Lo que estaba en curso se corta: un acomodo a medias, al terminar, achicaría la ventana en
    // plena transición.
    linea.current?.kill()
    gsap.killTweensOf(negra)
    animando.current = false
    pendiente.current = false
    const destino = medir(capa)
    if (desde === null || desde === forma || movimientoReducido()) {
      gsap.set(negra, { width: destino.ancho, height: destino.alto, borderRadius: RADIO[forma] })
      gsap.set(capa, { opacity: 1, scale: 1, filter: 'blur(0px)' })
      gsap.set(capa.firstElementChild, { x: 0 })
      if (desde && desde !== forma) {
        gsap.set(capas[desde].current, { opacity: 0 })
      }
      pedirVentana()
      return
    }
    const abre = PESO[forma] >= PESO[desde]
    const resorte = abre ? ABRIR : CERRAR
    // Lo de adentro cruza A LA VEZ, como en la Dynamic Island: lo que sale se achica y se desenfoca
    // mientras lo que entra crece desde un poco más chico. Antes salía primero y entraba después, y
    // en el medio la forma quedaba vacía con un fantasma borroso. Al cerrar, todo más corto.
    const entrada = abre ? { duracion: 0.28, escala: 0.94 } : { duracion: 0.16, escala: 1.04 }
    const saliente = capas[desde].current
    // Entre la pastilla y la isla abierta la cabecera es la misma línea (delfín, estado,
    // contadores): en vez de cruzarse dos copias corridas, cada una viaja con el resorte desde donde
    // estaba la otra y se ven como una sola que se desliza. Ahí las capas no se escalan.
    const cabeceras = ESCALERA_CON_CABECERA.has(desde) && ESCALERA_CON_CABECERA.has(forma)
    const cabeceraQueSale = cabeceras ? (saliente?.firstElementChild ?? null) : null
    const cabeceraQueEntra = cabeceras ? capa.firstElementChild : null
    const corrimiento = saliente ? (capa.offsetWidth - saliente.offsetWidth) / 2 : 0
    animando.current = true
    linea.current = gsap
      .timeline({
        onComplete: () => {
          animando.current = false
          if (pendiente.current) {
            pendiente.current = false
            acomodar(forma)
          }
        }
      })
      .to(
        negra,
        {
          width: destino.ancho,
          height: destino.alto,
          borderRadius: RADIO[forma],
          duration: resorte.duracion,
          ease: resorte.ease
        },
        0
      )
      .to(
        saliente,
        {
          opacity: 0,
          scale: cabeceras ? 1 : abre ? 1.04 : 0.94,
          filter: 'blur(4px)',
          duration: abre ? 0.16 : 0.1,
          ease: 'power2.in'
        },
        0
      )
      .fromTo(
        capa,
        { opacity: 0, scale: cabeceras ? 1 : entrada.escala, filter: 'blur(4px)' },
        {
          opacity: 1,
          scale: 1,
          filter: 'blur(0px)',
          duration: entrada.duracion,
          ease: 'power3.out'
        },
        0.02
      )
    if (cabeceraQueSale && cabeceraQueEntra) {
      const viaje = { duration: resorte.duracion, ease: resorte.ease }
      linea.current
        .fromTo(cabeceraQueEntra, { x: corrimiento }, { x: 0, ...viaje }, 0)
        .fromTo(cabeceraQueSale, { x: 0 }, { x: -corrimiento, ...viaje }, 0)
    }
    // Por qué no hay limpieza que mate la línea: el próximo cambio de forma la mata y arranca desde
    // donde quedó (un aviso que llega mientras se abre no espera a que termine).
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- las capas y la forma negra son refs estables
  }, [forma])

  // El contenido de la forma de ahora puede cambiar de tamaño: se acomoda (y si justo está
  // cambiando de forma, al terminar). El observador avisa también apenas empieza a mirar, sin que
  // nada haya cambiado: por eso se compara con la última medida, o ese aviso pisaba el resorte.
  // Las otras dos también se miran: cualquiera puede volverse la más grande y la ventana la sigue.
  useLayoutEffect(() => {
    const capa = capas[forma].current
    if (!capa) {
      return
    }
    let medida = medir(capa)
    const observador = new ResizeObserver(() => {
      pedirVentana()
      const nueva = medir(capa)
      if (Math.abs(nueva.ancho - medida.ancho) < 1 && Math.abs(nueva.alto - medida.alto) < 1) {
        return
      }
      medida = nueva
      if (animando.current) {
        pendiente.current = true
        return
      }
      acomodar(forma)
    })
    for (const otra of Object.values(capas)) {
      if (otra.current) {
        observador.observe(otra.current)
      }
    }
    return () => observador.disconnect()
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- las capas y la forma negra son refs estables
  }, [forma])

  // Con otro zoom, lo que la página pidió en sus px ya no es lo que mide la ventana (main lo
  // multiplicó por el zoom de cuando se pidió): se vuelve a pedir lo mismo. Contra el último pedido
  // y no contra la forma: en medio de un cambio la ventana es más grande a propósito, y un acomodo
  // recién empezado todavía no cuenta como animación para GSAP.
  useEffect(() => {
    const alCambiar = (): void => {
      const pedido = ultimoPedido.current
      if (
        pedido &&
        (Math.abs(window.innerWidth - pedido.ancho) > 1 ||
          Math.abs(window.innerHeight - pedido.alto) > 1)
      ) {
        void window.api.dolphin.tamanoDeIsla?.(pedido.ancho, pedido.alto)
      }
    }
    window.addEventListener('resize', alCambiar)
    return () => window.removeEventListener('resize', alCambiar)
  }, [])

  // Al desmontar se corta todo, también un acomodo a medias: al terminar le pediría tamaño a una
  // ventana que se está yendo.
  useLayoutEffect(() => {
    const negra = caparazon.current
    return () => {
      linea.current?.kill()
      if (negra) {
        gsap.killTweensOf(negra)
      }
    }
  }, [caparazon])
}

/**
 * Cuando una forma cambia de contenido sin cambiar de forma (un aviso que sigue a otro), lo nuevo
 * entra con el mismo cruce corto. La primera vez no: esa entrada la hace el cambio de forma.
 */
export function useCruceDeContenido(
  capa: RefObject<HTMLElement | null>,
  clave: string | null
): void {
  const anterior = useRef<string | null>(null)
  useLayoutEffect(() => {
    const previa = anterior.current
    anterior.current = clave
    const contenido = capa.current?.firstElementChild
    if (!clave || !previa || clave === previa || !contenido || movimientoReducido()) {
      return
    }
    gsap.fromTo(
      contenido,
      { opacity: 0, y: 4, filter: 'blur(2px)' },
      { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.26, ease: 'power2.out' }
    )
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- la capa es una ref estable
  }, [clave])
}
