import { makePaneKey, type PaneKey } from './stable-pane-id'

/** Detach one pane into a new tab; the leaf id and its terminal move with it. */
export type TerminalLeafMoveRequest = {
  /** The workspace the pane is leaving. */
  worktreeId: string
  /**
   * The workspace the new tab is born in; absent means the same one it left.
   *
   * Why optional and not required: every caller until now moved a pane inside one workspace, and
   * with a default those calls keep meaning exactly what they meant. It is set only to cross — a
   * pane going to the floating workspace, which is its own workspace
   * (`FLOATING_TERMINAL_WORKTREE_ID`) and the reason this field exists.
   */
  targetWorktreeId?: string
  sourceTabId: string
  targetTabId: string
  leafId: string
  /** The PTY the renderer's pane is attached to now, when it has one. */
  ptyId: string | null
  /** The caller cannot retire an emptied source tab, so the move must leave the source a pane. */
  keepsSourcePane?: true
}

/** Where the new tab is born: the target when the move crosses, else the workspace it left. */
export function terminalLeafMoveTarget(request: TerminalLeafMoveRequest): string {
  return request.targetWorktreeId ?? request.worktreeId
}

export type TerminalLeafMoveResult =
  /** Main moved the leaf and every pane-keyed record into the target tab in one durable write. */
  | {
      status: 'moved'
      ptyId: string | null
      /** The new tab's id when main named it (layout-owner builds); else the request's. */
      tabId?: string
    }
  /** Main's session never held the leaf, so there is nothing to move there. */
  | { status: 'not_held' }
  | {
      status: 'refused'
      reason:
        | 'invalid_request'
        | 'target_tab_exists'
        | 'pty_mismatch'
        | 'leaf_in_other_tab'
        | 'last_pane'
        /** A host window had no open pane to move, or could not move it. */
        | 'pane_unavailable'
    }

/** Main asks its window to move a client's pane; the window names the new tab as the client did. */
export type TerminalPaneMoveToNewTabRequest = {
  requestId: string
  worktreeId: string
  sourceTabId: string
  targetTabId: string
  leafId: string
  /** The drop's group and position in the host's order; without them the tab joins its source's group. */
  targetGroupId?: string
  index?: number
}

export type TerminalPaneMoveToNewTabReply = { requestId: string; result: TerminalLeafMoveResult }

export function terminalLeafMovePaneKeys(request: TerminalLeafMoveRequest): {
  from: PaneKey
  to: PaneKey
} {
  return {
    from: makePaneKey(request.sourceTabId, request.leafId),
    to: makePaneKey(request.targetTabId, request.leafId)
  }
}

export function isTerminalLeafMoveRequest(value: unknown): value is TerminalLeafMoveRequest {
  if (!value || typeof value !== 'object') {
    return false
  }
  const candidate: Record<string, unknown> = { ...value }
  const isId = (field: unknown): field is string =>
    typeof field === 'string' && field.length > 0 && field.length <= 512
  if (
    !isId(candidate.worktreeId) ||
    !isId(candidate.sourceTabId) ||
    !isId(candidate.targetTabId) ||
    !isId(candidate.leafId) ||
    !(candidate.ptyId === null || isId(candidate.ptyId)) ||
    // Why se valida igual que los otros ids y no se acepta vacío: un `''` acá escribiría la
    // pestaña nueva en un workspace sin nombre, que después nadie encuentra.
    !(candidate.targetWorktreeId === undefined || isId(candidate.targetWorktreeId)) ||
    !(candidate.keepsSourcePane === undefined || candidate.keepsSourcePane === true) ||
    candidate.sourceTabId === candidate.targetTabId
  ) {
    return false
  }
  try {
    makePaneKey(candidate.sourceTabId, candidate.leafId)
    makePaneKey(candidate.targetTabId, candidate.leafId)
    return true
  } catch {
    return false
  }
}
