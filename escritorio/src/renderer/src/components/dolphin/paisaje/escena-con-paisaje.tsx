import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { FONDO_DEL_CHAT_DE_FABRICA } from '../../../../../shared/fondo-del-chat'
import { CapaDePaisaje } from './FondoDePaisaje'
import { fondoIncluido } from './fondos'
import { variablesDelPaisaje } from './use-fondo-del-chat'
import { vidrioDelPaisaje } from './vidrio-del-paisaje'

/**
 * Para las fixtures que miran una pantalla de la base sobre el óleo: pone en <html> lo mismo que
 * pone `FondoDePaisaje` (la marca, vidrio u opaco, las variables del velo y la pintura esmerilada
 * que pintan los paneles) y lo saca al desmontar. Lo de adentro se pinta recién con la pintura
 * esmerilada hecha, para que la captura muestre el vidrio de la app y no sólo su tinta.
 */
function useMarcaDelPaisaje(url: string, opaco: boolean): boolean {
  const [listo, setListo] = useState(false)
  useLayoutEffect(() => {
    const raiz = document.documentElement
    raiz.dataset.dolphinPaisaje = opaco ? 'opaco' : 'vidrio'
    for (const [nombre, valor] of Object.entries(
      variablesDelPaisaje(FONDO_DEL_CHAT_DE_FABRICA.velo)
    )) {
      raiz.style.setProperty(nombre, valor)
    }
    return () => {
      delete raiz.dataset.dolphinPaisaje
    }
  }, [opaco])
  useEffect(() => {
    let vigente = true
    void vidrioDelPaisaje(url).then((vidrio) => {
      if (!vigente) {
        return
      }
      if (vidrio) {
        const estilo = document.documentElement.style
        estilo.setProperty('--paisaje-vidrio-oscuro', `url(${JSON.stringify(vidrio.oscuro)})`)
        estilo.setProperty('--paisaje-vidrio-claro', `url(${JSON.stringify(vidrio.claro)})`)
      }
      setListo(true)
    })
    return () => {
      vigente = false
    }
  }, [url])
  return listo
}

/** Una ventana de `alto` px con la pintura detrás y la marca del paisaje puesta. */
export function EscenaConPaisaje({
  children,
  alto,
  opaco = false,
  fondo = 'sierra'
}: {
  children: ReactNode
  alto: number
  opaco?: boolean
  fondo?: string
}): React.JSX.Element {
  const url = fondoIncluido(fondo).url
  const listo = useMarcaDelPaisaje(url, opaco)
  return (
    <div
      className="relative flex w-full flex-col overflow-hidden"
      style={{ height: alto }}
      data-escena-lista={listo || undefined}
    >
      <CapaDePaisaje url={url} desenfoque={false} absoluta />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">{listo ? children : null}</div>
    </div>
  )
}

const ESPERA_MAXIMA_MS = 8_000

/** Para el `interact` de la fixture: la captura espera a que la escena tenga el vidrio hecho. */
export async function esperarEscena(cuadro: HTMLElement): Promise<void> {
  const hasta = Date.now() + ESPERA_MAXIMA_MS
  while (!cuadro.querySelector('[data-escena-lista]') && Date.now() < hasta) {
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  // Dos cuadros: lo de adentro se monta recién con la escena lista.
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
}
