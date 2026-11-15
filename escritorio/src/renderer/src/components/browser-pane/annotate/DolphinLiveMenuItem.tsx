import React, { useCallback } from 'react'
import { toast } from 'sonner'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { DolphinMark } from '@/components/dolphin/DolphinMark'
import { dolphinRunsFor } from '@/components/dolphin/dolphin-available'
import { dolphinFailureMessage } from '@/components/dolphin/dolphin-failure'
import { useAppStore } from '@/store'
import { useWorktreeById } from '@/store/workspaces/selection/use-selected-worktree'
import { translate } from '@/i18n/i18n'
import type { BrowserPageAnnotation } from '../../../../../shared/browser/element-grab/browser-grab-types'
import { sendAnnotationsToDolphin } from './dolphin-live'

/**
 * El modo live de Dolphin en el menú de las anotaciones: lo que tocaste en la app y lo que
 * pediste va a Dolphin, que lo hace en una rama propia, la pasa por el portón y la deja para
 * mergear. Siembra sobre el worktree de este panel: es donde corre el dev server, así que al
 * mergear la rama, la app se actualiza sola.
 */
export function DolphinLiveMenuItem({
  worktreeId,
  annotations,
  onPromptHandedOff
}: {
  worktreeId: string
  annotations: readonly BrowserPageAnnotation[]
  onPromptHandedOff?: (delivered: Promise<unknown>) => void
}): React.JSX.Element | null {
  const worktree = useWorktreeById(worktreeId)
  const repo = useAppStore((s) =>
    worktree ? s.repos.find((r) => r.id === worktree.repoId) : undefined
  )
  const openDolphinPage = useAppStore((s) => s.openDolphinPage)
  const removeDelivered = useAppStore((s) => s.removeDeliveredBrowserPageAnnotations)
  const repoPath = worktree?.path
  const label = worktree?.displayName ?? ''

  const send = useCallback(() => {
    if (!repoPath) {
      return
    }
    const toastId = toast.loading(
      translate('auto.components.browser-pane.dolphinLive.sending', 'Sending it to Dolphin…')
    )
    const delivered = sendAnnotationsToDolphin(annotations, repoPath, (request) =>
      window.api.dolphin.live(request)
    ).then((result) => {
      // Why acá: salen de la bandeja solo las que llegaron. Si Dolphin se corta a mitad, las que no
      // salieron quedan para mandarlas de nuevo.
      const byPage = new Map<string, BrowserPageAnnotation[]>()
      for (const annotation of result.sent) {
        byPage.set(annotation.browserPageId, [
          ...(byPage.get(annotation.browserPageId) ?? []),
          annotation
        ])
      }
      for (const [pageId, sent] of byPage) {
        removeDelivered(pageId, sent)
      }
      if (result.failure) {
        toast.error(dolphinFailureMessage(result.failure), { id: toastId })
      } else {
        toast.success(
          translate(
            'auto.components.browser-pane.dolphinLive.sent',
            'Dolphin is making the change in its own branch. Merge it and the app updates.'
          ),
          {
            id: toastId,
            // Why: lleva una acción; con la duración de siempre se iba antes de que se pudiera tocar.
            duration: 10_000,
            action: {
              label: translate('auto.components.browser-pane.dolphinLive.open', 'Watch it'),
              // Why el worktree: la siembra está en su consola, no en la del proyecto.
              onClick: () => openDolphinPage('tablero', { path: repoPath, label })
            }
          }
        )
      }
      // Why false: lo que llegó ya salió arriba. Con true, la bandeja sacaba también lo que no salió.
      return { delivered: false }
    })
    onPromptHandedOff?.(delivered)
  }, [annotations, label, onPromptHandedOff, openDolphinPage, removeDelivered, repoPath])

  if (!repoPath || !dolphinRunsFor(repo)) {
    return null
  }
  return (
    <>
      <DropdownMenuItem onSelect={send}>
        <DolphinMark className="size-4" />
        {translate('auto.components.browser-pane.dolphinLive.item', 'Dolphin: make the change')}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
    </>
  )
}
