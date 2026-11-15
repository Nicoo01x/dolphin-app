import { ipcRenderer } from 'electron'
import { CANAL_FOCO_DEL_EDITOR_DE_CODIGO } from '../../shared/canal-foco-del-editor-de-codigo'
import type { EditorApi } from './editor-api'

// Cada carga de página corre el preload: avisar acá que nadie tiene el foco hace que una recarga
// o un renderer nuevo después de una caída no hereden el foco que tenía el editor anterior.
ipcRenderer.send(CANAL_FOCO_DEL_EDITOR_DE_CODIGO, false)

export const editorApi: EditorApi['editor'] = {
  generateInlineEdit: (args) => ipcRenderer.invoke('editor:generateInlineEdit', args),
  resolveEditorConfig: (args) => ipcRenderer.invoke('editor:resolveEditorConfig', args),
  avisarFocoDelEditorDeCodigo: (enfocado) =>
    ipcRenderer.send(CANAL_FOCO_DEL_EDITOR_DE_CODIGO, enfocado)
}
