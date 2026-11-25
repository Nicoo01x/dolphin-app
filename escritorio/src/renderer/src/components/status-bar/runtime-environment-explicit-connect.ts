import { toast } from 'sonner'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import type { RuntimeStatus } from '../../../../shared/runtime-types'
import { refreshRuntimeProjectWorktreesAndLineage } from '@/hooks/runtime-project-refresh-scheduler'
import { translate } from '@/i18n/i18n'
import { unwrapRuntimeRpcResult } from '@/runtime/rpc/calls/runtime-rpc-result'
import { useAppStore } from '../../store'
import { runtimeHostDiagnosisCopy } from './runtime-host-diagnosis-copy'

export async function connectRuntimeEnvironmentAndRecordStatus(
  environmentId: string,
  timeoutMs: number
): Promise<boolean> {
  const setStatus = useAppStore.getState().setRuntimeEnvironmentStatus
  try {
    const response = await window.api.runtimeEnvironments.connect({
      selector: environmentId,
      timeoutMs
    })
    const status = unwrapRuntimeRpcResult<RuntimeStatus>(response)
    setStatus(environmentId, { status, checkedAt: Date.now() })
    return true
  } catch {
    setStatus(environmentId, { status: null, checkedAt: Date.now() })
    return false
  }
}

export async function connectRuntimeHostForNavigation(args: {
  environmentId: string
  refreshStatus: (environmentId: string, timeoutMs: number) => Promise<boolean>
  fetchRepos: (environmentId: string) => Promise<{ id: string }[]>
  fetchWorktrees: (
    repoId: string,
    options: { executionHostId: ExecutionHostId; suppressRemoteLineageRefresh: true }
  ) => Promise<unknown>
  fetchLineage: (options: { executionHostId: ExecutionHostId }) => Promise<unknown>
}): Promise<boolean> {
  if (!(await args.refreshStatus(args.environmentId, 5_000))) {
    return false
  }
  const repos = await args.fetchRepos(args.environmentId)
  await refreshRuntimeProjectWorktreesAndLineage(
    args.environmentId,
    repos,
    args.fetchWorktrees,
    args.fetchLineage
  )
  return true
}

/**
 * The status bar's Connect for a paired host; also the chat's Reconnect when its host is offline
 * and a stopped WSL host’s Start, which passes its own failure message.
 */
export async function connectRuntimeHostAndReloadProjects(
  environmentId: string,
  failureMessage?: string
): Promise<boolean> {
  const store = useAppStore.getState()
  const reachable = await connectRuntimeHostForNavigation({
    environmentId,
    refreshStatus: connectRuntimeEnvironmentAndRecordStatus,
    fetchRepos: store.fetchRuntimeEnvironmentRepos,
    fetchWorktrees: store.fetchWorktrees,
    fetchLineage: store.fetchWorktreeLineage
  })
  // El diagnóstico del último sondeo dice por qué (Tailscale apagado, otro programa…); sin él,
  // queda el aviso genérico de siempre.
  const diagnosis = runtimeHostDiagnosisCopy(
    useAppStore.getState().runtimeStatusByEnvironmentId.get(environmentId)?.snapshot?.diagnosis
  )
  if (!reachable) {
    toast.error(
      failureMessage ??
        diagnosis?.summary ??
        translate(
          'auto.components.status.bar.SshStatusSegment.runtime_connect_unavailable',
          'Remote host is not reachable'
        ),
      !failureMessage && diagnosis ? { description: diagnosis.explanation } : undefined
    )
  } else if (diagnosis?.warning) {
    // Conectó, pero a algo que no es Dolphin: se avisa una vez, al tocar Conectar.
    toast.warning(diagnosis.summary, { description: diagnosis.explanation })
  }
  return reachable
}
