import { describe, expect, it } from 'vitest'
import type { Worktree } from '../../worktree/types'
import { deriveAiVaultWorkspaceScopePaths } from './ai-vault-scope-paths'

function makeWorktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    id: 'repo-1::/repo/dolphin',
    repoId: 'repo-1',
    displayName: 'dolphin',
    path: '/repo/dolphin',
    head: 'abc123',
    branch: 'main',
    isBare: false,
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 1,
    isMainWorktree: false,
    ...overrides
  }
}

describe('deriveAiVaultWorkspaceScopePaths', () => {
  it('drops a claimed prior path regardless of where the claimant sits in the list', () => {
    // Exclude the active workspace before indexing owners so duplicates cannot hide later claimants.
    const active = makeWorktree({
      id: 'repo-1::/repo/dolphin-renamed',
      path: '/repo/dolphin-renamed',
      priorWorktreeIds: ['repo-1::/repo/dolphin']
    })
    const claimant = makeWorktree({ id: 'repo-1::/repo/dolphin', path: '/repo/dolphin' })
    // Listing the active workspace at the prior path exposes first-writer-wins ownership bugs.
    const activeAtPriorPath = makeWorktree({ id: active.id, path: '/repo/dolphin' })

    for (const liveWorktrees of [
      [active, claimant],
      [claimant, active],
      [activeAtPriorPath, claimant],
      [claimant, activeAtPriorPath]
    ]) {
      expect(deriveAiVaultWorkspaceScopePaths(active, liveWorktrees)).toEqual([
        '/repo/dolphin-renamed'
      ])
    }
  })
})
