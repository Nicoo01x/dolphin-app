import { translate } from '@/i18n/i18n'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Play, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AgentIcon } from '@/components/agent/icons/AgentIcon'
import { isTuiAgent } from '../../../../shared/agent-launch/catalog/tui-agent-config'
import {
  eleccionPorDefecto,
  eleccionesDelCartel,
  posterDelCartel,
  tituloDelCartel,
  videoDelCartel,
  type CartelDeFuncion as Cartel
} from '../../../../shared/carteles-de-funcion'
import { useArrastreParaDescartar } from './use-arrastre-para-descartar'

/** Marca el contenido del cartel para que un popover vecino no lo lea como «afuera». */
export const CARTEL_MARCA = 'data-cartel-de-funcion'

/** La base de donde salen los clips: `resources/carteles` en la app, la raíz en la web. */
function useBaseDeClips(): string | null {
  const [base, setBase] = useState<string | null>(null)
  useEffect(() => {
    let cancelado = false
    // Por qué la guarda y no alcanza el `.catch()`: si el puente no está —una ventana de desarrollo
    // cuyo preload se compiló antes de que existiera este handler— la llamada tira sincrónicamente
    // acá adentro, el `.catch()` no corre nunca y el error se lleva puesto el árbol de React. Sin
    // base el cartel se queda sin clip, que es lo único que debería perderse.
    if (typeof window.api.app.getCartelAssetBaseUrl !== 'function') {
      setBase('')
      return
    }
    void window.api.app
      .getCartelAssetBaseUrl()
      .then((url) => {
        if (!cancelado) {
          setBase(url)
        }
      })
      .catch(() => {
        if (!cancelado) {
          setBase('')
        }
      })
    return () => {
      cancelado = true
    }
  }, [])
  return base
}

/** Quien pidió menos movimiento ve el cuadro quieto, no el clip. */
function useMenosMovimiento(): boolean {
  const [menos, setMenos] = useState(false)
  useEffect(() => {
    const consulta = window.matchMedia('(prefers-reduced-motion: reduce)')
    const mirar = (): void => setMenos(consulta.matches)
    mirar()
    consulta.addEventListener('change', mirar)
    return () => consulta.removeEventListener('change', mirar)
  }, [])
  return menos
}

function urlDe(base: string | null, archivo: string): string | undefined {
  if (!base) {
    return undefined
  }
  try {
    return new URL(archivo, base).toString()
  } catch {
    return undefined
  }
}

/** El clip, a todo lo ancho y arriba de todo: es lo que explica la función. */
function Clip({ cartel }: { cartel: Cartel }): React.JSX.Element {
  const base = useBaseDeClips()
  const menosMovimiento = useMenosMovimiento()
  const poster = urlDe(base, posterDelCartel(cartel))
  const video = urlDe(base, videoDelCartel(cartel))
  return (
    <div className="aspect-video w-full shrink-0 bg-black">
      {menosMovimiento || !video ? (
        poster ? (
          <img src={poster} alt={cartel.queSeVe} className="size-full object-cover" />
        ) : null
      ) : (
        <video
          src={video}
          poster={poster}
          aria-label={cartel.queSeVe}
          autoPlay
          loop
          muted
          playsInline
          preload="none"
          className="size-full object-cover"
        />
      )}
    </div>
  )
}

/**
 * La ventana del cartel: el video de lo que Dolphin hace, y la elección ahí mismo.
 *
 * Por qué una ventana centrada y no un popover colgado del botón: el clip es el contenido, y a
 * media pantalla se ve; pegado al compositor competía con el chat y quedaba contra el borde.
 *
 * Se arrastra para cerrarla con la física de `/nico-mockup` (ver `use-arrastre-para-descartar`), y
 * sale por un portal al `body` porque Draggable mide contra su padre y cualquier ancestro con
 * `transform` le corre el sistema de coordenadas.
 */
