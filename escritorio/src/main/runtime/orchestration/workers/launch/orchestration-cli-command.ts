import type { RuntimePtyWorktreeRecord } from '../../../terminal/records/runtime-terminal-state-records'
import { isStructuredWorkerHandle } from '../../../../../shared/orchestration/workers/structured-worker-handle'
import { parseDolphinSessionAddress } from '../../../../../shared/dolphin-session-address'
import type { ProjectExecutionRuntimeResolution } from '../../../../../shared/execution-host/project-execution-runtime'
import { getAppEnvironment, hasAppEnvironment } from '../../../../../shared/app-environment'

export type OrchestrationCliCommand = 'dolphin' | 'dolphin-dev' | 'dolphin-ide'

/** Dev builds run the CLI as `dolphin-dev`; a packaged app, or a process with no app, must not advertise it. */
export function runtimeOrchestrationCliCommand(): OrchestrationCliCommand | undefined {
  return hasAppEnvironment() && !getAppEnvironment().isPackaged() ? 'dolphin-dev' : undefined
}

/** What a local, non-WSL terminal is told to run; a structured session is always one. */
export function localOrchestrationCliCommand(): OrchestrationCliCommand {
  return runtimeOrchestrationCliCommand() ?? 'dolphin'
}

export function resolveTerminalOrchestrationCliCommand(args: {
  connectionId: string | null
  isWsl: boolean | null | undefined
  worktreeId: string
  projectRuntime?: ProjectExecutionRuntimeResolution
  runtimeCliCommand?: OrchestrationCliCommand
}): OrchestrationCliCommand {
  if (args.connectionId) {
    return 'dolphin'
  }
  if (args.runtimeCliCommand) {
    return args.runtimeCliCommand
  }
  // Dolphin: el lanzador de WSL también se instala como `dolphin`, no como `dolphin-ide`.
  if (args.isWsl !== null && args.isWsl !== undefined) {
    return 'dolphin'
  }
  if (args.projectRuntime?.status === 'resolved' && args.projectRuntime.runtime.kind === 'wsl') {
    return 'dolphin'
  }

  return 'dolphin'
}

export function resolveRuntimeTerminalOrchestrationCliCommand(
  handle: string,
  source: {
    resolvePtyId: (handle: string) => string | null | undefined
    getPty: (ptyId: string) => RuntimePtyWorktreeRecord | undefined
    getProjectRuntime: (
      pty: RuntimePtyWorktreeRecord
    ) => ProjectExecutionRuntimeResolution | undefined
  }
): OrchestrationCliCommand {
  // A structured session runs in this process: it is told what the structured mail lane types.
  if (isStructuredWorkerHandle(handle) || parseDolphinSessionAddress(handle)) {
    return localOrchestrationCliCommand()
  }
  let pty: RuntimePtyWorktreeRecord | null = null
  try {
    const ptyId = source.resolvePtyId(handle)
    pty = ptyId ? (source.getPty(ptyId) ?? null) : null
  } catch {
    return 'dolphin'
  }
  if (!pty) {
    return 'dolphin'
  }
  return resolveTerminalOrchestrationCliCommand({
    connectionId: pty.connectionId,
    isWsl: pty.isWsl,
    worktreeId: pty.worktreeId,
    runtimeCliCommand: runtimeOrchestrationCliCommand(),
    projectRuntime: source.getProjectRuntime(pty)
  })
}
