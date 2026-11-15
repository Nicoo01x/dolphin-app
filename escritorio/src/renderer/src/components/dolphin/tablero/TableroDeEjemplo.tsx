import { useEffect, useState } from 'react'
import { translate } from '@/i18n/i18n'
import { getWorktreeStatusLabel } from '@/lib/workspace/activity/worktree-status'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import type { TarjetaDelTablero } from '../../../../../shared/dolphin-tablero-types'
import {
  hastaElProximoCambio,
  MOMENTO_QUIETO,
  momentoDelEjemplo,
  type MomentoDelEjemplo
} from './ciclo-de-ejemplo'
import { ColumnasDelTablero } from './ColumnasDelTablero'

const ID_DEL_EJEMPLO = 'dolphin-ejemplo'

/**
 * El momento del ejemplo. Se despierta sólo cuando algo cambia (no hay bucle de cuadros), frena con
 * la ventana oculta y sigue donde quedó; con «reducir movimiento» queda quieto. `instante` lo
 * congela (para las capturas).
 */
function useCicloDeEjemplo(instante?: number): MomentoDelEjemplo {
  const quieto = usePrefersReducedMotion()
  const [momento, setMomento] = useState<MomentoDelEjemplo>(() =>
    instante !== undefined
      ? momentoDelEjemplo(instante)
      : quieto
        ? MOMENTO_QUIETO
        : momentoDelEjemplo(0)
  )
  useEffect(() => {
    if (instante !== undefined || quieto) {
      setMomento(instante !== undefined ? momentoDelEjemplo(instante) : MOMENTO_QUIETO)
      return
    }
    let corrido = 0
    let desde = performance.now()
    let reloj: number | undefined
    const tocar = (): void => {
      const ms = corrido + (performance.now() - desde)
      setMomento(momentoDelEjemplo(ms))
      reloj = window.setTimeout(tocar, hastaElProximoCambio(ms) + 16)
    }
    const alCambiarVisibilidad = (): void => {
      window.clearTimeout(reloj)
      if (document.hidden) {
        corrido += performance.now() - desde
      } else {
        desde = performance.now()
        tocar()
      }
    }
    tocar()
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    return () => {
      window.clearTimeout(reloj)
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
    }
  }, [instante, quieto])
  return momento
}

/**
 * El tablero sin tarjetas: las cinco columnas y una sola tarjeta de ejemplo que recorre el ciclo.
 * Es la explicación del producto sin un párrafo, y se va para siempre con la primera tarjeta real.
 */
export function TableroDeEjemplo({
  instante,
  llenar = false
}: {
  instante?: number
  /** Las columnas ocupan el alto disponible (el inicio sin trabajo). */
  llenar?: boolean
}): React.JSX.Element {
  const momento = useCicloDeEjemplo(instante)
  const tomada = momento.columna !== 'ideas' && momento.columna !== 'para-hacer'
  const tarjeta: TarjetaDelTablero = {
    id: ID_DEL_EJEMPLO,
    titulo: translate('auto.components.dolphin.tablero.exampleTitle', 'Add search to settings'),
    columna: momento.columna,
    tipo: 'tarea',
    movida: '',
    ...(tomada
      ? {
          quien: translate('auto.components.dolphin.tablero.exampleWho', 'agents'),
          rama: 'dolphin/search-settings'
        }
      : {})
  }
  const estado =
    momento.columna === 'haciendo' ? 'working' : momento.columna === 'para-revisar' ? 'done' : null
  return (
    <ColumnasDelTablero
      tarjetas={[tarjeta]}
      estadoDe={() => (estado ? { estado, etiqueta: getWorktreeStatusLabel(estado) } : undefined)}
      ejemplo={{ id: ID_DEL_EJEMPLO, llenas: momento.llenas, visible: momento.visible }}
      llenar={llenar}
    />
  )
}
