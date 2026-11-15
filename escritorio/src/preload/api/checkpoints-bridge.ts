import { ipcRenderer } from 'electron'
import type {
  CambioDesdeCheckpoint,
  CheckpointDeCodigoDato,
  CheckpointsApi,
  RestauracionDeCheckpointDato
} from '../../shared/checkpoints-de-codigo-tipos'
import type { PreloadApi } from '../api-types'

/**
 * Los checkpoints de código. `invoke` y no `send`: quien crea un checkpoint antes de un turno
 * necesita el sha para poder volver, y quien restaura necesita saber qué pasó.
 */
export const checkpointsApi = {
  crear: (cwd: string, etiqueta?: string): Promise<CheckpointDeCodigoDato | null> =>
    ipcRenderer.invoke('checkpoints:crear', cwd, etiqueta),
  restaurar: (cwd: string, sha: string): Promise<RestauracionDeCheckpointDato> =>
    ipcRenderer.invoke('checkpoints:restaurar', cwd, sha),
  cambios: (cwd: string, sha: string): Promise<readonly CambioDesdeCheckpoint[]> =>
    ipcRenderer.invoke('checkpoints:cambios', cwd, sha)
} satisfies CheckpointsApi satisfies PreloadApi['checkpoints']
