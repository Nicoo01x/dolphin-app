import { PictureInPicture2 } from 'lucide-react'
import { ContextMenuItem } from '@/components/ui/context-menu'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { useWorktreeById } from '@/store/workspaces/selection/use-selected-worktree'
import { desacoplarEditor, editorDesacoplable } from '@/components/editor/desacoplar-editor'
import type { OpenFile } from '@/store/slices/editor/types/open-file'

/**
 * «Sacar a la ventana flotante»: desacopla este editor del layout del proyecto.
 *
 * Qué se ve y qué no, y por qué: con el panel flotante apagado o en una pestaña que ya es del
 * workspace flotante la opción no aparece —no hay nada que explicar, es otra cosa—, pero un archivo
 * que no se puede mover **sí** aparece, apagado y con el motivo. Esconderlo ahí dejaría a alguien
 * buscando una opción que existe para sus otros archivos.
 */
export function DesacoplarEditorMenuItem({
  file,
  onClose
}: {
  readonly file: OpenFile & { tabId?: string }
  /** Cerrar esta pestaña del proyecto: el editor se va, no se duplica. */
  readonly onClose: () => void
}): React.JSX.Element | null {
  const openFiles = useAppStore((state) => state.openFiles)
  const openFile = useAppStore((state) => state.openFile)
  const abrirPanel = useAppStore((state) => state.setFloatingWorkspacePanelOpen)
  const panelFlotanteHabilitado = useAppStore(
    (state) => state.settings?.floatingTerminalEnabled === true
  )
  const worktree = useWorktreeById(file.worktreeId)

  const resultado = editorDesacoplable({
    openFiles,
    entityId: file.id,
    tabWorktreeId: file.worktreeId,
    tabExecutionHostId: worktree?.hostId ?? null,
    panelFlotanteHabilitado
  })

  if (
    resultado === 'panel-apagado' ||
    resultado === 'ya-flotante' ||
    resultado === 'no-es-archivo'
  ) {
    return null
  }

  const etiqueta = translate('components.tab.bar.desacoplar.editor', 'Move to the floating window')
  if (typeof resultado === 'string') {
    return (
      <ContextMenuItem
        disabled
        title={
          resultado === 'sin-guardar-en-disco'
            ? translate(
                'components.tab.bar.desacoplar.sinGuardar',
                'Save the file first: the floating window opens it by its path.'
              )
            : translate(
                'components.tab.bar.desacoplar.otraMaquina',
                'The floating window reads on this machine, and this file lives on another.'
              )
        }
      >
        <PictureInPicture2 className="size-3.5" />
        {etiqueta}
      </ContextMenuItem>
    )
  }

  return (
    <ContextMenuItem
      onSelect={() =>
        desacoplarEditor({
          archivo: resultado.archivo,
          openFile,
          cerrarPestana: onClose,
          abrirPanelFlotante: () => abrirPanel(true)
        })
      }
    >
      <PictureInPicture2 className="size-3.5" />
      {etiqueta}
    </ContextMenuItem>
  )
}
