import type { RightSidebarExplorerView } from '../../../../../../shared/ui-chrome-types'
import { hasExternalFileExplorerSurface } from '../../file-explorer-surfaces'

export function getVisibleFileExplorerWorktreePath({
  explorerView,
  rightSidebarOpen,
  worktreePath
}: {
  explorerView: RightSidebarExplorerView
  rightSidebarOpen: boolean
  worktreePath: string | null
}): string | null {
  // Contents search leaves Files mounted; suppress hidden tree loads and macOS app-data probes.
  //
  // Why the second surface: the sidebar is no longer the only place this explorer appears.
  // Dolphin's canvas mounts it in a floating window with the sidebar closed, and asking only
  // about the sidebar called that tree hidden — it span forever in front of the user.
  const onScreen = rightSidebarOpen || hasExternalFileExplorerSurface()
  return onScreen && explorerView === 'files' ? worktreePath : null
}

export function shouldResetFileExplorerForVisibleWorktree(
  lastResetWorktreePath: string | null,
  visibleWorktreePath: string | null
): visibleWorktreePath is string {
  return visibleWorktreePath !== null && lastResetWorktreePath !== visibleWorktreePath
}
