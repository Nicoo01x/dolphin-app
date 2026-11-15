import { ipcMain } from 'electron'
import type { DolphinRuntimeService } from '../runtime/dolphin-runtime'
import {
  buildOrchestrationDashboard,
  parseWorkerStartOptions
} from '../../shared/orchestration-dashboard'
import { validateResolveGateRequest } from './orchestration-dashboard-validation'
import { getTrustedUIRendererWebContents, isTrustedUIRenderer } from './ui'
import { isDashboardPopoutRenderer } from '../window/dashboard-popout-window'
import { getLocalRepos } from './filesystem/access/filesystem-allowed-roots'
import { DolphinChoquesService } from '../dolphin/dolphin-choques'
import type { Store } from '../persistence/loading-store/store'
import { islaAbiertaAhora } from '../dolphin/dolphin-isla-estado'

let choquesService: DolphinChoquesService | null = null

export function registerOrchestrationDashboardHandlers(
  runtime: DolphinRuntimeService,
  store?: Store
): void {
  choquesService?.stop()
  choquesService = store ? new DolphinChoquesService(() => getLocalRepos(store)) : null
  choquesService?.start()
  ipcMain.removeHandler('dolphin:orquestacion:tablero')
  ipcMain.removeHandler('dolphin:orquestacion:resolver-gate')
  ipcMain.removeHandler('dolphin:orquestacion:abrir')
  ipcMain.removeHandler('dolphin:orquestacion:choques')
  ipcMain.handle('dolphin:orquestacion:tablero', (event) => {
    // Why: el tablero lo leen la ventana principal y la isla; nadie más (un webview, una página).
    if (!isTrustedUIRenderer(event.sender) && !isDashboardPopoutRenderer(event.sender)) {
      return { disponible: false as const }
    }
    const db = runtime.getExistingOrchestrationDb()
    if (!db) {
      return { disponible: false as const }
    }
    const runs = db.listRuns().runs.slice(0, 10)
    const tasks = runs.flatMap((run) =>
      db.listTasksWithDispatch({ runId: run.id }).map((task) => {
        // Why el último de cualquier estado: listTasksWithDispatch solo une el dispatch activo, y una
        // tarea hecha o fallada se quedaba sin quién la hizo en el tablero.
        const dispatch = task.dispatch_id
          ? db.getDispatchContextById(task.dispatch_id)
          : db.getDispatchContext(task.id)
        const worker = dispatch ? db.getWorkerDispatch(dispatch.id) : undefined
        const startOptions = worker
          ? parseWorkerStartOptions(worker.start_options)
          : { agent: null, model: null }
        return {
          ...task,
          dispatch: dispatch
            ? {
                id: dispatch.id,
                status: worker?.state ?? 'unknown',
                handle: task.assignee_handle ?? dispatch.assignee_handle,
                paneKey: dispatch?.assignee_pane_key ?? null,
                worktreeId: worker?.worktree_id ?? null,
                tabId: dispatch?.assignee_pane_key?.split(':')[0] ?? null,
                leafId: dispatch?.assignee_pane_key?.split(':').slice(1).join(':') ?? null,
                agent: startOptions.agent,
                model: startOptions.model,
                lastError: worker?.last_error ?? null
              }
            : null
        }
      })
    )
    return buildOrchestrationDashboard({
      runs,
      tasks,
      gates: db.listGates(),
      messages: runs
        .flatMap((run) => db.getRunMailboxHistory(run.id, 20))
        .sort((a, b) => b.sequence - a.sequence)
    })
  })
  ipcMain.handle('dolphin:orquestacion:resolver-gate', (event, value: unknown) => {
    // Why: resolver un gate decide por la persona; solo desde la ventana principal.
    if (!isTrustedUIRenderer(event.sender)) {
      throw new Error('Solo la ventana principal puede resolver un gate.')
    }
    const request = validateResolveGateRequest(value)
    const db = runtime.getExistingOrchestrationDb()
    if (!db) {
      throw new Error('La orquestación no está disponible.')
    }
    const gate = db.getGate(request.gateId)
    if (!gate || gate.status !== 'pending') {
      throw new Error('El gate no existe o ya fue resuelto.')
    }
    const resolved = db.resolveGate(request.gateId, request.decision)
    if (!resolved) {
      throw new Error('El gate no existe.')
    }
    return resolved
  })
  ipcMain.handle('dolphin:orquestacion:abrir', (event) => {
    if (!isTrustedUIRenderer(event.sender) && !isDashboardPopoutRenderer(event.sender)) {
      return
    }
    getTrustedUIRendererWebContents()?.send('ui:dolphinOrquestacionAbrir')
  })
  ipcMain.handle('dolphin:orquestacion:choques', (event) => {
    // Why: los choques exponen rutas locales y solo los leen la ventana principal o la isla.
    const esIsla = islaAbiertaAhora() && isDashboardPopoutRenderer(event.sender)
    if (!isTrustedUIRenderer(event.sender) && !esIsla) {
      return { disponible: false as const }
    }
    return choquesService?.get() ?? { disponible: false as const }
  })
}
