import type { Repo } from '../../repo-types'
import {
  getRepoExecutionHostId,
  parseExecutionHostId,
  type ParsedExecutionHost
} from '../../execution-host'
import { isWslUncPath } from '../../wsl-paths'

/** SSH relays and Dolphin servers put plain `dolphin` on PATH; the Linux `dolphin-ide` rename is for local desktops and WSL. */
export function launchHostIsRemote(
  hostKind: ParsedExecutionHost['kind'],
  workspacePath: string | null | undefined
): boolean {
  return hostKind !== 'local' && !(workspacePath && isWslUncPath(workspacePath))
}

export function repoIsRemote(
  repo: Pick<Repo, 'connectionId' | 'executionHostId'> & { path?: string | null }
): boolean {
  const hostKind = parseExecutionHostId(getRepoExecutionHostId(repo))?.kind ?? 'local'
  return launchHostIsRemote(hostKind, repo.path)
}
