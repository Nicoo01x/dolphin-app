import { ipcRenderer } from 'electron'
import type {
  DolphinConsoleResult,
  DolphinLiveRequest,
  DolphinLiveResult,
  DolphinPortonRevision,
  DolphinPortonResult
} from '../../shared/dolphin-console-types'
import type { PreloadApi } from '../api-types'
import type {
  AsuntoDeIsla,
  EstudioDeIsla,
  PedidoDeEstudio,
  EscrituraDesdeIsla,
  PedidoDeEscritura,
  PreferenciasDeIsla,
  RespuestaDeEstudio,
  RespuestaDeEscritura,
  ResultadoDeEscritura
} from '../../shared/dolphin-isla-types'
import { readDolphinSkillsDirArgument } from '../../shared/dolphin-skills-source'
import type { DolphinBucleEvento } from '../../shared/dolphin-bucles-types'
import type {
  PedidoDeMoverTarjeta,
  TableroLeido,
  TarjetaMovida
} from '../../shared/dolphin-tablero-types'
import type {
  DolphinBugAvance,
  DolphinBugFailureCode,
  DolphinBugRequest,
  DolphinBugTerminado
} from '../../shared/dolphin-bug-types'

export const dolphinApi = {
  openConsole: (repoPath: string): Promise<DolphinConsoleResult> =>
    ipcRenderer.invoke('dolphin:openConsole', { repoPath }),
  live: (request: DolphinLiveRequest): Promise<DolphinLiveResult> =>
    ipcRenderer.invoke('dolphin:live', request),
  porton: (repoPath: string, revision?: DolphinPortonRevision): Promise<DolphinPortonResult> =>
    ipcRenderer.invoke('dolphin:porton', { repoPath, ...(revision ? { revision } : {}) }),
  portonState: (repoPath: string): Promise<DolphinPortonResult> =>
    ipcRenderer.invoke('dolphin:portonState', { repoPath }),
  skillsDir: readDolphinSkillsDirArgument(process.argv),
  alternarIsla: (): Promise<void> => ipcRenderer.invoke('dolphin:isla:alternar'),
  tamanoDeIsla: (ancho: number, alto: number): Promise<void> =>
    ipcRenderer.invoke('dolphin:isla:tamano', { ancho, alto }),
  moverIsla: (deltaX: number, deltaY: number, soltar: boolean): Promise<void> =>
    ipcRenderer.invoke('dolphin:isla:mover', { deltaX, deltaY, soltar }),
  volverArribaIsla: (): Promise<void> => ipcRenderer.invoke('dolphin:isla:volver-arriba'),
  ratonEnIsla: (encima: boolean): Promise<void> => ipcRenderer.invoke('dolphin:isla:raton', encima),
  escribirDesdeIsla: (escritura: EscrituraDesdeIsla): Promise<ResultadoDeEscritura> =>
    ipcRenderer.invoke('dolphin:isla:escribir', escritura),
  bandejaDeIsla: (): Promise<AsuntoDeIsla[]> => ipcRenderer.invoke('dolphin:isla:bandeja'),
  estudioDeIsla: (): Promise<EstudioDeIsla> => ipcRenderer.invoke('dolphin:isla:estudio'),
  preferenciasDeIsla: (): Promise<PreferenciasDeIsla | null> =>
    ipcRenderer.invoke('dolphin:isla:preferencias'),
  guardarPreferenciasDeIsla: (parcial: PreferenciasDeIsla): Promise<void> =>
    ipcRenderer.invoke('dolphin:isla:guardar', parcial),
  onEscribirDesdeIsla: (callback: (pedido: PedidoDeEscritura) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, pedido: PedidoDeEscritura): void =>
      callback(pedido)
    ipcRenderer.on('ui:dolphinIslaEscribir', listener)
    return () => ipcRenderer.removeListener('ui:dolphinIslaEscribir', listener)
  },
  onPedirEstudio: (callback: (pedido: PedidoDeEstudio) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, pedido: PedidoDeEstudio): void =>
      callback(pedido)
    ipcRenderer.on('ui:dolphinIslaEstudio', listener)
    return () => ipcRenderer.removeListener('ui:dolphinIslaEstudio', listener)
  },
  onBucle: (callback: (evento: DolphinBucleEvento) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, evento: DolphinBucleEvento): void =>
      callback(evento)
    ipcRenderer.on('dolphin:bucles', listener)
    return () => ipcRenderer.removeListener('dolphin:bucles', listener)
  },
  confirmarEscrituraDesdeIsla: (respuesta: RespuestaDeEscritura): Promise<void> =>
    ipcRenderer.invoke('dolphin:isla:escrito', respuesta),
  confirmarEstudioDesdeIsla: (respuesta: RespuestaDeEstudio): Promise<void> =>
    ipcRenderer.invoke('dolphin:isla:estudio:respuesta', respuesta),
  orquestacionTablero: () => ipcRenderer.invoke('dolphin:orquestacion:tablero'),
  orquestacionChoques: () => ipcRenderer.invoke('dolphin:orquestacion:choques'),
  orquestacionResolverGate: (request: { gateId: string; decision: string }) =>
    ipcRenderer.invoke('dolphin:orquestacion:resolver-gate', request),
  orquestacionAbrir: () => ipcRenderer.invoke('dolphin:orquestacion:abrir'),
  recordarEnMemoria: (request: { worktreeId: string; text: string; porQue: string }) =>
    ipcRenderer.invoke('dolphin:memoria:recordar', request),
  olvidarDeMemoria: (request: { worktreeId: string; id: string }) =>
    ipcRenderer.invoke('dolphin:memoria:olvidar', request),
  leerTablero: (worktreeId: string): Promise<TableroLeido> =>
    ipcRenderer.invoke('dolphin:tablero:leer', { worktreeId }),
  moverTarjeta: (pedido: PedidoDeMoverTarjeta): Promise<TarjetaMovida> =>
    ipcRenderer.invoke('dolphin:tablero:mover', pedido),
  carpetaPersonal: (): Promise<string | null> => ipcRenderer.invoke('dolphin:carpeta-personal'),
  alternarXray: (): Promise<void> => ipcRenderer.invoke('dolphin:xray:alternar'),
  onXrayEnviar: (callback: (pedido: { id: string; prompt: string }) => void): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      pedido: { id: string; prompt: string }
    ): void => callback(pedido)
    ipcRenderer.on('ui:dolphinXrayEnviar', listener)
    return () => ipcRenderer.removeListener('ui:dolphinXrayEnviar', listener)
  },
  confirmarXray: (respuesta: { id: string; ok: boolean }): Promise<void> =>
    ipcRenderer.invoke('dolphin:xray:resultado', respuesta),
  reportarBug: (
    request: DolphinBugRequest
  ): Promise<{
    ok: boolean
    id?: string
    code?: DolphinBugFailureCode
    detail?: string
  }> => ipcRenderer.invoke('dolphin:xray:bug', request),
  onXrayBug: (
    callback: (pedido: Pick<DolphinBugRequest, 'id' | 'que' | 'elemento'>) => void
  ): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      pedido: Pick<DolphinBugRequest, 'id' | 'que' | 'elemento'>
    ): void => callback(pedido)
    ipcRenderer.on('ui:dolphinXrayBug', listener)
    return () => ipcRenderer.removeListener('ui:dolphinXrayBug', listener)
  },
  onXrayBugAvance: (callback: (avance: DolphinBugAvance) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, avance: DolphinBugAvance): void =>
      callback(avance)
    ipcRenderer.on('ui:dolphinXrayBugAvance', listener)
    return () => ipcRenderer.removeListener('ui:dolphinXrayBugAvance', listener)
  },
  onXrayBugTerminado: (callback: (terminado: DolphinBugTerminado) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, terminado: DolphinBugTerminado): void =>
      callback(terminado)
    ipcRenderer.on('ui:dolphinXrayBugTerminado', listener)
    return () => ipcRenderer.removeListener('ui:dolphinXrayBugTerminado', listener)
  },
  onAbrirOrquestacion: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('ui:dolphinOrquestacionAbrir', listener)
    return () => ipcRenderer.removeListener('ui:dolphinOrquestacionAbrir', listener)
  }
} satisfies PreloadApi['dolphin']
