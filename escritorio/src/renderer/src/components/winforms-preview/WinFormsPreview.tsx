import { useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { openAddToChatMenuAt } from '@/components/native-chat/selection-quotes/add-to-chat-point-menu'
import { formatNativeChatQuote } from '@/components/native-chat/selection-quotes/native-chat-quote-selection'
import { useTranslate } from '@/i18n/use-translate'
import { useAppStore } from '@/store'
import type { OpenFile } from '@/store/slices/editor/types/open-file'
import { referenciaDeControl } from '../../../../shared/winforms/winforms-controls'
import type { WinFormsControl } from '../../../../shared/winforms/winforms-preview-types'
import { raizDesdeRelativo, useWinFormsSession } from './use-winforms-session'
import { WinFormsPreviewView, type AccionesDeVistaPrevia } from './WinFormsPreviewView'

const carpetaDe = (ruta: string): string => ruta.replace(/[\\/][^\\/]*$/, '')

/** Abre el .Designer.cs en el editor y lleva el cursor a la línea del control. */
function abrirEnLinea(file: OpenFile, designer: string, relativo: string, linea: number): void {
  const state = useAppStore.getState()
  state.openFile(
    {
      filePath: designer,
      relativePath: relativo,
      worktreeId: file.worktreeId,
      runtimeEnvironmentId: file.runtimeEnvironmentId,
      language: 'csharp',
      mode: 'edit'
    },
    { preview: true }
  )
  state.setPendingEditorReveal(null)
  // Dos cuadros: el editor monta Monaco de forma asíncrona antes de poder revelar la línea.
  requestAnimationFrame(() =>
    requestAnimationFrame(() =>
      useAppStore
        .getState()
        .setPendingEditorReveal({ filePath: designer, line: linea, column: 1, matchLength: 0 })
    )
  )
}

/** La pestaña de vista previa de un formulario WinForms (modo de editor 'winforms-preview'). */
export default function WinFormsPreview({ file }: { file: OpenFile }): React.JSX.Element {
  const t = useTranslate()
  const raiz = useMemo(
    () => raizDesdeRelativo(file.filePath, file.relativePath),
    [file.filePath, file.relativePath]
  )
  const { estado, reabrir, cerrarDialogo } = useWinFormsSession(file.filePath, raiz)
  const designer = estado.plan?.designer ?? null
  const designerVisible = designer ? file.relativePath.replace(/\.cs$/i, '.Designer.cs') : null
  const clase =
    file.winformsPreviewClass ?? file.relativePath.split(/[\\/]/).pop()?.replace(/\.cs$/i, '') ?? ''

  const ubicar = useCallback(
    async (nombre: string) =>
      designer ? ((await window.api?.winforms?.ubicar({ designer, nombre })) ?? null) : null,
    [designer]
  )

  const referencia = useCallback(
    async (control: WinFormsControl, camino: string[]): Promise<string> =>
      referenciaDeControl({
        control,
        camino,
        formulario: estado.plan?.nombreCompleto ?? clase,
        titulo: estado.titulo,
        designer,
        designerVisible,
        lineas: (await ubicar(control.nombre)) ?? { declaracion: null, configuracion: null }
      }),
    [estado.plan?.nombreCompleto, estado.titulo, clase, designer, designerVisible, ubicar]
  )

  const acciones: AccionesDeVistaPrevia = {
    onRecargar: () => reabrir(),
    onUsarBuild: (ruta) => reabrir(ruta),
    onElegirEnsamblado: () => {
      const desde = estado.build ? carpetaDe(estado.build.build.ruta) : carpetaDe(file.filePath)
      void window.api?.winforms?.elegirEnsamblado(desde).then((ruta) => {
        if (ruta) {
          reabrir(ruta)
        }
      })
    },
    onCerrarDialogo: cerrarDialogo,
    onAbrirDesigner: (linea) => {
      if (designer && designerVisible) {
        abrirEnLinea(file, designer, designerVisible, linea)
      }
    },
    onEnviar: (control, camino, origen) => {
      const caja = origen.getBoundingClientRect()
      void referencia(control, camino).then((texto) =>
        openAddToChatMenuAt({
          worktreeId: file.worktreeId,
          quote: formatNativeChatQuote(texto),
          launchSource: 'native_chat',
          x: caja.left,
          y: caja.bottom + 4
        })
      )
    },
    onCopiar: (control, camino) => {
      void referencia(control, camino)
        .then((texto) => navigator.clipboard.writeText(texto))
        .then(() => toast.success(t('winformsPreview.copied', 'Reference copied')))
    },
    ubicar
  }

  return (
    <WinFormsPreviewView
      estado={estado}
      clase={clase}
      designerVisible={designerVisible}
      acciones={acciones}
    />
  )
}
