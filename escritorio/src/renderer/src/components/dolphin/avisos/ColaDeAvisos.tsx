import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore } from '@/store'
import { useTranslate } from '@/i18n/use-translate'
import { useArrastreParaDescartar } from '../../native-chat/use-arrastre-para-descartar'
import { turnoDeLaCola, type AccionesDelAviso, type AvisoEnCola } from './cola-de-avisos'
import { cerrarAviso, mostrarAviso, useColaDeAvisos, type ComoSeCerro } from './avisos-store'

/**
 * La ventana de un aviso: centrada, con el velo suave detrás, y se cierra arrastrándola con la
 * física de `/nico-mockup` (`use-arrastre-para-descartar`, la misma del cartel y de «Lo que hizo»).
 *
 * Arrastrarla, la ×, Escape o el clic en el velo cuentan como «ahora no»: sólo un botón del aviso
 * lo responde. Por eso el cierre arranca siempre como descarte y `responder` lo cambia justo antes.
 */
export function VentanaDeAviso({
  aviso,
  enElLugar = false
}: {
  readonly aviso: AvisoEnCola
  /** Sin portal, para las fixtures: la ventana se centra en su contenedor en vez de en la app. */
  readonly enElLugar?: boolean
}): React.JSX.Element {
  const como = useRef<ComoSeCerro>('descartado')
  const despues = useRef<(() => void) | null>(null)
  const foco = useRef<Element | null>(null)
  const id = aviso.id
  // Cambia de identidad cuando carga el catálogo o cambia el idioma: el aviso se vuelve a traducir.
  const t = useTranslate()

  // Antes que el arrastre, que le pasa el foco a la ventana: se guarda a quién devolvérselo.
  useLayoutEffect(() => {
    foco.current = document.activeElement
    return () => {
      const anterior = foco.current
      if (anterior instanceof HTMLElement && anterior.isConnected) {
        anterior.focus({ preventScroll: true })
      }
    }
  }, [])

  const alCerrar = useCallback(() => {
    cerrarAviso(id, como.current)
    despues.current?.()
  }, [id])
  const { fondoRef, ventanaRef, descartar } = useArrastreParaDescartar(alCerrar, null)
  const acciones = useMemo<AccionesDelAviso>(
    () => ({
      responder: (luego) => {
        como.current = 'respondido'
        despues.current = luego ?? null
        descartar()
      },
      descartar
    }),
    [descartar]
  )

  const velo = (
    <div
      ref={fondoRef}
      data-aviso-velo=""
      // El velo de /nico-mockup: 11 % de negro y un desenfoque corto, que separa sin apagar la app.
      className={`${enElLugar ? 'absolute' : 'fixed'} inset-0 z-50 flex items-center justify-center bg-black/11 p-4 backdrop-blur-[6px]`}
      onPointerDown={(evento) => {
        if (evento.target === fondoRef.current) {
          descartar()
        }
      }}
    >
      <div
        ref={ventanaRef}
        role="dialog"
        aria-modal="true"
        aria-label={aviso.titulo(t)}
        tabIndex={-1}
        // Sin `transition` y con `will-change`: durante el arrastre todo lo escribe gsap.set.
        // `max-h-full` contra el velo (flex, con su padding): entra entera también a 1024×700.
        className="flex max-h-full w-[34rem] max-w-full cursor-grab flex-col overflow-hidden rounded-[28px] bg-popover text-popover-foreground outline-none will-change-transform active:cursor-grabbing shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--foreground)_6%,transparent),0_24px_64px_rgb(0_0_0/0.14),0_4px_12px_rgb(0_0_0/0.07)] dark:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--foreground)_7%,transparent),0_24px_64px_rgb(0_0_0/0.38),0_4px_12px_rgb(0_0_0/0.22)]"
      >
        {aviso.contenido(acciones, t)}
      </div>
    </div>
  )
  // Por portal al `body`: Draggable mide contra su padre y un ancestro con `transform` le corre
  // el sistema de coordenadas.
  return enElLugar ? velo : createPortal(velo, document.body)
}

/**
 * El único lugar que muestra los avisos. Toma el primero de la cola cuando le toca, lo deja en
 * pantalla hasta que se cierra, y recién ahí mira el siguiente.
 *
 * Espera mientras hay otro modal de la app abierto o la bienvenida a la vista: un aviso encima de
 * otra ventana es justo el apilado que esta cola vino a sacar.
 */
export function ColaDeAvisos({
  enPausa = false,
  enElLugar = false
}: {
  readonly enPausa?: boolean
  readonly enElLugar?: boolean
}): React.JSX.Element | null {
  const estado = useColaDeAvisos()
  const otroModal = useAppStore((s) => s.activeModal !== 'none')
  const [reloj, setReloj] = useState(0)
  const pausada = enPausa || otroModal

  useEffect(() => {
    if (pausada) {
      return
    }
    const turno = turnoDeLaCola(estado, Date.now())
    if (turno.tipo === 'mostrar') {
      mostrarAviso(turno.aviso.id)
      return
    }
    if (turno.tipo !== 'esperar') {
      return
    }
    const temporizador = setTimeout(() => setReloj((vuelta) => vuelta + 1), turno.ms)
    return () => clearTimeout(temporizador)
  }, [estado, pausada, reloj])

  const visible = estado.avisos.find((aviso) => aviso.id === estado.visible)
  if (!visible) {
    return null
  }
  // La key por id: un aviso nuevo es una ventana nueva, con su entrada y su arrastre propios.
  return <VentanaDeAviso key={visible.id} aviso={visible} enElLugar={enElLugar} />
}
