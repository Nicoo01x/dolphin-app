import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useTranslate } from '@/i18n/use-translate'
import { cn } from '@/lib/class-names'
import { useArrastreParaDescartar } from '../../native-chat/use-arrastre-para-descartar'

/**
 * La ventana de la página de delfines (crear, hablarle, llevarlo al servidor): nace del botón que
 * la abrió, se arrastra para cerrarla con la física de `/nico-mockup` y vuelve al botón. Es el
 * mismo mecanismo que el cartel de funciones; por eso sale por un portal al `body` (Draggable mide
 * contra su padre, y un ancestro con `transform` le corre las coordenadas).
 */
export function VentanaDeDelfin({
  titulo,
  nace,
  onCerrar,
  ancho = 'w-[30rem]',
  children
}: {
  titulo: string
  /** La caja del botón que la abrió. */
  nace: DOMRect | null
  onCerrar: () => void
  ancho?: string
  children: (descartar: () => void) => ReactNode
}): React.JSX.Element {
  const t = useTranslate()
  const { fondoRef, ventanaRef, descartar } = useArrastreParaDescartar(onCerrar, nace)
  const contenido = useContenidoQuieto()
  return createPortal(
    <div
      ref={fondoRef}
      className="fixed inset-0 z-50 grid place-items-center bg-black/11 p-4"
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
        aria-label={titulo}
        tabIndex={-1}
        // Sin `transition` y con `will-change`: durante el arrastre todo lo escribe gsap.set.
        className={cn(
          CLASES_DE_VENTANA,
          'cursor-grab will-change-transform active:cursor-grabbing',
          ancho
        )}
      >
        <CabeceraDeVentana
          titulo={titulo}
          onCerrar={descartar}
          etiquetaCerrar={t('delfines.ventana.cerrar', 'Close')}
        />
        <div
          ref={contenido}
          className="min-h-0 flex-1 cursor-auto overflow-y-auto scrollbar-sleek px-5 pb-5"
        >
          {children(descartar)}
        </div>
      </div>
    </div>,
    document.body
  )
}

/**
 * El contenido no arrastra: acá se escribe, se selecciona texto y se copia un comando, y un
 * arrastre que arranca en un campo mueve la ventana en vez del cursor. Se agarra de la cabecera y
 * de los bordes. Va con un listener nativo porque Draggable escucha en la ventana, antes de que
 * React reparta el evento.
 */
function useContenidoQuieto(): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const nodo = ref.current
    if (!nodo) {
      return
    }
    const frenar = (evento: Event): void => evento.stopPropagation()
    const eventos = ['pointerdown', 'mousedown', 'touchstart'] as const
    for (const nombre of eventos) {
      nodo.addEventListener(nombre, frenar)
    }
    return () => {
      for (const nombre of eventos) {
        nodo.removeEventListener(nombre, frenar)
      }
    }
  }, [])
  return ref
}

/** La cabecera: el título y la ×. Aparte, para que una fixture la dibuje sin la física. */
export function CabeceraDeVentana({
  titulo,
  onCerrar,
  etiquetaCerrar
}: {
  titulo: string
  onCerrar: () => void
  etiquetaCerrar: string
}): React.JSX.Element {
  return (
    <header className="flex shrink-0 items-center gap-2 px-5 pt-5 pb-3">
      <h2 className="min-w-0 flex-1 truncate font-display text-lg leading-tight font-semibold tracking-tight">
        {titulo}
      </h2>
      <button
        type="button"
        aria-label={etiquetaCerrar}
        onClick={onCerrar}
        className="-mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-[background-color,transform] duration-150 ease-out hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-95"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </header>
  )
}

/** Las clases de la ventana, para la fixture que la dibuja quieta. */
export const CLASES_DE_VENTANA =
  'flex max-h-[min(44rem,calc(100vh-2rem))] max-w-full flex-col overflow-hidden rounded-[28px] bg-popover text-popover-foreground shadow-floating outline-none'

/** El botón principal: pill del color del texto, con presión al tocarlo. */
export const BOTON_PRINCIPAL =
  'inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-foreground px-5 text-sm font-medium text-background transition-[transform,opacity] duration-150 ease-[cubic-bezier(.34,1.56,.64,1)] hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-[.97] disabled:pointer-events-none disabled:opacity-40'

/** El secundario: tonal, la misma forma y la misma presión. */
export const BOTON_TONAL =
  'inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-accent px-4 text-sm font-medium text-foreground transition-[transform,background-color] duration-150 ease-[cubic-bezier(.34,1.56,.64,1)] hover:bg-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-[.97] disabled:pointer-events-none disabled:opacity-40'

/** Un campo tonal, sin borde, que sube un tono al pasar por encima. */
export const CAMPO =
  'h-11 w-full min-w-0 rounded-2xl bg-muted px-4 text-sm text-foreground outline-none transition-colors duration-150 placeholder:text-muted-foreground/70 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50'
