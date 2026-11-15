import type { OpenFile } from '@/store/slices/editor/types/open-file'
import { LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../shared/constants'
import { isFloatingWorkspaceId } from '../../../../shared/floating-workspace-worktree'
import { detectLanguage } from '../../../../shared/editor-language/editor-language-detect'

/**
 * Desacoplar un editor: sacarlo del layout del proyecto y pasarlo al panel flotante, que ya es una
 * ventana movible, redimensionable y que se puede maximizar encima de todo.
 *
 * Por qué al panel flotante y no a una ventana de Electron aparte: el panel flotante ya hospeda
 * paneles de editor, de navegador y de terminal —es el mismo árbol de grupos montado en otro
 * anfitrión, con `tabStrip="external"`— así que desacoplar no estrena una superficie: reusa una que
 * ya funciona. Una ventana del sistema aparte tendría que replicar por IPC el estado del que
 * depende el editor para leer un archivo (ruteo de runtime, dueño del worktree, conexión del host),
 * que es exactamente lo que hace la ventana Space y es un contrato grande y propio.
 *
 * Y por qué no se pierde nada al moverlo: la identidad del búfer de un editor es el archivo físico
 * —entorno, host y ruta— y **el workspace no es parte de ella** (`editor-buffer-identity.ts`). O
 * sea que el archivo abierto en el workspace flotante es el mismo búfer que el de la pestaña
 * original: los cambios sin guardar viajan con él en vez de quedarse atrás.
 *
 * Y por qué esto es un movimiento y no una copia: `openFile` busca un archivo ya abierto por
 * **owner** (worktree + entorno de runtime), no sólo por ruta, así que el mismo archivo bajo el
 * workspace flotante no encuentra al original y nace como su propio registro con id propio
 * (`open-file-apply.ts`). Quedan dos pestañas de un archivo por un momento —y es justo por eso que
 * primero se abre y después se cierra—, y al cerrar la del proyecto queda una sola.
 */
export type EditorDesacoplable = {
  readonly archivo: OpenFile
}

export type MotivoNoDesacoplable =
  | 'panel-apagado'
  | 'ya-flotante'
  | 'no-es-archivo'
  | 'sin-guardar-en-disco'
  | 'de-otra-maquina'

/**
 * Qué editor se puede desacoplar, y cuando no, por qué. El motivo se devuelve en vez de un booleano
 * para que el menú pueda explicar por qué la opción no está, en vez de esconderla sin decir nada.
 */
export function editorDesacoplable(args: {
  readonly openFiles: readonly OpenFile[]
  /** `entityId` de la pestaña unificada: para un editor es el id del `OpenFile`. */
  readonly entityId: string
  readonly tabWorktreeId: string
  readonly tabExecutionHostId?: string | null
  /** `settings.floatingTerminalEnabled`: sin el panel no hay a dónde sacarlo. */
  readonly panelFlotanteHabilitado: boolean
}): EditorDesacoplable | MotivoNoDesacoplable {
  if (!args.panelFlotanteHabilitado) {
    return 'panel-apagado'
  }
  if (isFloatingWorkspaceId(args.tabWorktreeId)) {
    return 'ya-flotante'
  }
  const archivo = args.openFiles.find((candidato) => candidato.id === args.entityId)
  if (!archivo) {
    return 'no-es-archivo'
  }
  // `mode` es lo que decide qué muestra la pestaña, y el propio tipo avisa que hay que mirarlo
  // antes que `filePath`. Sólo `edit` es un archivo: un diff, una revisión de conflicto, el
  // detalle de un check o una previa de markdown son vistas derivadas que se arman con el estado
  // del proyecto, y el workspace flotante no lo tiene — la pestaña saldría vacía.
  if (archivo.mode !== 'edit') {
    return 'no-es-archivo'
  }
  // Un «sin título» no existe en disco todavía, así que abrirlo de nuevo por su ruta daría una
  // pestaña vacía en vez del borrador.
  if (archivo.isUntitled === true) {
    return 'sin-guardar-en-disco'
  }
  // El workspace flotante lee siempre en esta máquina (`suppressActiveRuntimeFallback`), así que un
  // archivo que vive en un host SSH o dentro de un entorno de runtime se leería en el lugar
  // equivocado: mismo camino, otro archivo, y en silencio.
  if (archivo.externalSshTargetId || archivo.runtimeEnvironmentId) {
    return 'de-otra-maquina'
  }
  const host = args.tabExecutionHostId
  if (host != null && host !== LOCAL_EXECUTION_HOST_ID) {
    return 'de-otra-maquina'
  }
  return { archivo }
}

/**
 * Hace el movimiento: abre el archivo como pestaña del workspace flotante, cierra la del proyecto y
 * deja el panel a la vista.
 *
 * El orden importa. Primero se abre y después se cierra: si se cerrara antes, un cierre que además
 * descarta el último búfer del archivo dejaría al editor nuevo leyendo de disco y perdería los
 * cambios sin guardar que el movimiento tenía que llevarse.
 */
export function desacoplarEditor(args: {
  readonly archivo: OpenFile
  readonly openFile: (
    archivo: {
      filePath: string
      relativePath: string
      worktreeId: string
      language: string
      mode: 'edit'
      runtimeEnvironmentId: null
    },
    opciones: { preview: boolean; suppressActiveRuntimeFallback: boolean }
  ) => string
  readonly cerrarPestana: () => void
  readonly abrirPanelFlotante: () => void
}): void {
  args.openFile(
    {
      filePath: args.archivo.filePath,
      relativePath: args.archivo.relativePath,
      worktreeId: FLOATING_TERMINAL_WORKTREE_ID,
      language: args.archivo.language || detectLanguage(args.archivo.relativePath),
      mode: 'edit',
      runtimeEnvironmentId: null
    },
    { preview: false, suppressActiveRuntimeFallback: true }
  )
  args.cerrarPestana()
  args.abrirPanelFlotante()
}
