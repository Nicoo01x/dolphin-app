import { isWindowsDesktopClient } from '@/lib/files/os-open/windows-path-access'
import { useAppStore } from '@/store'
import { archivoPrincipal } from '../../../../shared/winforms/winforms-form-detection'

export type WinFormsPreviewTarget = {
  /** Ruta absoluta del .cs (si llega el .Designer.cs, se abre el principal). */
  filePath: string
  relativePath: string
  worktreeId: string
  runtimeEnvironmentId?: string | null
  /** Namespace.Clase, si ya se sabe; la pestaña lo muestra mientras carga. */
  className?: string
}

export const winFormsPreviewId = (filePath: string): string => `winforms-preview::${filePath}`

/**
 * Abre (o enfoca) la pestaña de vista previa de un formulario. Es una pestaña del editor con modo
 * propio: no lee el .cs, dibuja el build a través del host nativo.
 */
export function openWinFormsPreview(target: WinFormsPreviewTarget): void {
  const filePath = archivoPrincipal(target.filePath)
  const relativePath = archivoPrincipal(target.relativePath)
  const id = winFormsPreviewId(filePath)
  useAppStore.getState().openFile(
    {
      filePath,
      relativePath,
      worktreeId: target.worktreeId,
      runtimeEnvironmentId: target.runtimeEnvironmentId,
      language: 'csharp',
      mode: 'winforms-preview',
      ...(target.className ? { winformsPreviewClass: target.className } : {})
    },
    { reopenId: id, preview: false, focusEditor: true }
  )
}

/** La acción existe sólo en el escritorio de Windows: el host es un .exe de .NET Framework. */
export function winFormsPreviewAvailable(): boolean {
  return Boolean(window.api?.winforms) && isWindowsDesktopClient()
}
