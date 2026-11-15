import type { GitCommitActionResult } from '../../shared/git-commit-action'
import type {
  GitBranchCompareResult,
  GitCommitCompareResult,
  BaseDelBordeDeGit,
  GitDiffResult
} from '../../shared/git/diff/git-diff-compare-types'
import type { GitMutationInFlight } from '../../shared/git/commands/git-mutation-in-flight'
import type {
  GitConflictOperation,
  GitStagingArea,
  GitStatusResult,
  GitUpstreamStatus
} from '../../shared/git/status/git-status-types'
import type { GitPushTarget } from '../../shared/worktree/types'
import type {
  GitHistoryItemRef,
  GitHistoryOptions,
  GitHistoryResult
} from '../../shared/git/history/git-history-types'
import type {
  CommitMessageAgentCapability,
  CommitMessageModelCapability
} from '../../shared/source-control/ai/generation/commit-message-agent-spec'

export type GitInspectionApi = {
  status: (args: {
    worktreePath: string
    connectionId?: string
    admissionTier?: 'interactive' | 'status' | 'background'
    includeIgnored?: boolean
    includeLineStats?: boolean
    bypassEffectiveUpstreamNegativeCache?: boolean
    reuseLineStats?: boolean
    /** Merge-base OID to measure the branch line total against; omit to skip the work. */
    branchLineTotalMergeBase?: string
    requestToken?: string
    /** The active workspace's first status: a user act that may start its WSL distro. */
    wakeWslDistro?: boolean
  }) => Promise<GitStatusResult>
  cancelStatus: (args: { requestToken: string }) => Promise<void>
  setStatusUpstreamRefWatch: (args: {
    worktreeId: string
    worktreePath: string
    executionHostId: string
    connectionId?: string
    branch?: string
    upstreamName?: string
  }) => Promise<void>
  submoduleStatus: (args: {
    worktreePath: string
    submodulePath: string
    connectionId?: string
    area?: GitStagingArea
  }) => Promise<GitStatusResult>
  checkIgnored: (args: {
    worktreePath: string
    paths: string[]
    connectionId?: string
  }) => Promise<string[]>
  findHugeFoldersToIgnore: (args: { worktreePath: string }) => Promise<string[]>
  refs: (args: {
    worktreePath: string
    connectionId?: string
    query?: string
  }) => Promise<GitHistoryItemRef[]>
  history: (
    args: {
      worktreePath: string
      connectionId?: string
      wakeWslDistro?: boolean
    } & GitHistoryOptions
  ) => Promise<GitHistoryResult>
  conflictOperation: (args: {
    worktreePath: string
    connectionId?: string
  }) => Promise<GitConflictOperation>
  mutationInFlight: (args: {
    worktreePath: string
    connectionId?: string
  }) => Promise<GitMutationInFlight>
  diff: (args: {
    worktreePath: string
    filePath: string
    staged: boolean
    compareAgainstHead?: boolean
    oldPath?: string
    connectionId?: string
    wakeWslDistro?: boolean
  }) => Promise<GitDiffResult>
  branchCompare: (args: {
    worktreePath: string
    baseRef: string
    connectionId?: string
    admissionTier?: 'interactive' | 'status' | 'background'
  }) => Promise<GitBranchCompareResult>
  commitCompare: (args: {
    worktreePath: string
    commitId: string
    connectionId?: string
  }) => Promise<GitCommitCompareResult>
  upstreamStatus: (args: {
    worktreePath: string
    connectionId?: string
    pushTarget?: GitPushTarget
  }) => Promise<GitUpstreamStatus>
  branchDiff: (args: {
    worktreePath: string
    compare: {
      baseRef: string
      baseOid: string
      headOid: string
      mergeBase: string
    }
    filePath: string
    oldPath?: string
    connectionId?: string
    wakeWslDistro?: boolean
  }) => Promise<GitDiffResult>
  /** La base del borde de git del editor: el índice si está preparado, si no HEAD. */
  fileBaseForGutter: (args: {
    worktreePath: string
    filePath: string
    connectionId?: string
  }) => Promise<BaseDelBordeDeGit>
  commitDiff: (args: {
    worktreePath: string
    commitOid: string
    parentOid?: string | null
    filePath: string
    oldPath?: string
    connectionId?: string
    wakeWslDistro?: boolean
  }) => Promise<GitDiffResult>
  discoverCommitMessageModels: (args: {
    agentId: string
    worktreePath?: string
    connectionId?: string
  }) => Promise<
    | {
        success: true
        capability: CommitMessageAgentCapability
        models: CommitMessageModelCapability[]
        defaultModelId: string
        catalogOrigin: 'probe' | 'spec'
      }
    | { success: false; error: string }
  >
  remoteFileUrl: (args: {
    worktreePath: string
    relativePath: string
    line: number
    endLine?: number
    connectionId?: string
  }) => Promise<string | null>
  /** Trae un commit de otra rama a esta, o lo deshace con otro commit encima. */
  cherryPick: (args: {
    worktreePath: string
    commitId: string
    connectionId?: string
  }) => Promise<GitCommitActionResult>
  revert: (args: {
    worktreePath: string
    commitId: string
    connectionId?: string
  }) => Promise<GitCommitActionResult>
  /** Empieza una rama en ese commit y se para ahí. */
  branchFrom: (args: {
    worktreePath: string
    commitId: string
    connectionId?: string
  }) => Promise<GitCommitActionResult>
  remoteCommitUrl: (args: {
    worktreePath: string
    sha: string
    connectionId?: string
  }) => Promise<string | null>
}
