import { ipcMain, type WebContents } from 'electron'
import { CANAL_FOCO_DEL_EDITOR_DE_CODIGO } from '../../shared/canal-foco-del-editor-de-codigo'

export type FocoDelEditorDeCodigo = {
  estaEnfocado: () => boolean
  dispose: () => void
}

/**
 * Espejo, en el proceso principal, de «el foco está en el editor de código».
 *
 * Hace falta porque los atajos globales se resuelven en `before-input-event`, antes de que la
 * tecla llegue al renderer: para dejarle Ctrl+K a Monaco, el proceso principal tiene que saber
 * dónde está el foco sin preguntarlo. Es el mismo truco que la base usa para el editor de markdown.
 *
 * Vive aparte de `main-window-focus-lifecycle.ts` (que es de la base) para que la próxima puesta al
 * día no choque con esto. Por lo mismo no escucha eventos del webContents: cada carga de página
 * corre el preload, y el preload avisa `false` al arrancar (`editor-bridge.ts`), así que una
 * recarga o un renderer nuevo después de una caída no heredan un foco viejo.
 */
export function instalarFocoDelEditorDeCodigo(webContents: WebContents): FocoDelEditorDeCodigo {
  let enfocado = false

  // Sólo el renderer de esta ventana, y sólo un booleano estricto: un invitado o un mensaje
  // malformado no tienen que poder apagar los atajos de la app.
  const alAvisar = (evento: Electron.IpcMainEvent, valor: unknown): void => {
    if (evento.sender !== webContents) {
      return
    }
    enfocado = valor === true
  }
  ipcMain.on(CANAL_FOCO_DEL_EDITOR_DE_CODIGO, alAvisar)

  return {
    estaEnfocado: () => enfocado,
    dispose: () => {
      enfocado = false
      ipcMain.removeListener(CANAL_FOCO_DEL_EDITOR_DE_CODIGO, alAvisar)
    }
  }
}
