import { useEffect } from 'react'
import { useAppStore } from '@/store'

/**
 * Declares, while the session side panel is open, that this chat is showing its worktree's review.
 *
 * The panel used to only READ `hostedReviewCache`. Nothing filled it on its behalf: the refresh
 * machinery wakes for the sidebar list's visible rows and for the active worktree when the right
 * sidebar sits on Source control or Checks — and `rightSidebarShowsPullRequestData` returns false
 * in the Tasks view by construction. So with the panel open and the git sidebar closed, its Pull
 * request section stayed empty for as long as you left it there.
 *
 * Registering is enough to keep it fresh afterwards: the reporting effect unions this set into the
 * visible review ids. The one immediate enqueue is for the first paint, which otherwise waits for
 * the next poll — long enough to read as broken.
 */
export function useSessionReviewPanelRegistration(
  sessionId: string | null,
  worktreeId: string | null
): void {
  const register = useAppStore((state) => state.setSessionReviewPanelWorktree)
  useEffect(() => {
    if (!sessionId || !worktreeId) {
      return
    }
    register(sessionId, worktreeId)
    // Asked once per open, not on every render: `enqueueGitHubPRRefresh` keeps its own freshness
    // and routing rules, so a repo with no review, or one already fetched, costs nothing here.
    useAppStore.getState().enqueueGitHubPRRefresh(worktreeId, 'visible', 80)
    return () => register(sessionId, null)
  }, [register, sessionId, worktreeId])
}
