import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { AgentIcon } from '@/components/agent/icons/AgentIcon'
import { getAgentLabel } from '@/lib/agent-catalog/agent-catalog'
import { installWindowVisibilityInterval } from '@/lib/window-activity/window-visibility-interval'
import { translate } from '@/i18n/i18n'
import { isTuiAgent } from '../../../../shared/agent-launch/catalog/tui-agent-config'
import {
  countOrchestrationTasks,
  repoIdFromWorktreeId
} from '../../../../shared/orchestration-dashboard'
import { useAppStore } from '@/store'
import { DolphinMark } from '../dolphin/DolphinMark'
import { OrchestrationConflicts } from './OrchestrationConflicts'
import type {
  OrchestrationDashboard,
  OrchestrationDashboardRun
} from '../../../../shared/orchestration-dashboard'
import type { DolphinChoquesResult } from '../../../../shared/dolphin-choques'

/**
 * El color dice en qué estado está, y es el MISMO que en el resto de Dolphin: ámbar es lo que está
 * trabajando ahora, verde solo lo que terminó bien, rojo lo que falló y azul lo que todavía espera.
 * Antes estaba al revés que la consola (azul corriendo, ámbar esperando) y las dos mitades del
 * producto se contradecían.
 */
const COLOR: Record<Estado, string> = {
  corriendo: 'bg-amber-400',
  esperando: 'bg-sky-400',
  hecho: 'bg-emerald-400',
  fallo: 'bg-rose-500'
}

type Estado = 'corriendo' | 'esperando' | 'hecho' | 'fallo'

function estadoDeTarea(status: string): Estado {
  if (status === 'completed' || status === 'succeeded') {
    return 'hecho'
  }
  if (status === 'failed' || status === 'circuit_broken') {
    return 'fallo'
  }
  if (status === 'pending' || status === 'blocked') {
    return 'esperando'
  }
  return 'corriendo'
}

const ESTADO_DEL_CONTEO: Record<string, Estado> = {
  done: 'hecho',
  failed: 'fallo',
  waiting: 'esperando'
}

function rotuloDeConteo(label: string): string {
  if (label === 'done') {
    return translate('auto.components.orchestration.done', 'done')
  }
  if (label === 'failed') {
    return translate('auto.components.orchestration.failed', 'failed')
  }
  if (label === 'waiting') {
    return translate('auto.components.orchestration.waiting', 'waiting')
  }
  return translate('auto.components.orchestration.running', 'running')
}

