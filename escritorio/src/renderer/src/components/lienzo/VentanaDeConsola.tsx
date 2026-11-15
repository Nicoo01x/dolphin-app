import { useEffect, useRef } from 'react'
import { DOLPHIN_BROWSER_PARTITION } from '../../../../shared/browser/browser-session-partition'
import type { PanelLod } from './canvas'

/**
 * La consola de Dolphin adentro de una ventana del lienzo.
 *
 * La vista se pide por un canal propio (`window.dolphinVista`, como el tema) y no por el hash:
 * la consola lo pisa al arrancar, y así las ventanas terminaban mostrando todas lo mismo.
 *
 * Lejos (`snapshot`) no se monta el webview: veinte consolas vivas al alejarse son veinte
 * procesos pintando algo que no se lee. Queda su cartel, y al acercarse vuelve.
 */

/** La consola embebida, en la vista que le toca a esta ventana. */
export function urlDeLaConsola(base: string, vista: string, oscuro: boolean): string {
  const url = new URL(base)
  url.searchParams.set('embebida', '1')
  url.searchParams.set('tema', oscuro ? 'oscuro' : 'claro')
  // En el lienzo cada ventana ES una vista: su barra sería el mismo menú repetido en cada una,
  // y en una ventana chica se come la mitad del alto.
  url.searchParams.set('barra', '0')
  url.hash = vista
  return url.toString()
}

export function VentanaDeConsola({
  url,
  vista,
  zoom,
  detalle,
  titulo
}: {
  url: string
  vista: string
  zoom: number
  detalle: PanelLod
  titulo: string
}): React.JSX.Element {
  const webview = useRef<Electron.WebviewTag | null>(null)
  const listo = useRef(false)

  useEffect(() => {
    const tag = webview.current
    if (!tag) {
      return
    }
    const alCargar = (): void => {
      listo.current = true
      try {
        void tag
          .executeJavaScript(
            `window.dolphinVista?.(${JSON.stringify(vista)}) ?? (location.hash = ${JSON.stringify(`#${vista}`)})`
          )
          .catch(() => undefined)
        // El contenido se agranda acá y no con un transform del plano: así lo vuelve a dibujar
        // a su tamaño, nítido, en vez de estirar lo que ya había dibujado.
        tag.setZoomFactor(zoom)
      } catch {
        // Todavía cargando: el hash de la URL ya pide la vista correcta.
      }
    }
    tag.addEventListener('dom-ready', alCargar)
    return () => {
      listo.current = false
      tag.removeEventListener('dom-ready', alCargar)
    }
  }, [vista, zoom])

  useEffect(() => {
    const tag = webview.current
    if (!tag || !listo.current) {
      return
    }
    try {
      tag.setZoomFactor(zoom)
    } catch {
      // Se aplica en el próximo dom-ready.
    }
  }, [zoom])

  if (detalle !== 'live') {
    return (
      <div className="grid h-full place-items-center bg-muted/20 text-center text-muted-foreground">
        <span style={{ fontSize: Math.max(10, 13 * zoom) }}>{titulo}</span>
      </div>
    )
  }
  return (
    <webview
      ref={webview}
      src={url}
      partition={DOLPHIN_BROWSER_PARTITION}
      // Why el style: sin display explícito el webview nace con 0 de alto adentro de un flex.
      style={{ display: 'inline-flex', width: '100%', height: '100%' }}
    />
  )
}
