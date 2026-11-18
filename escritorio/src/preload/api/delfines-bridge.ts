import { ipcRenderer } from 'electron'
import type { DelfinesApi } from './delfines-api'
import type {
  AvanceDeLlevar,
  CharlaConDelfin,
  InstantaneaDeDelfin,
  ManadaLeida,
  PedidoDeCrearDelfin,
  PedidoDeHablar,
  PedidoDeLlevar,
  RespuestaDelDelfin,
  Resultado,
  ResultadoDeLlevar,
  RevisionDelServidor
} from '../../shared/delfines-types'

/** Los bots de Dolphin: main le habla al núcleo, acá o en el servidor por SSH. */
export const delfinesApi = {
  listar: (): Promise<ManadaLeida> => ipcRenderer.invoke('delfines:listar'),
  crear: (pedido: PedidoDeCrearDelfin): Promise<Resultado<{ bot: InstantaneaDeDelfin }>> =>
    ipcRenderer.invoke('delfines:crear', pedido),
  hablar: (pedido: PedidoDeHablar): Promise<Resultado<{ respuesta: RespuestaDelDelfin }>> =>
    ipcRenderer.invoke('delfines:hablar', pedido),
  charla: (pedido: {
    id: string
    hostId?: `ssh:${string}`
  }): Promise<Resultado<{ charla: CharlaConDelfin[] }>> =>
    ipcRenderer.invoke('delfines:charla', pedido),
  revisar: (pedido: {
    id: string
    hostId: `ssh:${string}`
  }): Promise<Resultado<{ revision: RevisionDelServidor }>> =>
    ipcRenderer.invoke('delfines:revisar', pedido),
  llevar: (pedido: PedidoDeLlevar): Promise<ResultadoDeLlevar> =>
    ipcRenderer.invoke('delfines:llevar', pedido),
  alAvanzar: (callback: (avance: AvanceDeLlevar) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, avance: AvanceDeLlevar): void =>
      callback(avance)
    ipcRenderer.on('delfines:avance', listener)
    return () => ipcRenderer.removeListener('delfines:avance', listener)
  }
} satisfies DelfinesApi
