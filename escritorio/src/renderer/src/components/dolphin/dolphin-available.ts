import type { Repo } from '../../../../shared/repo-types'
import { repoIsRemote } from '../../../../shared/agent-launch/startup/agent-launch-remote'
import { isRemoteExecutionHostId } from '../../../../shared/execution-host'
import { isWebClient } from '../sidebar/workspace-card/controller/worktree-card-model'

/**
 * Dolphin corre en esta máquina: el proceso principal levanta un Node sobre la carpeta del repo.
 * El cliente web no tiene ese proceso, y la carpeta de un repo por SSH o de otro host no está
 * acá: ahí la entrada y el modo live no se ofrecen, en vez de fallar cuando se tocan.
 */
export function dolphinRunsHere(): boolean {
  return !isWebClient()
}

export function dolphinRunsFor(
  repo: Pick<Repo, 'connectionId' | 'executionHostId'> | null | undefined
): boolean {
  return (
    dolphinRunsHere() &&
    repo != null &&
    !repoIsRemote(repo) &&
    !isRemoteExecutionHostId(repo.executionHostId)
  )
}
