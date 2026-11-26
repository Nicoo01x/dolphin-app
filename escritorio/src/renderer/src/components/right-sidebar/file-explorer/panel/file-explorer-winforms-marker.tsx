import { AppWindow } from 'lucide-react'
import { useTranslate } from '@/i18n/use-translate'
import { useAppStore } from '@/store'
import type { TipoWinForms } from '@/lib/winforms/winforms-explorer-kind'
import { openWinFormsPreview } from '@/lib/winforms/winforms-preview-open'
import type { TreeNode } from '../tree/file-explorer-types'
import { fileExplorerNodeTabRelativePath } from '../tree/file-explorer-directory-listing'

/**
 * La marca de formulario en la fila del explorador: dice que ese .cs se puede ver, y un clic en ella
 * abre la vista previa (el clic en el resto de la fila sigue abriendo el código). Vive dentro del
 * botón de la fila, por eso es un span con rol de botón y no un botón anidado.
 */
export function WinFormsRowMarker({
  node,
  kind
}: {
  node: TreeNode
  kind: NonNullable<TipoWinForms>
}): React.JSX.Element {
  const t = useTranslate()
  const label =
    kind === 'control'
      ? t('winformsPreview.openControl', 'Preview Control')
      : t('winformsPreview.openForm', 'Preview Form')
  const abrir = (): void => {
    const worktreeId = useAppStore.getState().activeWorktreeId
    if (worktreeId) {
      openWinFormsPreview({
        filePath: node.path,
        relativePath: fileExplorerNodeTabRelativePath(node),
        worktreeId
      })
    }
  }
  return (
    <span
      role="button"
      tabIndex={-1}
      title={label}
      aria-label={label}
      className="ml-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-background hover:text-foreground"
      onClick={(event) => {
        event.stopPropagation()
        abrir()
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.stopPropagation()
          abrir()
        }
      }}
    >
      <AppWindow className="size-3" />
    </span>
  )
}
