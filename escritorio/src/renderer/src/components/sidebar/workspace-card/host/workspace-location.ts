import {
  isOwnedSshTargetId,
  isUnresolvedOwnerHostId,
  parseExecutionHostId
} from '../../../../../../shared/execution-host'

/** Where a workspace's terminals and agents run, as the sidebar row tells it. */
export type WorkspaceLocation =
  | { kind: 'local' }
  /** `hostLabel` is null when the server has no name worth showing. */
  | { kind: 'server'; hostLabel: string | null }

/**
 * This computer or a server. A WSL distro is a host of its own but lives on this same machine,
 * so it counts as local; SSH targets, `dolphind` servers and cloud VMs count as servers.
 * Null when ownership is unresolved: claiming either place would be a guess.
 */
export function resolveWorkspaceLocation(args: {
  executionHostId: string | null | undefined
  /** The distro when the host is a WSL one on this machine, null otherwise. */
  wslDistro: string | null
  /** The name the rest of the sidebar uses for that host, if it has one. */
  hostLabel: string | null
}): WorkspaceLocation | null {
  if (isUnresolvedOwnerHostId(args.executionHostId)) {
    return null
  }
  const host = parseExecutionHostId(args.executionHostId)
  if (!host || host.kind === 'local') {
    return { kind: 'local' }
  }
  if (host.kind === 'runtime' && args.wslDistro) {
    return { kind: 'local' }
  }
  const hostLabel = args.hostLabel?.trim() || null
  if (host.kind === 'ssh') {
    // Owned targets carry generated ids (`machine-…`, `runtime-ssh-…`); a raw id is not a name.
    const fallback = isOwnedSshTargetId(host.targetId) ? null : host.targetId
    return { kind: 'server', hostLabel: hostLabel ?? fallback }
  }
  return { kind: 'server', hostLabel }
}
