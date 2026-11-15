import { translate } from '@/i18n/i18n'
import { ArrowLeft, ArrowRight, RotateCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { DOLPHIN_BROWSER_PARTITION } from '../../../../shared/browser/browser-session-partition'
import type { PanelLod } from './canvas'

/**
 * Un navegador adentro de una ventana del lienzo.
 *
 * Está para lo que uno hace de verdad cuando un agente escribe: mirar la app de esa rama andando,
 * al lado de la terminal del agente que la está escribiendo. Cada rama levanta en su puerto —lo
 * dice el portón— y acá se escribe esa dirección.
 *
 * La barra es la mínima: atrás, adelante, recargar y dónde estás. No hay pestañas ni marcadores a
 * propósito: una ventana del lienzo ES una pestaña, y para tener dos se abren dos.
 */

/** Lo que se escribe en la barra, llevado a una dirección que el webview acepte. */
export function direccionDeLoEscrito(escrito: string): string | null {
  const limpio = escrito.trim()
  if (limpio === '') {
    return null
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(limpio)) {
    return limpio
  }
  // `localhost:5173` y `127.0.0.1:3000` son lo que más se escribe acá: sin esto, el navegador los
  // trata como una búsqueda.
  if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(limpio)) {
    return `http://${limpio}`
  }
  return `https://${limpio}`
}

/**
 * Dónde abre: el puerto donde levanta la mayoría de las apps que uno mira al lado del agente.
 *
 * No es 5173 —el del renderer de esta misma app— por una razón boba y real: ahí se cargaba Dolphin
 * adentro de Dolphin. 3000 es lo que levantan Next, Rails y la mayoría de los `npm run dev`; y si
 * no hay nada escuchando, la ventana lo dice y se escribe otro.
 */
const PUERTO_DE_ARRANQUE = 'http://localhost:3000'

export function VentanaDeNavegador({
  zoom,
  detalle,
  titulo
}: {
  zoom: number
  detalle: PanelLod
  titulo: string
}): React.JSX.Element {
  const webview = useRef<Electron.WebviewTag | null>(null)
  const [escrito, setEscrito] = useState(PUERTO_DE_ARRANQUE)
  const [donde, setDonde] = useState(PUERTO_DE_ARRANQUE)
  const [falla, setFalla] = useState<string | null>(null)

  const ir = useCallback((hacia: string): void => {
    const url = direccionDeLoEscrito(hacia)
    if (!url) {
      return
    }
    setFalla(null)
    setDonde(url)
    setEscrito(url)
  }, [])

  useEffect(() => {
    const tag = webview.current
    if (!tag) {
      return
    }
    // La dirección de la barra sigue a la navegación de adentro: si la página redirige o se toca
    // un link, la barra tiene que decir dónde estás de verdad.
    const alNavegar = (e: Electron.DidNavigateEvent): void => setEscrito(e.url)
    // ERR_ABORTED (-3) es lo que tira una navegación que se cancela sola; no es una caída.
    const alFallar = (e: Electron.DidFailLoadEvent): void => {
      if (e.errorCode !== -3) {
        setFalla(`No pude abrir ${e.validatedURL || donde}.`)
      }
    }
    tag.addEventListener('did-navigate', alNavegar)
    tag.addEventListener('did-fail-load', alFallar)
    return () => {
      tag.removeEventListener('did-navigate', alNavegar)
      tag.removeEventListener('did-fail-load', alFallar)
    }
  }, [donde])

  if (detalle !== 'live') {
    return (
      <div className="grid h-full place-items-center bg-muted/20 text-center text-muted-foreground">
        <span style={{ fontSize: Math.max(10, 13 * zoom) }}>{titulo}</span>
      </div>
    )
  }

  const mover = (que: 'atras' | 'adelante' | 'recargar'): void => {
    const tag = webview.current
    if (!tag) {
      return
    }
    if (que === 'atras' && tag.canGoBack()) {
      tag.goBack()
    } else if (que === 'adelante' && tag.canGoForward()) {
      tag.goForward()
    } else if (que === 'recargar') {
      tag.reload()
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex flex-none items-center gap-1 px-1.5 py-1.5">
        <BotonDeBarra etiqueta="Atrás" alTocar={() => mover('atras')}>
          <ArrowLeft aria-hidden="true" className="size-3.5" />
        </BotonDeBarra>
        <BotonDeBarra etiqueta="Adelante" alTocar={() => mover('adelante')}>
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </BotonDeBarra>
        <BotonDeBarra etiqueta="Recargar" alTocar={() => mover('recargar')}>
          <RotateCw aria-hidden="true" className="size-3.5" />
        </BotonDeBarra>
        <form
          className="min-w-0 flex-1"
          onSubmit={(e) => {
            e.preventDefault()
            ir(escrito)
          }}
        >
          <input
            value={escrito}
            onChange={(e) => setEscrito(e.target.value)}
            spellCheck={false}
            aria-label={translate('canvas.address', 'Address')}
            placeholder="localhost:5173"
            className="h-7 w-full rounded-md bg-muted/50 px-2.5 text-[12px] text-foreground outline-none placeholder:text-muted-foreground focus-visible:bg-muted"
          />
        </form>
      </div>
      <div className="relative min-h-0 flex-1">
        <webview
          ref={webview}
          src={donde}
          partition={DOLPHIN_BROWSER_PARTITION}
          // Why el style: sin display explícito el webview nace con 0 de alto adentro de un flex.
          style={{ display: 'inline-flex', width: '100%', height: '100%' }}
        />
        {falla && (
          <div className="absolute inset-0 grid place-items-center bg-background px-6 text-center text-[13px] text-muted-foreground">
            {falla}
          </div>
        )}
      </div>
    </div>
  )
}

function BotonDeBarra({
  etiqueta,
  alTocar,
  children
}: {
  etiqueta: string
  alTocar: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={alTocar}
      aria-label={etiqueta}
      title={etiqueta}
      className="grid size-7 flex-none place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  )
}
