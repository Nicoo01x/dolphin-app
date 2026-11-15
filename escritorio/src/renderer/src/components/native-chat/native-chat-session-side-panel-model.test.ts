import { describe, expect, it } from 'vitest'
import { buildNativeChatSessionSidePanelModel } from './native-chat-session-side-panel-model'

const base = {
  host: 'Esta computadora',
  repo: { name: 'stepbro-website', path: '~/Projects' },
  branch: { kind: 'branch' as const, branchName: 'feature/session-panel' },
  git: {
    available: true,
    loading: false,
    error: false,
    summary: {
      baseRef: 'main',
      baseOid: 'base',
      compareRef: 'HEAD',
      headOid: 'head',
      mergeBase: 'base',
      changedFiles: 2,
      status: 'ready' as const
    },
    branchEntries: [
      { path: 'src/App.tsx', status: 'modified' as const, added: 4, removed: 2 },
      { path: 'src/panel.tsx', status: 'added' as const, added: 8, removed: 0 }
    ],
    statusEntries: [],
    lineTotal: { added: 12, removed: 2, mergeBase: 'base' }
  },
  connectors: { status: 'ready' as const, names: ['Linear', 'GitHub'] },
  contextUsage: {
    usedTokens: 71_000,
    windowTokens: 200_000,
    percentage: 36,
    estimated: false,
    rows: []
  },
  pullRequest: 'create' as const,
  messages: [
    {
      id: 'agent-1',
      role: 'assistant' as const,
      blocks: [
        { type: 'tool-call' as const, name: 'Edit', input: { file_path: 'src/panel.tsx' } }
      ],
      timestamp: null,
      source: 'transcript' as const
    }
  ],
  portonRepoPath: '~/Projects/stepbro-website'
}

describe('buildNativeChatSessionSidePanelModel', () => {
  it('builds the cross-review payload from the latest user task and known metadata', () => {
    const input = {
      ...base,
      baseRef: 'origin/main',
      crossReviewOnAgentStop: true,
      messages: [
        {
          id: 'user-1',
          role: 'user' as const,
          blocks: [{ type: 'text' as const, text: 'Arreglá el botón de guardar' }],
          timestamp: 1,
          source: 'transcript' as const
        },
        {
          id: 'assistant-1',
          role: 'assistant' as const,
          model: 'sonnet',
          blocks: [{ type: 'text' as const, text: 'Listo' }],
          timestamp: 2,
          source: 'transcript' as const
        }
      ]
    }
    const model = buildNativeChatSessionSidePanelModel(input)

    expect(model.porton.revision).toEqual({
      tarea: 'Arreglá el botón de guardar',
      escribio: 'sonnet',
      base: 'origin/main'
    })
    // Apagada, ni el portón a mano la manda: la revisión gasta cupo del plan.
    expect(
      buildNativeChatSessionSidePanelModel({ ...input, crossReviewOnAgentStop: false }).porton.revision
    ).toBeUndefined()
  })

  it('does not invent a review task when the session has no user text', () => {
    expect(buildNativeChatSessionSidePanelModel(base).porton.revision).toBeUndefined()
  })

  it('projects the session environment, totals, connectors, and context', () => {
    expect(buildNativeChatSessionSidePanelModel(base)).toMatchObject({
      environment: {
        status: 'ready',
        host: 'Esta computadora',
        repoName: 'stepbro-website',
        repoPath: '~/Projects',
        branch: 'feature/session-panel'
      },
      connectors: { status: 'ready', names: ['Linear', 'GitHub'] },
      changes: {
        status: 'ready',
        added: 12,
        removed: 2,
        agentFiles: [{ path: 'src/panel.tsx', action: 'editado' }],
        pullRequest: 'create'
      },
      context: { status: 'ready', percentage: 36, usedTokens: 71_000, windowTokens: 200_000 },
      porton: { repoPath: '~/Projects/stepbro-website' }
    })
  })

  it('uses branch files and falls back to their line counts', () => {
    const model = buildNativeChatSessionSidePanelModel({
      ...base,
      git: { ...base.git, lineTotal: null }
    })
    expect(model.changes).toMatchObject({ added: 12, removed: 2 })
    expect(model.changes.files).toHaveLength(2)
  })

  it('distinguishes loading, no git, empty, and error states', () => {
    expect(
      buildNativeChatSessionSidePanelModel({
        ...base,
        git: { ...base.git, available: true, loading: true, summary: null, branchEntries: [] }
      }).changes.status
    ).toBe('loading')
    expect(
      buildNativeChatSessionSidePanelModel({
        ...base,
        repo: null,
        git: { ...base.git, available: false }
      }).changes.status
    ).toBe('empty')
    expect(
      buildNativeChatSessionSidePanelModel({
        ...base,
        git: { ...base.git, summary: { ...base.git.summary, changedFiles: 0 }, branchEntries: [], lineTotal: null }
      }).changes.status
    ).toBe('empty')
    expect(
      buildNativeChatSessionSidePanelModel({
        ...base,
        git: { ...base.git, error: true }
      }).changes.status
    ).toBe('error')
  })

  it.each([
    ['passed', { status: 'passed', failedCount: 0 }],
    ['failed', { status: 'failed', failedCount: 2 }],
    ['running', { status: 'running', failedCount: 0 }]
  ] as const)('keeps the PR CI state when it is %s', (status, ci) => {
    expect(
      buildNativeChatSessionSidePanelModel({
        ...base,
        pullRequest: 'view',
        pullRequestDetails: { ci, review: null, autoMerge: 'unavailable' }
      }).changes.pullRequestDetails?.ci
    ).toEqual({ status, failedCount: ci.failedCount })
  })

  it('keeps review and enabled auto-merge state for a PR', () => {
    expect(
      buildNativeChatSessionSidePanelModel({
        ...base,
        pullRequest: 'view',
        pullRequestDetails: {
          ci: { status: 'passed', failedCount: 0 },
          review: 'approved',
          autoMerge: 'enabled'
        }
      }).changes.pullRequestDetails
    ).toEqual({
      ci: { status: 'passed', failedCount: 0 },
      review: 'approved',
      autoMerge: 'enabled'
    })
  })

  it('keeps the create action when there is no PR', () => {
    expect(
      buildNativeChatSessionSidePanelModel({ ...base, pullRequest: 'create' }).changes
    ).toMatchObject({ pullRequest: 'create', pullRequestDetails: null })
  })
})
