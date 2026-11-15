export type OrchestrationDashboardMessageType =
  | 'status'
  | 'dispatch'
  | 'worker_done'
  | 'merge_ready'
  | 'escalation'
  | 'handoff'
  | 'decision_gate'
  | 'question'
  | 'heartbeat'

export type OrchestrationDashboardDispatch = {
  id: string
  status: string
  handle: string | null
  paneKey: string | null
  worktreeId: string | null
  tabId: string | null
  leafId: string | null
  agent: string | null
  model: string | null
  lastError: string | null
}

export function parseWorkerStartOptions(startOptions: string): {
  agent: string | null
  model: string | null
} {
  try {
    const parsed: unknown = JSON.parse(startOptions)
    if (!parsed || typeof parsed !== 'object') {
      return { agent: null, model: null }
    }
    const options = Object.fromEntries(Object.entries(parsed))
    const launch = options.launch
    const effective =
      launch && typeof launch === 'object'
        ? Object.fromEntries(Object.entries(launch).filter(([key]) => key === 'effective'))
        : null
    const modelOptions = effective?.effective
    const model =
      modelOptions && typeof modelOptions === 'object'
        ? Object.fromEntries(Object.entries(modelOptions).filter(([key]) => key === 'model'))
        : null
    return {
      agent: typeof options.agent === 'string' ? options.agent : null,
      model: typeof model?.model === 'string' ? model.model : null
    }
  } catch {
    return { agent: null, model: null }
  }
}

export function repoIdFromWorktreeId(worktreeId: string): string {
  return worktreeId.split('::', 1)[0]
}

export type OrchestrationDashboardTask = {
  id: string
  title: string
  status: string
  deps: string[]
  parentId: string | null
  dispatch: OrchestrationDashboardDispatch | null
}

export type OrchestrationDashboardGate = {
  id: string
  question: string
  options: string[]
}

export type OrchestrationDashboardMessage = {
  type: OrchestrationDashboardMessageType
  subject: string
  from: string
  createdAt: string
}

export type OrchestrationDashboardRun = {
  id: string
  objective: string
  createdAt: string
  coordinatorHandle: string | null
  tasks: OrchestrationDashboardTask[]
  gates: OrchestrationDashboardGate[]
  messages: OrchestrationDashboardMessage[]
}

export type OrchestrationDashboard =
  | { disponible: false }
  | { disponible: true; runs: OrchestrationDashboardRun[] }

export type OrchestrationDashboardInput = {
  runs: {
    id: string
    objective: string
    created_at: string
    coordinator_handle: string | null
  }[]
  tasks: {
    id: string
    run_id: string
    task_title: string | null
    display_name: string | null
    status: string
    deps: string
    parent_id: string | null
    dispatch?: OrchestrationDashboardDispatch | null
  }[]
  gates: { id: string; run_id: string; question: string; options: string; status: string }[]
  messages: {
    run_id: string
    type: OrchestrationDashboardMessageType
    subject: string
    from_handle: string
    created_at: string
  }[]
}

function topologicalTasks(tasks: OrchestrationDashboardTask[]): OrchestrationDashboardTask[] {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const remaining = new Set(tasks.map((task) => task.id))
  const ordered: OrchestrationDashboardTask[] = []
  while (remaining.size > 0) {
    const ready = tasks.filter(
      (task) =>
        remaining.has(task.id) && task.deps.every((dependency) => !remaining.has(dependency))
    )
    if (ready.length === 0) {
      return [...ordered, ...tasks.filter((task) => remaining.has(task.id))]
    }
    for (const task of ready) {
      remaining.delete(task.id)
      ordered.push(byId.get(task.id) as OrchestrationDashboardTask)
    }
  }
  return ordered
}

export function buildOrchestrationDashboard(
  input: OrchestrationDashboardInput
): OrchestrationDashboard {
  const runs = input.runs.slice(0, 10).map((run) => {
    const tasks = input.tasks
      .filter((task) => task.run_id === run.id)
      .map((task) => ({
        id: task.id,
        title: task.task_title || task.display_name || task.id,
        status: task.status,
        deps: JSON.parse(task.deps) as string[],
        parentId: task.parent_id,
        dispatch: task.dispatch ?? null
      }))
    return {
      id: run.id,
      objective: run.objective,
      createdAt: run.created_at,
      coordinatorHandle: run.coordinator_handle,
      tasks: topologicalTasks(tasks),
      gates: input.gates
        .filter((gate) => gate.run_id === run.id && gate.status === 'pending')
        .map((gate) => ({
          id: gate.id,
          question: gate.question,
          options: JSON.parse(gate.options) as string[]
        })),
      messages: input.messages
        .filter((message) => message.run_id === run.id)
        .slice(0, 20)
        .map((message) => ({
          type: message.type,
          subject: message.subject,
          from: message.from_handle,
          createdAt: message.created_at
        }))
    }
  })
  return { disponible: true, runs }
}

export type OrchestrationTaskCounts = {
  running: number
  waiting: number
  done: number
  failed: number
}

/**
 * Cuántas tareas hay en cada grupo, para el tablero y la isla (una sola regla para los dos).
 * Why «ready» espera: está lista para lanzarse pero nadie la está haciendo; solo corre la que
 * tiene un worker despachado.
 */
export function countOrchestrationTasks(
  tasks: readonly Pick<OrchestrationDashboardTask, 'status'>[]
): OrchestrationTaskCounts {
  const counts: OrchestrationTaskCounts = { running: 0, waiting: 0, done: 0, failed: 0 }
  for (const { status } of tasks) {
    if (status === 'completed') {
      counts.done += 1
    } else if (status === 'failed') {
      counts.failed += 1
    } else if (status === 'dispatched' || status === 'running') {
      counts.running += 1
    } else {
      counts.waiting += 1
    }
  }
  return counts
}
