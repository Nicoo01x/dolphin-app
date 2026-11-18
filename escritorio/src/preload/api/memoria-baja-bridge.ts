import { ipcRenderer } from 'electron'
import type { AvisoDeMemoriaBaja, EstadoDeMemoriaBaja } from '../../shared/modo-poca-ram'
import type { PreloadApi } from '../api-types'

type MemoriaBajaApi = NonNullable<PreloadApi['memoriaBaja']>

/**
 * El modo poca RAM. El vigía corre en main; la ventana que monta la cola de avisos se suscribe y
 * recibe el aviso cuando toca. Escucha antes de suscribirse: un aviso guardado llega enseguida.
 */
export const memoriaBajaApi = {
  alAvisar: (callback: (aviso: AvisoDeMemoriaBaja) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, aviso: AvisoDeMemoriaBaja): void =>
      callback(aviso)
    ipcRenderer.on('memoriaBaja:aviso', listener)
    void ipcRenderer.invoke('memoriaBaja:suscribir').catch(() => undefined)
    return () => ipcRenderer.removeListener('memoriaBaja:aviso', listener)
  },
  silenciar: (): Promise<void> => ipcRenderer.invoke('memoriaBaja:silenciar'),
  estado: (): Promise<EstadoDeMemoriaBaja> => ipcRenderer.invoke('memoriaBaja:estado')
} satisfies MemoriaBajaApi