function Run({ run }: { run: OrchestrationDashboardRun }): React.JSX.Element {
  const counts = useMemo(() => countOrchestrationTasks(run.tasks), [run.tasks])
  const total = useMemo(
    () => Object.values(counts).reduce((suma, cantidad) => suma + cantidad, 0),
    [counts]
  )
  const conteos = Object.entries(counts).filter(([, cantidad]) => cantidad > 0)
  return (
    <section className="rounded-2xl bg-card p-4">
      {/* El estado va en la cabecera de la sección (Nico, 31/10): una barra de progreso con una o
          dos tareas está siempre al 100 % y no dice nada. */}
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{run.objective}</h2>
        <span
          className="flex shrink-0 gap-3 text-xs text-muted-foreground"
          title={run.coordinatorHandle ?? undefined}
        >
          {conteos.map(([label, cantidad]) => (
            <span key={label} className="flex items-center gap-1.5">
              <i
                className={`size-2 rounded-full ${COLOR[ESTADO_DEL_CONTEO[label] ?? 'corriendo']}`}
              />
              {cantidad} {rotuloDeConteo(label)}
            </span>
          ))}
        </span>
      </div>
      {total === 0 ? (
        <p className="text-xs text-muted-foreground">
          {translate('auto.components.orchestration.noTasks', 'No tasks in this job yet.')}
        </p>
      ) : null}
      <div className="space-y-0.5">
        {run.tasks.map((task) => (
          <button
            key={task.id}
            type="button"
            className="group flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left transition-colors hover:bg-accent active:scale-[.995]"
            onClick={() => {
              const dispatch = task.dispatch
              if (dispatch?.worktreeId && dispatch.tabId && dispatch.leafId) {
                void window.api.dashboard.revealAgent({
                  repoId: repoIdFromWorktreeId(dispatch.worktreeId),
                  worktreeId: dispatch.worktreeId,
                  tabId: dispatch.tabId,
                  leafId: dispatch.leafId
                })
              }
            }}
          >
            <i className={`size-2 shrink-0 rounded-full ${COLOR[estadoDeTarea(task.status)]}`} />
            <span className="min-w-0 flex-1" title={task.dispatch?.handle ?? undefined}>
              <span className="block truncate text-sm">{task.title}</span>
              {task.deps.length ? (
                <span className="block truncate text-xs text-muted-foreground">
                  {translate('auto.components.orchestration.waitsFor', 'waiting for: {{value0}}', {
                    value0: task.deps
                      .map((id) => run.tasks.find((candidate) => candidate.id === id)?.title ?? id)
                      .join(', ')
                  })}
                </span>
              ) : null}
            </span>
            {task.dispatch?.agent && isTuiAgent(task.dispatch.agent) ? (
              <AgentIcon agent={task.dispatch.agent} size={14} />
            ) : null}
            {task.dispatch ? (
              <span className="max-w-48 shrink-0 truncate rounded-full bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground">
                {task.dispatch.agent && isTuiAgent(task.dispatch.agent)
                  ? getAgentLabel(task.dispatch.agent)
                  : null}
                {task.dispatch.model ? ` · ${task.dispatch.model}` : ''}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      {run.messages.length ? (
        <details className="mt-4 rounded-xl bg-muted/30 px-3 py-2">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            {translate(
              'auto.components.orchestration.latestMessages',
              'Latest messages ({{value0}})',
              { value0: String(run.messages.length) }
            )}
          </summary>
          <div className="mt-2 space-y-1.5">
            {run.messages.map((message, index) => (
              <p
                key={`${message.createdAt}-${index}`}
                className={`text-xs ${message.type === 'worker_done' ? 'text-emerald-600 dark:text-emerald-400' : ['escalation', 'question'].includes(message.type) ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}
              >
                <span className="font-medium">{message.from}</span> · {message.subject}
              </p>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  )
}

export default function OrchestrationPage(): React.JSX.Element {
  const [state, setState] = useState<{
    kind: 'loading' | 'ready' | 'error'
    data?: OrchestrationDashboard
    error?: string
  }>({ kind: 'loading' })
  const [resolvingGates, setResolvingGates] = useState<Set<string>>(() => new Set())
  const [gateErrors, setGateErrors] = useState<Record<string, string>>({})
  const [choques, setChoques] = useState<DolphinChoquesResult>({ disponible: false })
  const load = useCallback(async () => {
    try {
      const [dashboard, conflictResult] = await Promise.all([
        window.api.dolphin.orquestacionTablero(),
        window.api.dolphin.orquestacionChoques?.() ??
          Promise.resolve({ disponible: false as const })
      ])
      setChoques(conflictResult)
      setState({ kind: 'ready', data: dashboard })
    } catch (error) {
      setState({ kind: 'error', error: error instanceof Error ? error.message : String(error) })
    }
  }, [])
  useEffect(
    () =>
      // Why: la orquestación no avisa cuando cambia; se pausa oculta y se espacia sin foco.
      installWindowVisibilityInterval({
        run: () => void load(),
        intervalMs: 2000,
        slowWhileUnfocused: true
      }),
    [load]
  )
  const resolve = useCallback(
    async (gateId: string, decision: string) => {
      setResolvingGates((current) => new Set(current).add(gateId))
      setGateErrors((current) => ({ ...current, [gateId]: '' }))
      try {
        await window.api.dolphin.orquestacionResolverGate({ gateId, decision })
        await load()
      } catch (error) {
        setGateErrors((current) => ({
          ...current,
          [gateId]: error instanceof Error ? error.message : String(error)
        }))
      } finally {
        setResolvingGates((current) => {
          const next = new Set(current)
          next.delete(gateId)
          return next
        })
      }
    },
    [load]
  )
  const close = useAppStore((s) => s.closeOrchestrationPage)
  if (state.kind === 'loading') {
    return (
      <div
        className="flex flex-1 items-center justify-center"
        aria-label={translate('auto.components.orchestration.loading', 'Loading orchestration…')}
      >
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (state.kind === 'error') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm">
        <p>
          {translate('auto.components.orchestration.loadError', 'Could not load orchestration.')}
        </p>
        <p className="text-xs text-muted-foreground">{state.error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-full bg-secondary px-3 py-1.5 text-xs"
        >
          {translate('auto.components.orchestration.retry', 'Retry')}
        </button>
      </div>
    )
  }
  if (!state.data?.disponible) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="font-display text-base font-semibold">
          {translate('auto.components.orchestration.unavailable', 'Orchestration is unavailable.')}
        </p>
        <p className="max-w-md text-sm text-muted-foreground">
          {translate(
            'auto.components.orchestration.notReady',
            'The database is not ready in this session yet.'
          )}
        </p>
        <button
          type="button"
          onClick={close}
          className="rounded-full bg-secondary px-3 py-1.5 text-xs"
        >
          {translate('auto.components.orchestration.back', 'Back')}
        </button>
      </div>
    )
  }
  const reposConChoques = choques.disponible ? choques.repos : []
  if (!state.data.runs.length && reposConChoques.length === 0) {
    // Un estado vacío explica qué es esto y cómo se empieza: antes era una sola línea gris en el
    // medio de la nada, que no decía ni para qué sirve la pantalla.
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <DolphinMark className="size-10 text-muted-foreground/30" />
        <div className="space-y-1.5">
          <p className="font-display text-base font-semibold">
            {translate('auto.components.orchestration.emptyTitle', 'Nothing running right now')}
          </p>
          <p className="max-w-md text-sm text-muted-foreground">
            {translate(
              'auto.components.orchestration.empty',
              'There are no runs yet. Ask an agent to split a job among several workers and it will appear here.'
            )}
          </p>
        </div>
        <p className="max-w-md rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          {translate(
            'auto.components.orchestration.emptyHow',
            'Here you will see each worker, what it is waiting for, and anything that needs your answer.'
          )}
        </p>
      </div>
    )
  }
  const gates = state.data.runs.flatMap((run) => run.gates)
  return (
    <main className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto bg-background px-6 py-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {translate('auto.components.orchestration.title', 'Orchestration')}
          </h1>
          {/* Cuántos trabajos hay en una línea: entrar y no saber si corre algo era lo primero que faltaba. */}
          <p className="text-sm text-muted-foreground">
            {state.data.runs.length === 1
              ? translate('auto.components.orchestration.oneRun', '1 job')
              : translate('auto.components.orchestration.runs', '{{value0}} jobs', {
                  value0: String(state.data.runs.length)
                })}
          </p>
        </header>
        <OrchestrationConflicts repos={reposConChoques} />
        {gates.length ? (
          <section className="space-y-2">
            {gates.map((gate) => (
              <div key={gate.id} className="rounded-2xl bg-amber-500/10 p-3">
                {/* Lo único de esta pantalla que te espera a vos: se dice, no se deduce del color. */}
                <p className="mb-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                  {translate('auto.components.orchestration.waitingForYou', 'Waiting for you')}
                </p>
                <p className="mb-2 text-sm font-medium">{gate.question}</p>
                <div className="flex flex-wrap gap-1.5">
                  {gate.options.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => void resolve(gate.id, option)}
                      disabled={resolvingGates.has(gate.id)}
                      className="rounded-full bg-background px-3 py-1.5 text-xs font-medium transition-transform active:scale-95 hover:bg-accent"
                    >
                      {option}
                    </button>
                  ))}
                </div>
                {gateErrors[gate.id] ? (
                  <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
                    {translate(
                      'auto.components.orchestration.gateError',
                      'Could not resolve this gate: {{value0}}. Try again.',
                      { value0: gateErrors[gate.id] }
                    )}
                  </p>
                ) : null}
              </div>
            ))}
          </section>
        ) : null}
        {state.data.runs.map((run) => (
          <Run key={run.id} run={run} />
        ))}
      </div>
    </main>
  )
}
