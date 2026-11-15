import { useEffect, useRef } from 'react'
import { useAppStore } from '@/store'

/** Qué hacer con el espacio activo recién restaurado: soltarlo sólo si no tiene nada que mostrar. */
export function shouldLeaveRestoredWorkspace(args: {
  restored: boolean
  activeWorktreeId: string | null
  renderableTabCount: number
}): boolean {
  return args.restored && args.activeWorktreeId !== null && args.renderableTabCount === 0
}

/**
 * Al reabrir la app se restaura como activo el último espacio de trabajo. Si ese espacio quedó sin
 * ninguna pestaña, no hay grupo que dibujar: la ventana quedaba negra para siempre, sin barra ni +
 * (visto el 10/11/2026; la pantalla de inicio sólo aparece cuando no hay espacio activo).
 *
 * Cerrar la última pestaña ya suelta el espacio y vuelve al inicio (workspace-emptied-reaction.ts);
 * esto hace lo mismo para el que llega vacío desde el disco.
 *
 * Why una sola vez, al terminar la restauración, y no un efecto permanente: elegir en la barra un
 * espacio sin pestañas lo deja vacío un instante antes de abrirle su terminal, y un efecto
 * permanente lo soltaría en ese instante.
 */
export function useLeaveEmptyRestoredWorkspace(): void {
  const restored = useAppStore(
    (state) => state.workspaceSessionReady && state.terminalStartupRestorationReady
  )
  const done = useRef(false)
  useEffect(() => {
    if (!restored || done.current) {
      return
    }
    done.current = true
    const state = useAppStore.getState()
    const activeWorktreeId = state.activeWorktreeId
    if (activeWorktreeId === null || state.activeView !== 'terminal') {
      return
    }
    const { renderableTabCount } = state.reconcileWorktreeTabModel(activeWorktreeId)
    if (shouldLeaveRestoredWorkspace({ restored, activeWorktreeId, renderableTabCount })) {
      state.setActiveWorktree(null)
    }
  }, [restored])
}
