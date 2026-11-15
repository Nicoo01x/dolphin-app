import { homedir } from 'node:os'
import { app, ipcMain } from 'electron'
import { z } from 'zod'
import type { Store } from '../persistence/loading-store/store'
import { projectMemoryRepoPath } from '../agent-hooks/project-agent-memory-repo'
import { leerTableroDeRepo } from '../dolphin/dolphin-tablero'
import { consolaDeVerdad, moverTarjetaDelTablero } from '../dolphin/dolphin-tablero-mover'
import {
  COLUMNAS_DEL_TABLERO,
  type TableroLeido,
  type TarjetaMovida
} from '../../shared/dolphin-tablero-types'
import { isTrustedUIRenderer } from './ui'

const LeerSchema = z.object({ worktreeId: z.string().min(1).max(500) })
const MoverSchema = z.object({
  worktreeId: z.string().min(1).max(500),
  id: z.string().min(1).max(200),
  columna: z.enum(COLUMNAS_DEL_TABLERO)
})

/**
 * El tablero del repo de un worktree, para dibujarlo cuando no hay ninguna pestaña abierta. Sólo
 * lectura. Como la memoria del proyecto, vive en el repo (no en el worktree) y sólo en repos locales:
 * son archivos de este disco.
 */
export function registerDolphinTableroHandlers(store: Store): void {
  ipcMain.handle('dolphin:tablero:leer', async (event, request: unknown): Promise<TableroLeido> => {
    const parsed = LeerSchema.safeParse(request)
    if (!isTrustedUIRenderer(event.sender) || !parsed.success) {
      return { ok: false }
    }
    const repoPath = projectMemoryRepoPath(store, parsed.data.worktreeId)
    return repoPath ? leerTableroDeRepo(repoPath) : { ok: false }
  })

  // Arrastrar una tarjeta a otra columna (Ideas → Para hacer es aprobarla): lo escribe el núcleo.
  ipcMain.handle(
    'dolphin:tablero:mover',
    async (event, request: unknown): Promise<TarjetaMovida> => {
      const parsed = MoverSchema.safeParse(request)
      if (!isTrustedUIRenderer(event.sender) || !parsed.success) {
        return { ok: false, code: 'invalid-request' }
      }
      const repoPath = projectMemoryRepoPath(store, parsed.data.worktreeId)
      if (!repoPath) {
        return { ok: false, code: 'unknown-project', detail: parsed.data.worktreeId }
      }
      return moverTarjetaDelTablero(
        repoPath,
        parsed.data.id,
        parsed.data.columna,
        consolaDeVerdad({ appPath: app.getAppPath() })
      )
    }
  )

  // La carpeta personal que la base agrega sola como proyecto en un perfil nuevo
  // (initial-home-workspace.ts): es la misma ruta que guardó, así el inicio la reconoce por la
  // ruta y no por su nombre («~»), y no la cuenta como un proyecto de la persona.
  ipcMain.handle('dolphin:carpeta-personal', (event): string | null =>
    isTrustedUIRenderer(event.sender) ? homedir() : null
  )
}
