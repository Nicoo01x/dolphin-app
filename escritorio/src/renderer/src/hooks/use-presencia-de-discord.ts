import { useEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import { selectWorktreeById } from '@/store/workspaces/catalog/workspace-record-fields'
import { resolveWorktreeDisplayName } from '@/lib/workspace/display/worktree-default-display-name'

/**
 * Publica en Discord en qué proyecto y con qué lenguaje se está trabajando.
 *
 * Vive en el renderer porque es el único que sabe qué archivo está abierto; el socket está en el
 * proceso principal, que es también el que decide si la presencia corre (sin
 * `DOLPHIN_DISCORD_APP_ID` no se abre nada).
 *
 * El reloj de la sesión se toma una sola vez, al montar: Discord muestra «hace N minutos» y si el
 * inicio se recalculara en cada cambio de archivo el contador volvería a cero todo el tiempo.
 */
export function usePresenciaDeDiscord(): void {
  const proyecto = useAppStore((state) => {
    const id = state.activeWorktreeId
    if (!id) {
      return null
    }
    const worktree = selectWorktreeById(state, id)
    return worktree ? resolveWorktreeDisplayName(worktree) : null
  })
  const archivo = useAppStore((state) => {
    const id = state.activeFileId
    if (!id) {
      return null
    }
    return state.openFiles.find((abierto) => abierto.id === id)?.relativePath ?? null
  })
  // El reloj se toma en el efecto y no al armar la ref: `Date.now()` durante el render es impuro y
  // en un render descartado daría un inicio que nunca existió.
  const desde = useRef<number | null>(null)

  useEffect(() => {
    // Sin el puente no hay presencia, y eso no puede tirar nada: si el preload es viejo, la
    // llamada tira sincrónicamente acá adentro (es lo que pasó con `getCartelAssetBaseUrl`).
    const puente = window.api?.discord
    if (typeof puente?.publicarPresencia !== 'function') {
      return
    }
    desde.current ??= Date.now()
    puente.publicarPresencia({ proyecto, archivo, desde: desde.current })
  }, [proyecto, archivo])
}
