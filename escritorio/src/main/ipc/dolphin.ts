import { app, ipcMain } from 'electron'
import type { Store } from '../persistence/loading-store/store'
import {
  DolphinLiveRequestSchema,
  DolphinOpenConsoleRequestSchema,
  DolphinPortonRequestSchema,
  type DolphinConsoleResult,
  type DolphinLiveResult,
  type DolphinPortonResult
} from '../../shared/dolphin-console-types'
import { openDolphinConsole, sendDolphinLive } from '../dolphin/dolphin-console'
import { readDolphinPorton, startDolphinPorton } from '../dolphin/dolphin-porton'
import { isTrustedUIRenderer } from './ui'
import { resolveRegisteredWorktreePath } from './worktrees/removal/registered-worktree-roots-cache'
import { registerOrchestrationDashboardHandlers } from './orchestration-dashboard'
import { registerDolphinMemoryHandlers } from './dolphin-memoria'
import { registerDolphinTableroHandlers } from './dolphin-tablero'
import { registerDolphinFondoDelChatHandlers } from './dolphin-fondo-del-chat'
import type { DolphinRuntimeService } from '../runtime/dolphin-runtime'

type Rejected = Extract<DolphinConsoleResult, { ok: false }>

/**
 * Why tan estricto: la ruta que manda el renderer es el repo de la consola de Dolphin, y la
 * consola no solo lo mira: corre su agenda y, al sembrar, sus scripts. Tiene que ser un proyecto
 * o un worktree de la app, y pedirlo la ventana de la app, no una página del navegador interno.
 */
async function knownProjectPath(
  sender: Electron.WebContents,
  repoPath: string,
  store: Store
): Promise<{ path: string } | { failure: Rejected }> {
  if (!isTrustedUIRenderer(sender)) {
    return { failure: { ok: false, code: 'invalid-request' } }
  }
  try {
    return { path: await resolveRegisteredWorktreePath(repoPath, store) }
  } catch {
    return { failure: { ok: false, code: 'unknown-project', detail: repoPath } }
  }
}

export function registerDolphinHandlers(store: Store, runtime?: DolphinRuntimeService): void {
  if (runtime) {
    registerOrchestrationDashboardHandlers(runtime, store)
  }
  registerDolphinMemoryHandlers(store)
  registerDolphinTableroHandlers(store)
  registerDolphinFondoDelChatHandlers()
  ipcMain.handle(
    'dolphin:openConsole',
    async (event, request: unknown): Promise<DolphinConsoleResult> => {
      const parsed = DolphinOpenConsoleRequestSchema.safeParse(request)
      if (!parsed.success) {
        return { ok: false, code: 'invalid-request' }
      }
      const known = await knownProjectPath(event.sender, parsed.data.repoPath, store)
      if ('failure' in known) {
        return known.failure
      }
      return openDolphinConsole(known.path, { appPath: app.getAppPath() })
    }
  )

  // El portón a mano del estudio: arrancar una pasada sobre la carpeta de la sesión, y preguntar cómo va.
  for (const channel of ['dolphin:porton', 'dolphin:portonState'] as const) {
    ipcMain.handle(channel, async (event, request: unknown): Promise<DolphinPortonResult> => {
      const parsed = DolphinPortonRequestSchema.safeParse(request)
      if (!parsed.success) {
        return { ok: false, code: 'invalid-request' }
      }
      const known = await knownProjectPath(event.sender, parsed.data.repoPath, store)
      if ('failure' in known) {
        return known.failure
      }
      return channel === 'dolphin:porton'
        ? startDolphinPorton(known.path, { appPath: app.getAppPath() }, parsed.data.revision)
        : readDolphinPorton(known.path, { appPath: app.getAppPath() })
    })
  }

  ipcMain.handle('dolphin:live', async (event, request: unknown): Promise<DolphinLiveResult> => {
    const parsed = DolphinLiveRequestSchema.safeParse(request)
    if (!parsed.success) {
      return { ok: false, code: 'invalid-request' }
    }
    const known = await knownProjectPath(event.sender, parsed.data.repoPath, store)
    if ('failure' in known) {
      return known.failure
    }
    return sendDolphinLive({ ...parsed.data, repoPath: known.path }, { appPath: app.getAppPath() })
  })
}
