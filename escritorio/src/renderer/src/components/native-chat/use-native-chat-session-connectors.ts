import { useEffect, useMemo, useState } from 'react'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import {
  getRepoExecutionHostId,
  getRepoSshConnectionId,
  parseExecutionHostId
} from '../../../../shared/execution-host'
import { runtimeTargetForOwnerEnvironment } from '@/runtime/rpc/targets/runtime-client-target'
import type { RuntimeFileOperationArgs } from '@/runtime/files/runtime-file-client-types'
import { loadMcpConfigInspections } from '../../runtime/mcp/configuration/mcp-config-inspection'

export type NativeChatSessionConnectors = {
  status: 'loading' | 'ready' | 'empty' | 'error'
  names: readonly string[]
}

export function useNativeChatSessionConnectors(
  repo: Repo | null,
  worktree: Worktree | null
): NativeChatSessionConnectors {
  const [state, setState] = useState<NativeChatSessionConnectors>({
    status: 'loading',
    names: []
  })
  const repoHostId = repo ? getRepoExecutionHostId(repo) : null
  const parsedRepoHost = parseExecutionHostId(repoHostId)
  const runtimeEnvironmentId = parsedRepoHost?.kind === 'runtime' ? parsedRepoHost.environmentId : null
  const connectionId = repo ? (getRepoSshConnectionId(repo) ?? undefined) : undefined
  const fileContext = useMemo<RuntimeFileOperationArgs | null>(() => {
    if (!repo || !worktree) {
      return null
    }
    return {
      target: runtimeTargetForOwnerEnvironment(runtimeEnvironmentId),
      worktreeId: worktree.id,
      worktreePath: worktree.path,
      connectionId
    }
  }, [connectionId, repo, runtimeEnvironmentId, worktree])

  useEffect(() => {
    let active = true
    if (!fileContext || !worktree) {
      setState({ status: 'empty', names: [] })
      return () => {
        active = false
      }
    }
    setState({ status: 'loading', names: [] })
    void loadMcpConfigInspections(worktree.path, fileContext)
      .then((configs) => {
        if (!active) {
          return
        }
        const names = Array.from(
          new Set(
            configs
              .filter((config) => config.status === 'valid' && !config.readError)
              .flatMap((config) => config.servers.map((server) => server.name))
          )
        )
        setState({ status: names.length > 0 ? 'ready' : 'empty', names })
      })
      .catch(() => {
        if (active) {
          setState({ status: 'error', names: [] })
        }
      })
    return () => {
      active = false
    }
  }, [fileContext, worktree])

  return state
}
