import type {
  GitBranchChangeEntry,
  GitBranchCompareSummary
} from '../../../../shared/git/diff/git-diff-compare-types'
import type { GitBranchLineTotal, GitStatusEntry } from '../../../../shared/git/status/git-status-types'
import type { DolphinPortonRevision } from '../../../../shared/dolphin-console-types'
import type { NativeChatMessage } from '../../../../shared/native-chat/native-chat-types'
import type { WorktreeGitIdentityDisplay } from '../../../../shared/worktree/git-identity-display'
import type { NativeChatContextUsageSummary } from '../../../../shared/native-chat/native-chat-context-usage-summary'
import { summarizeStudioSession } from '../dolphin/studio/studio-summary'
import { lineaDeTiempo, type LineaDeTiempo } from '../dolphin/chat/linea-de-tiempo'
import { revisionForSession } from './native-chat-session-porton-revision'

export type NativeChatSessionSidePanelInput = {
  host: string | null
  repo: { name: string; path: string } | null
  branch: WorktreeGitIdentityDisplay | null
  git: {
    available: boolean
    loading: boolean
    error: boolean
    summary: GitBranchCompareSummary | null
    branchEntries: readonly GitBranchChangeEntry[]
    statusEntries: readonly GitStatusEntry[]
    lineTotal: GitBranchLineTotal | null
  }
  connectors: {
    status: 'loading' | 'ready' | 'empty' | 'error'
    names: readonly string[]
  }
  contextUsage: NativeChatContextUsageSummary | null
  pullRequest: 'create' | 'view' | 'none'
  messages: readonly NativeChatMessage[]
  portonRepoPath: string | null
  baseRef?: string
  agentWorking?: boolean
  crossReviewOnAgentStop?: boolean
  pullRequestDetails?: NativeChatSessionSidePanelPullRequestDetails | null
}

export type NativeChatSessionSidePanelPullRequestDetails = {
  ci: {
    status: 'passed' | 'failed' | 'running' | 'unknown'
    failedCount: number
  }
  review: 'approved' | 'changes_requested' | 'required' | null
  autoMerge: 'enabled' | 'available' | 'unavailable'
}

export type NativeChatSessionSidePanelModel = {
  environment: {
    status: 'ready' | 'empty'
    host: string | null
    repoName: string | null
    repoPath: string | null
    branch: string | null
  }
  connectors: NativeChatSessionSidePanelInput['connectors']
  changes: {
    status: 'loading' | 'ready' | 'empty' | 'error'
    added: number
    removed: number
    files: readonly NativeChatSessionSidePanelFile[]
    agentFiles: readonly NativeChatSessionSidePanelAgentFile[]
    pullRequest: NativeChatSessionSidePanelInput['pullRequest']
    pullRequestDetails: NativeChatSessionSidePanelPullRequestDetails | null
  }
  porton: {
    repoPath: string | null
    revision?: DolphinPortonRevision
    hasChanges: boolean
    agentWorking: boolean
    crossReviewOnAgentStop: boolean
  }
  /** Lo que fue pasando en la charla, hito por hito. */
  timeline: LineaDeTiempo
  context: {
    status: 'ready' | 'empty'
    percentage: number
    usedTokens: number
    windowTokens: number
  }
}

export type NativeChatSessionSidePanelFile = {
  path: string
  status: string
  added: number
  removed: number
}

export type NativeChatSessionSidePanelAgentFile = {
  path: string
  action: 'creado' | 'editado'
}

function branchLabel(branch: WorktreeGitIdentityDisplay | null): string | null {
  if (!branch) {
    return null
  }
  return branch.kind === 'branch' ? branch.branchName : branch.sourceControlLabel
}

function fileFromEntry(
  entry: GitBranchChangeEntry | GitStatusEntry
): NativeChatSessionSidePanelFile {
  return {
    path: entry.path,
    status: entry.status,
    added: entry.added ?? 0,
    removed: entry.removed ?? 0
  }
}

function sumFileLines(files: readonly NativeChatSessionSidePanelFile[]): {
  added: number
  removed: number
} {
  return files.reduce(
    (total, file) => ({
      added: total.added + file.added,
      removed: total.removed + file.removed
    }),
    { added: 0, removed: 0 }
  )
}

export function buildNativeChatSessionSidePanelModel(
  input: NativeChatSessionSidePanelInput
): NativeChatSessionSidePanelModel {
  const environment = {
    status: input.repo ? ('ready' as const) : ('empty' as const),
    host: input.host,
    repoName: input.repo?.name ?? null,
    repoPath: input.repo?.path ?? null,
    branch: branchLabel(input.branch)
  }
  const files =
    input.git.summary?.status === 'ready' || input.git.branchEntries.length > 0
      ? input.git.branchEntries.map(fileFromEntry)
      : input.git.statusEntries.map(fileFromEntry)
  const fileTotals = sumFileLines(files)
  const studioSummary = summarizeStudioSession(input.messages)
  const added = input.git.lineTotal?.added ?? fileTotals.added
  const removed = input.git.lineTotal?.removed ?? fileTotals.removed
  const hasChanges =
    input.git.branchEntries.length > 0 ||
    input.git.statusEntries.length > 0 ||
    (input.git.summary?.status === 'ready' && input.git.summary.changedFiles > 0) ||
    added > 0 ||
    removed > 0
  const changesStatus = !input.git.available
    ? 'empty'
    : input.git.error || input.git.summary?.status === 'error'
      ? 'error'
      : input.git.loading && input.git.summary === null && input.git.statusEntries.length === 0
        ? 'loading'
        : files.length === 0 && added === 0 && removed === 0
          ? 'empty'
          : 'ready'
  const context = input.contextUsage
  // La revisión paga cupo del plan: solo con el interruptor prendido, también al tocar «Portón» a mano.
  const revision = input.crossReviewOnAgentStop
    ? revisionForSession(input.messages, input.baseRef)
    : undefined

  return {
    environment,
    connectors: input.connectors,
    changes: {
      status: changesStatus,
      added,
      removed,
      files,
      agentFiles: studioSummary.files.map((path) => ({
        path,
        action: studioSummary.fileActions?.[path] ?? 'editado'
      })),
      pullRequest: input.pullRequest,
      pullRequestDetails: input.pullRequestDetails ?? null
    },
    porton: {
      repoPath: input.portonRepoPath,
      ...(revision ? { revision } : {}),
      hasChanges,
      agentWorking: input.agentWorking === true,
      crossReviewOnAgentStop: input.crossReviewOnAgentStop === true
    },
    timeline: lineaDeTiempo(input.messages),
    context: {
      status: context ? 'ready' : 'empty',
      percentage: context?.percentage ?? 0,
      usedTokens: context?.usedTokens ?? 0,
      windowTokens: context?.windowTokens ?? 0
    }
  }
}
