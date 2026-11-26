import { ipcRenderer } from 'electron'
import type { WinFormsApi } from './winforms-api'
import type { WinFormsMensaje } from '../../shared/winforms/winforms-preview-types'

/** La vista previa de formularios WinForms: main lanza el host y reenvía sus cuadros y controles. */
export const winFormsApi = {
  analizar: (archivo) => ipcRenderer.invoke('winforms:analizar', archivo),
  clasificar: (archivos) => ipcRenderer.invoke('winforms:clasificar', archivos),
  abrir: (pedido) => ipcRenderer.invoke('winforms:abrir', pedido),
  ordenar: (pedido) => ipcRenderer.invoke('winforms:ordenar', pedido),
  cerrar: (pedido) => ipcRenderer.invoke('winforms:cerrar', pedido),
  elegirEnsamblado: (desde) => ipcRenderer.invoke('winforms:elegirEnsamblado', desde),
  ubicar: (pedido) => ipcRenderer.invoke('winforms:ubicar', pedido),
  alEvento: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, mensaje: WinFormsMensaje): void =>
      callback(mensaje)
    ipcRenderer.on('winforms:evento', listener)
    return () => ipcRenderer.removeListener('winforms:evento', listener)
  }
} satisfies WinFormsApi
