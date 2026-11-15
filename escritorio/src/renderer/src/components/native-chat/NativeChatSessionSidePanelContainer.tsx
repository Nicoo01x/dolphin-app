import { useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { LinkActionPopover } from '@/components/link-actions/LinkActionPopover'
import { createNativeChatFileHref } from '../../../../shared/native-chat/native-chat-href-routing'
import { detectLanguage } from '../../../../shared/editor-language/editor-language-detect'
import {
  getGitHubPRCacheKey,
  getGitHubRepoCacheKey
} from '../../../../shared/github/github-cache-key'
import { prChecksCacheSuffix } from '@/store/github/cache/cache-identity'
import { getHostedReviewCacheKey } from '@/store/slices/hosted-review/hosted-review-cache-identity'
import { hostedReviewInfoFromGitHubPRInfo } from '../../../../shared/source-control/hosted-review/hosted-review-github'
import { getHostDisplayLabelOverrides } from '../../../../shared/host-setting-overrides'
import {
  getExecutionHostLabel,
  getWorktreeExecutionHostId,
  parseExecutionHostId
} from '../../../../shared/execution-host'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import { getWorktreeGitIdentityDisplay } from '../../../../shared/worktree/git-identity-display'
import { dolphinRunsFor } from '../dolphin/dolphin-available'
import { useNativeChatSessionConnectors } from './use-native-chat-session-connectors'
import { NativeChatSessionSidePanel } from './NativeChatSessionSidePanel'
import { useNativeChatFileLinkContext } from './links/actions/use-native-chat-file-link-context'
import { useNativeChatLinkActions } from './links/actions/use-native-chat-link-actions'
import {
  buildNativeChatSessionSidePanelModel,
  type NativeChatSessionSidePanelInput
} from './native-chat-session-side-panel-model'
import type { NativeChatContextUsageSummary } from '../../../../shared/native-chat/native-chat-context-usage-summary'
import {
  EMPTY_CHECKS,
  NativeChatSessionCreatePullRequestAction,
  NativeChatSessionPullRequestActions
} from './NativeChatSessionPullRequestActions'
import { buildNativeChatSessionPullRequestDetails } from './native-chat-session-pull-request-state'
import { useSessionReviewPanelRegistration } from './use-session-review-panel-registration'

// Why una constante: el selector con useShallow compara por referencia; un `[]` nuevo en cada lectura
// hacía que React viera un cambio en cada render y entrara en un bucle (Maximum update depth).
const SIN_ENTRADAS: never[] = []

export function NativeChatSessionSidePanelContainer({
  worktreeId,
  contextUsage,
  messages,
  terminalTabId,
  sessionId,
  agentWorking
}: {
  worktreeId: string | null
  contextUsage: NativeChatContextUsageSummary | null
  messages: NativeChatSessionSidePanelInput['messages']
  terminalTabId: string
  sessionId: string | null
  agentWorking: boolean
}): React.JSX.Element {
  useSessionReviewPanelRegistration(sessionId, worktreeId)
  const worktree = useAppStore((state) =>
    worktreeId ? (state.getKnownWorktreeById(worktreeId) ?? null) : null
  )
  const repo = useAppStore((state) =>
    worktree ? (state.repos.find((candidate) => candidate.id === worktree.repoId) ?? null) : null
  )
  const branchDisplay = worktree ? getWorktreeGitIdentityDisplay(worktree) : null
  const branchName = branchDisplay?.kind === 'branch' ? branchDisplay.branchName : null
  const hostedReview = useAppStore((state) => {
    if (!repo || !branchName) {
      return null
    }
    const hostedReviewKey = getHostedReviewCacheKey(
      repo.path,
      branchName,
      state.settings,
      repo.id,
      repo.connectionId,
      repo.executionHostId,
      true
    )
    const cachedHostedReview = state.hostedReviewCache[hostedReviewKey]?.data
    if (cachedHostedReview) {
      return cachedHostedReview
    }
    const prCacheKey = getGitHubPRCacheKey(
      repo.path,
      repo.id,
      branchName,
      state.settings,
      repo.connectionId,
      repo.executionHostId,
      true
    )
    const githubPr = state.prCache[prCacheKey]?.data
    return githubPr ? hostedReviewInfoFromGitHubPRInfo(githubPr) : null
  })
  const githubPR = useAppStore((state) => {
    if (!repo || !branchName) {
      return null
    }
    const prCacheKey = getGitHubPRCacheKey(
      repo.path,
      repo.id,
      branchName,
      state.settings,
      repo.connectionId,
      repo.executionHostId,
      true
    )
    return state.prCache[prCacheKey]?.data ?? null
  })
  const checks = useAppStore((state) => {
    if (!repo || !hostedReview || hostedReview.provider !== 'github') {
      return EMPTY_CHECKS
    }
    const headSha = githubPR?.headSha
    const currentKey = getGitHubRepoCacheKey(
      repo.path,
      repo.id,
      prChecksCacheSuffix(hostedReview.number, githubPR?.prRepo ?? null, headSha),
      state.settings,
      repo.connectionId,
      repo.executionHostId,
      true
    )
    const legacyKey = getGitHubRepoCacheKey(
      repo.path,
      repo.id,
      prChecksCacheSuffix(hostedReview.number, githubPR?.prRepo ?? null),
      state.settings,
      repo.connectionId,
      repo.executionHostId,
      true
    )
    return state.checksCache[currentKey]?.data ?? state.checksCache[legacyKey]?.data ?? EMPTY_CHECKS
  })
  const [createPrRequested, setCreatePrRequested] = useState(false)
  const git = useAppStore(
    useShallow((state) => {
      const branchEntries = worktreeId
        ? (state.gitBranchChangesByWorktree[worktreeId] ?? SIN_ENTRADAS)
        : SIN_ENTRADAS
      const summary = worktreeId
        ? (state.gitBranchCompareSummaryByWorktree[worktreeId] ?? null)
        : null
      const publishedLineTotal = worktreeId
        ? (state.gitBranchLineTotalByWorktree[worktreeId] ?? null)
        : null
      const lineTotal =
        publishedLineTotal && publishedLineTotal.mergeBase === summary?.mergeBase
          ? publishedLineTotal
          : null
      return {
        available: Boolean(repo && repo.kind !== 'folder' && worktree),
        loading: Boolean(
          worktreeId && summary === null && state.gitStatusByWorktree[worktreeId] === undefined
        ),
        error: false,
        summary,
        branchEntries,
        statusEntries: worktreeId
          ? (state.gitStatusByWorktree[worktreeId] ?? SIN_ENTRADAS)
          : SIN_ENTRADAS,
        lineTotal
      }
    })
  )
  const connectors = useNativeChatSessionConnectors(repo, worktree)
  const host = useSessionHostLabel(repo, worktree)
  const fileLinkContext = useNativeChatFileLinkContext(terminalTabId)
  const rootRef = useRef<HTMLElement>(null)
  const { onLinkClick, linkActionRequest, closeLinkActions } = useNativeChatLinkActions(
    fileLinkContext,
    rootRef,
    { sessionId, isVisible: true }
  )
  const portonRepoPath = worktree && dolphinRunsFor(repo) ? worktree.path : null
  const crossReviewOnAgentStop = useAppStore(
    (state) => state.settings?.crossReviewOnAgentStop === true
  )
  const hasLinkedReview = Boolean(
    worktree?.linkedPR ??
    worktree?.linkedGitLabMR ??
    worktree?.linkedBitbucketPR ??
    worktree?.linkedAzureDevOpsPR ??
    worktree?.linkedGiteaPR
  )
  const pullRequest =
    hostedReview || hasLinkedReview
      ? 'view'
      : repo && repo.kind !== 'folder' && branchName
        ? 'create'
        : 'none'
  const pullRequestDetails = hostedReview
    ? buildNativeChatSessionPullRequestDetails(hostedReview, checks)
    : null
  const input = useMemo<NativeChatSessionSidePanelInput>(
    () => ({
      host,
      repo: repo && worktree ? { name: repo.displayName, path: repo.path } : null,
      branch: worktree ? getWorktreeGitIdentityDisplay(worktree) : null,
      git,
      connectors,
      contextUsage,
      pullRequest,
      pullRequestDetails,
      messages,
      portonRepoPath,
      baseRef: worktree?.baseRef,
      agentWorking,
      crossReviewOnAgentStop
    }),
    [
      agentWorking,
      connectors,
      contextUsage,
      crossReviewOnAgentStop,
      git,
      host,
      messages,
      portonRepoPath,
      pullRequest,
      pullRequestDetails,
      repo,
      worktree
    ]
  )
  const data = useMemo(() => buildNativeChatSessionSidePanelModel(input), [input])

  return (
    <>
      <NativeChatSessionSidePanel
        rootRef={rootRef}
        data={data}
        onCreatePullRequest={() => setCreatePrRequested(true)}
        onViewPullRequest={() => {
          useAppStore.getState().setRightSidebarOpen(true)
          useAppStore.getState().setRightSidebarTab('checks')
        }}
        pullRequestActions={
          hostedReview && repo && worktree && branchName ? (
            <NativeChatSessionPullRequestActions
              repo={repo}
              worktree={worktree}
              review={hostedReview}
              githubPR={githubPR}
              checks={checks}
              branch={branchName}
            />
          ) : createPrRequested && worktreeId ? (
            <NativeChatSessionCreatePullRequestAction worktreeId={worktreeId} />
          ) : undefined
        }
        onOpenFile={(path) => {
          if (!worktreeId || !worktree || !git.summary || git.summary.status !== 'ready') {
            return
          }
          const entry = git.branchEntries.find((candidate) => candidate.path === path)
          if (!entry) {
            return
          }
          useAppStore
            .getState()
            .openBranchDiff(
              worktreeId,
              worktree.path,
              entry,
              git.summary,
              detectLanguage(entry.path)
            )
        }}
        onOpenSessionFile={(event, path) =>
          path ? onLinkClick?.(event, createNativeChatFileHref(path, 'literal')) : undefined
        }
      />
      <LinkActionPopover request={linkActionRequest} onClose={closeLinkActions} />
    </>
  )
}

function useSessionHostLabel(repo: Repo | null, worktree: Worktree | null): string | null {
  const settings = useAppStore((state) => state.settings)
  const runtimeEnvironments = useAppStore((state) => state.runtimeEnvironments)
  const sshTargetLabels = useAppStore((state) => state.sshTargetLabels)
  return useMemo(() => {
    if (!repo || !worktree) {
      return null
    }
    const hostId = getWorktreeExecutionHostId(worktree, repo)
    const override = getHostDisplayLabelOverrides(settings).get(hostId)
    if (override) {
      return override
    }
    const parsed = parseExecutionHostId(hostId)
    if (parsed?.kind === 'local') {
      return translate('components.nativeChat.sessionSidePanel.thisComputer', 'This computer')
    }
    if (parsed?.kind === 'runtime') {
      return runtimeEnvironments.find((entry) => entry.id === parsed.environmentId)?.name ?? hostId
    }
    if (parsed?.kind === 'ssh') {
      return sshTargetLabels.get(parsed.targetId) ?? parsed.targetId
    }
    return getExecutionHostLabel(hostId)
  }, [repo, runtimeEnvironments, settings, sshTargetLabels, worktree])
}
