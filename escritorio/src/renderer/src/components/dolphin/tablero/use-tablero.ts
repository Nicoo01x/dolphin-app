import { useCallback, useEffect, useState } from 'react'
import {
  hayTarjetas,
  type TableroLeido,
  type TarjetaDelTablero
} from '../../../../../shared/dolphin-tablero-types'

async function leerTablero(worktreeId: string): Promise<TableroLeido | 'error'> {
  try {
    return (await window.api?.dolphin?.leerTablero?.(worktreeId)) ?? { ok: false }
  } catch {
    // El puente falló: no es «sin tablero», es que no se pudo leer. El inicio lo dice.
    return 'error'
  }
}

/** Las tarjetas y el espacio de trabajo del que salieron: con él se sabe de qué proyecto son. */
export type TableroDeUnProyecto = { worktreeId: string; tarjetas: TarjetaDelTablero[] }

/** `undefined` leyendo, `null` ningún proyecto tiene tarjetas, `'error'` no se pudo leer. */
export type LecturaDelTablero = TableroDeUnProyecto | null | undefined | 'error'

/**
 * Las tarjetas del primer proyecto que tenga alguna, con el worktree de donde salieron.
 * Se pregunta de a uno y en orden: el inicio muestra un tablero, no una mezcla de todos.
 *
 * Se vuelve a leer al volver a la ventana (las tarjetas las mueven el CLI y los agentes por fuera
 * de la app) y cuando se pide (`releer`: después de mover una, o para reintentar).
 */
export function useLecturaDelTablero(worktreeIds: readonly string[]): {
  tablero: LecturaDelTablero
  releer: () => void
} {
  // `undefined` es «todavía leyendo» y `null` «ninguno tiene»: quien dibuja un vacío con su frase
  // no puede mostrarla mientras se lee, o parpadea «no hay tarjetas» antes de que aparezcan.
  const [tablero, setTablero] = useState<LecturaDelTablero>(undefined)
  const [vuelta, setVuelta] = useState(0)
  // Why la clave y no el array: el array es nuevo en cada render y volvería a leer sin parar.
  const clave = worktreeIds.join('\n')
  useEffect(() => {
    let vigente = true
    const leer = async (): Promise<void> => {
      let fallo = false
      for (const worktreeId of clave ? clave.split('\n') : []) {
        const leido = await leerTablero(worktreeId)
        if (!vigente) {
          return
        }
        if (leido === 'error') {
          fallo = true
        } else if (hayTarjetas(leido)) {
          setTablero({ worktreeId, tarjetas: leido.tarjetas })
          return
        }
      }
      setTablero(fallo ? 'error' : null)
    }
    const alVolver = (): void => void leer()
    void leer()
    window.addEventListener('focus', alVolver)
    return () => {
      vigente = false
      window.removeEventListener('focus', alVolver)
    }
  }, [clave, vuelta])
  const releer = useCallback(() => setVuelta((n) => n + 1), [])
  return { tablero, releer }
}

/** Lo mismo, para quien sólo distingue «hay», «no hay» y «leyendo» (un error cuenta como no hay). */
export function useTableroDeAlguno(
  worktreeIds: readonly string[]
): TableroDeUnProyecto | null | undefined {
  const { tablero } = useLecturaDelTablero(worktreeIds)
  return tablero === 'error' ? null : tablero
}
