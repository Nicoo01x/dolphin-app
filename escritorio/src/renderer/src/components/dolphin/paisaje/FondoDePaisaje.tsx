import { useLayoutEffect } from 'react'
import { useFondoDelChat, useUrlDelFondo, variablesDelPaisaje } from './use-fondo-del-chat'
import { usePaisajeActivo } from './paisaje-activo'
import './paisaje.css'

/**
 * La pintura detrás de la ventana entera (`docs/reforma/chat-con-paisaje.md`).
 *
 * Una capa fija debajo de todo, con el óleo y su velo, y la marca `data-dolphin-paisaje` en <html>
 * para que `paisaje.css` vuelva translúcidos los paneles que van encima: la barra lateral, el chat y
 * el panel derecho. La barra de pestañas y la de estado quedan opacas, como en la referencia: la
 * pintura vive entre las dos.
 *
 * Rendimiento: la imagen es un <img> con `decoding="async"` en su propia capa y no se toca después
 * de cargar; escribir en el chat no la repinta. El velo son gradientes de CSS, no otra imagen. El
 * desenfoque, si está prendido, es un `filter` sobre esa misma capa (se calcula una vez), no un
 * `backdrop-filter` por panel, que se recalcula con cada cambio de lo que tiene encima.
 */
export function FondoDePaisaje(): React.JSX.Element | null {
  const fondo = useFondoDelChat()
  const url = useUrlDelFondo(fondo.fuente)

  useLayoutEffect(() => {
    const raiz = document.documentElement
    if (!url) {
      delete raiz.dataset.dolphinPaisaje
      usePaisajeActivo.setState({ activo: false })
      return
    }
    raiz.dataset.dolphinPaisaje = ''
    usePaisajeActivo.setState({ activo: true })
    for (const [nombre, valor] of Object.entries(variablesDelPaisaje(fondo.velo))) {
      raiz.style.setProperty(nombre, valor)
    }
    return () => {
      delete raiz.dataset.dolphinPaisaje
      usePaisajeActivo.setState({ activo: false })
    }
  }, [url, fondo.velo])

  return url ? <CapaDePaisaje url={url} desenfoque={fondo.desenfoque} /> : null
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
