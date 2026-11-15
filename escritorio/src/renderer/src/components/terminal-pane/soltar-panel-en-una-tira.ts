import type { PaneExternalDropTarget } from '@/lib/pane-manager/pane-manager-types'
import { useAppStore } from '../../store'
import { puedeCruzarALaFlotante } from './desacoplar-pane-a-la-flotante'
import { detachTerminalPaneToTab } from './layout/detach/terminal-pane-tab-detach'
import { isTerminalTabStripDropTarget } from './layout/detach/terminal-tab-strip-drop-target'

/** Lo que el panel soltado sabe de su propio transporte; `undefined` cuando todavía no lo tiene. */
type TransporteDelPanel = {
  getPtyId?: () => string | null
  isConnectPending?: () => boolean
}

/** La carpeta del panel, para el caso en que su terminal nazca recién al llegar. */
type CarpetaDelPanel = Parameters<typeof detachTerminalPaneToTab>[0]['sourcePaneCwd']

/**
 * Soltar un panel sobre una tira de pestañas: lo mueve a esa pestaña, y cuando la tira es la de la
 * ventana flotante, a ese otro workspace.
 *
 * Vive afuera del hook del panel porque desde que la tira puede ser de otro workspace esto decide
 * tres cosas —si la tira acepta el panel, si el panel puede cruzar y cuándo se muestra la ventana—
 * y el hook ya estaba en su techo de líneas.
 *
 * Devuelve si el drop se consumió. `true` también cuando no se movió nada y se avisó por qué: el
 * panel vuelve a su lugar, y el gesto igual terminó acá.
 */
export function soltarPanelEnUnaTira(args: {
  readonly sourcePaneId: number
  readonly target: PaneExternalDropTarget
  readonly worktreeId: string
  readonly sourceTabId: string
  readonly manager: Parameters<typeof detachTerminalPaneToTab>[0]['manager']
  readonly persistLayoutSnapshot: () => void
  readonly transport: TransporteDelPanel | undefined
  readonly paneCwd: CarpetaDelPanel
}): boolean {
  const { target, worktreeId } = args
  if (!isTerminalTabStripDropTarget(target)) {
    return false
  }
  // La tira que recibió el panel puede ser de la ventana flotante, que es otro workspace: ahí el
  // movimiento cruza y la pestaña nueva nace allá (`terminal-pane-tab-detach.ts`).
  const cruza = target.worktreeId !== worktreeId
  const hostId = useAppStore.getState().getKnownWorktreeById(worktreeId)?.hostId ?? null
  if (cruza && !puedeCruzarALaFlotante({ worktreeId, hostId })) {
    return true
  }
  void detachTerminalPaneToTab({
    livePtyId: args.transport?.getPtyId?.() ?? null,
    getStore: useAppStore.getState,
    manager: args.manager,
    persistLayoutSnapshot: args.persistLayoutSnapshot,
    sourcePaneId: args.sourcePaneId,
    ...(args.paneCwd ? { sourcePaneCwd: args.paneCwd } : {}),
    sourceConnectPending: args.transport?.isConnectPending?.() ?? false,
    sourceTabId: args.sourceTabId,
    targetGroupId: target.groupId,
    targetIndex: target.insertionIndex,
    worktreeId,
    ...(cruza ? { targetWorktreeId: target.worktreeId } : {})
  })
    .then((movido) => {
      // Al cruzar, la ventana se muestra recién cuando el panel llegó: abrirla antes la deja vacía
      // si el proceso principal rechaza el movimiento.
      if (movido && cruza) {
        useAppStore.getState().setFloatingWorkspacePanelOpen(true)
      }
    })
    .catch((error) => console.warn('[terminal-pane-detach] move failed', error))
  return true
}
