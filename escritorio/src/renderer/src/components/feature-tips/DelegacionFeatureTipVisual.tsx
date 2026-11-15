import { useEffect, useState, type JSX } from 'react'
import {
  cartelesDeFuncionDe,
  posterDelPanel,
  videoDelPanel
} from '../../../../shared/carteles-de-funcion'

/**
 * El panel de muestra del aviso de delegación: el clip de la delegación, no una captura.
 *
 * Los demás avisos muestran un dibujo del panel que van a prender. Acá lo que hay que entender es
 * un movimiento —una tarea que se parte y tres terminales que se abren solas—, y eso en una imagen
 * quieta no se ve. El clip lo arma `branding/videos/carteles` y viaja en `resources/carteles`.
 */

/** La base de donde salen los clips: `resources/carteles` en la app, la raíz en la web. */
function useBaseDeClips(): string | null {
  const [base, setBase] = useState<string | null>(null)
  useEffect(() => {
    let cancelado = false
    // Sin el puente no hay clip, y eso no puede tirar abajo el aviso: la llamada tira
    // sincrónicamente acá adentro si el preload no lo trae, y el `.catch()` no la agarra.
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

/** Quien pidió menos movimiento ve el cuadro quieto. */
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

export function DelegacionFeatureTipVisual(): JSX.Element | null {
  const base = useBaseDeClips()
  const menosMovimiento = useMenosMovimiento()
  const cartel = cartelesDeFuncionDe('claude')[0]
  if (!cartel) {
    return null
  }
  const poster = urlDe(base, posterDelPanel(cartel))
  const video = urlDe(base, videoDelPanel(cartel))
  return (
    // Llena el panel: el clip tiene su proporción, así que no queda ni banda muerta ni recorte.
    <div className="size-full overflow-hidden bg-black">
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
