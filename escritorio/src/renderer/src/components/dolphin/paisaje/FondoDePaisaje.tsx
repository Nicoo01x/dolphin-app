import { useEffect, useLayoutEffect, useState } from 'react'
import { useFondoDelChat, useUrlDelFondo, variablesDelPaisaje } from './use-fondo-del-chat'
import { usePaisajeActivo } from './paisaje-activo'
import { vidrioDelPaisaje, type VidrioDelPaisaje } from './vidrio-del-paisaje'
import './paisaje.css'
import './paisaje-paginas.css'

/**
 * La pintura detrás de la ventana entera (`docs/reforma/chat-con-paisaje.md`).
 *
 * Una capa fija debajo de todo, de borde a borde, con el óleo y su velo, y la marca
 * `data-dolphin-paisaje` en <html> para que `paisaje.css` vuelva vidrio a todo lo que va encima: la
 * barra de pestañas, la barra lateral, el chat, el editor, la terminal, el panel derecho y la barra
 * de estado. Cada panel pinta la pintura esmerilada (`vidrio-del-paisaje.ts`) con su tinta, y el
 * chat vacío deja ver la pintura directa.
 *
 * Rendimiento: la imagen es un <img> con `decoding="async"` en su propia capa y no se toca después
 * de cargar; escribir en el chat no la repinta. El esmerilado se hace una vez por imagen en un
 * lienzo de 480 px y los paneles lo pintan fijo a la ventana: ningún `backdrop-filter` sobre los
 * paneles grandes, que se recalcularía con cada tecla y cada scroll.
 */
export function FondoDePaisaje(): React.JSX.Element | null {
  const fondo = useFondoDelChat()
  const url = useUrlDelFondo(fondo.fuente)
  const vidrio = useVidrio(url)
  const conVidrio = !fondo.panelesOpacos

  useLayoutEffect(() => {
    const raiz = document.documentElement
    if (!url) {
      delete raiz.dataset.dolphinPaisaje
      usePaisajeActivo.setState({ activo: false, vidrio: false })
      return
    }
    raiz.dataset.dolphinPaisaje = conVidrio ? 'vidrio' : 'opaco'
    usePaisajeActivo.setState({ activo: true, vidrio: conVidrio })
    for (const [nombre, valor] of Object.entries(variablesDelPaisaje(fondo.velo))) {
      raiz.style.setProperty(nombre, valor)
    }
    return () => {
      delete raiz.dataset.dolphinPaisaje
      usePaisajeActivo.setState({ activo: false, vidrio: false })
    }
  }, [url, fondo.velo, conVidrio])

  useLayoutEffect(() => {
    const raiz = document.documentElement.style
    if (!vidrio) {
      raiz.removeProperty('--paisaje-vidrio-oscuro')
      raiz.removeProperty('--paisaje-vidrio-claro')
      return
    }
    // JSON.stringify: una URL `blob:` entre comillas no puede romper la declaración de CSS.
    raiz.setProperty('--paisaje-vidrio-oscuro', `url(${JSON.stringify(vidrio.oscuro)})`)
    raiz.setProperty('--paisaje-vidrio-claro', `url(${JSON.stringify(vidrio.claro)})`)
  }, [vidrio])

  return url ? <CapaDePaisaje url={url} desenfoque={fondo.desenfoque} /> : null
}

/** La pintura esmerilada de la imagen activa; `null` mientras se hace o si no se pudo. */
function useVidrio(url: string | null): VidrioDelPaisaje | null {
  const [hecho, setHecho] = useState<{ url: string; vidrio: VidrioDelPaisaje | null } | null>(null)
  useEffect(() => {
    if (!url) {
      return
    }
    let vigente = true
    void vidrioDelPaisaje(url).then((vidrio) => {
      if (vigente) {
        setHecho({ url, vidrio })
      }
    })
    return () => {
      vigente = false
    }
  }, [url])
  return hecho && hecho.url === url ? hecho.vidrio : null
}

/** El cuadro y su velo, sin lógica: lo usa la ventana y lo usan las fixtures (con `absoluta`). */
export function CapaDePaisaje({
  url,
  desenfoque,
  absoluta = false
}: {
  url: string
  desenfoque: boolean
  absoluta?: boolean
}): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      className="dolphin-paisaje"
      data-desenfoque={desenfoque || undefined}
      style={absoluta ? { position: 'absolute', zIndex: 0 } : undefined}
    >
      <img className="dolphin-paisaje-imagen" src={url} alt="" decoding="async" draggable={false} />
      <div className="dolphin-paisaje-velo" />
    </div>
  )
}