function VentanaDelCartel({
  cartel,
  nombreDelMotor,
  deshabilitado,
  nace,
  onElegir,
  onCerrar
}: {
  cartel: Cartel
  nombreDelMotor: string
  deshabilitado: boolean
  /** La caja del botón que la abrió: la ventana nace de ahí y vuelve ahí. */
  nace: DOMRect | null
  onElegir: (valor: string) => void
  onCerrar: () => void
}): React.JSX.Element {
  const { fondoRef, ventanaRef, descartar } = useArrastreParaDescartar(onCerrar, nace)
  const elecciones = eleccionesDelCartel(cartel)
  const porDefecto = eleccionPorDefecto(cartel)
  const titulo = tituloDelCartel(cartel, nombreDelMotor)

  return createPortal(
    <div
      ref={fondoRef}
      // El velo de /nico-mockup: 11 % de negro. La ventana se separa por su propia superficie.
      className="fixed inset-0 z-50 grid place-items-center bg-black/11 p-4"
      onPointerDown={(evento) => {
        if (evento.target === fondoRef.current) {
          descartar()
        }
      }}
    >
      <div
        {...{ [CARTEL_MARCA]: '' }}
        ref={ventanaRef}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        // Sin `transition` y con `will-change`: durante el arrastre todo lo escribe gsap.set.
        className="flex w-[40rem] max-w-full cursor-grab flex-col overflow-hidden rounded-xl bg-card shadow-floating outline-none ring-1 ring-border will-change-transform active:cursor-grabbing"
      >
        <Clip cartel={cartel} />
        <div className="flex flex-col gap-4 p-5">
          <div className="flex items-start gap-3">
            {isTuiAgent(cartel.motor) ? (
              <span className="mt-0.5 shrink-0">
                <AgentIcon agent={cartel.motor} size={20} />
              </span>
            ) : null}
            {/* La jerarquía la hacen el peso y el valor, no el tamaño: la escala del chat nativo
                tiene cuatro pasos y el de un título de tarjeta es `text-sm` (docs/STYLEGUIDE.md). */}
            <div className="flex min-w-0 flex-col gap-1">
              <h2 className="text-sm leading-tight font-semibold tracking-tight text-foreground">
                {titulo}
              </h2>
              <p className="text-xs leading-relaxed text-muted-foreground">{cartel.que}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="-mt-1 -mr-1 shrink-0"
              aria-label={translate('auto.components.native-chat.CartelDeFuncion.close', 'Close')}
              onClick={descartar}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
          {elecciones.length > 0 ? (
            <div className="flex flex-col gap-2">
              <span className="text-xs text-muted-foreground">
                {translate(
                  'auto.components.native-chat.CartelDeFuncion.whichModel',
                  'Which model should lead'
                )}
              </span>
              <div className="flex flex-wrap gap-2">
                {elecciones.map((eleccion) => (
                  <Button
                    key={eleccion.value}
                    type="button"
                    variant={eleccion.value === porDefecto ? 'default' : 'secondary'}
                    size="sm"
                    disabled={deshabilitado}
                    className="rounded-full px-4"
                    title={eleccion.description ?? undefined}
                    onClick={() => onElegir(eleccion.value)}
                  >
                    {eleccion.label}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  )
}

/**
 * El cartel de una función: un botón en el compositor, y la ventana con el video.
 *
 * Why un video y no una descripción: «delegar» no dice nada, y lo que la función hace —que una
 * tarea se parta y cada pedazo abra su propia terminal— se entiende viéndolo en diez segundos.
 *
 * Why las elecciones salen del catálogo de Dolphin: el cartel ofrece una función que existe;
 * ofrecer valores propios sería ofrecer algo que el CLI no toma.
 */
export function CartelDeFuncion({
  cartel,
  nombreDelMotor,
  deshabilitado,
  onElegir
}: {
  cartel: Cartel
  /** Cómo se llama el motor del chat: el cartel habla en nombre de la persona. */
  nombreDelMotor: string
  deshabilitado: boolean
  onElegir: (valor: string) => void
}): React.JSX.Element {
  const [abierto, setAbierto] = useState(false)
  const boton = useRef<HTMLButtonElement>(null)
  const titulo = tituloDelCartel(cartel, nombreDelMotor)
  return (
    <>
      <Button
        ref={boton}
        type="button"
        variant="ghost"
        size="xs"
        aria-expanded={abierto}
        aria-label={translate(
          'auto.components.native-chat.CartelDeFuncion.seeWhatItDoes',
          'See what it does: {{value0}}',
          { value0: titulo }
        )}
        onClick={() => setAbierto(true)}
      >
        <Play className="size-3" />
        {translate('auto.components.native-chat.CartelDeFuncion.delegate', 'Delegate')}
      </Button>
      {abierto ? (
        <VentanaDelCartel
          cartel={cartel}
          nombreDelMotor={nombreDelMotor}
          deshabilitado={deshabilitado}
          nace={boton.current?.getBoundingClientRect() ?? null}
          onCerrar={() => {
            setAbierto(false)
            boton.current?.focus()
          }}
          onElegir={(valor) => {
            setAbierto(false)
            onElegir(valor)
          }}
        />
      ) : null}
    </>
  )
}
