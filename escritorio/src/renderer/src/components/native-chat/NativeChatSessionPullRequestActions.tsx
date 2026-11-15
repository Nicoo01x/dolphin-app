import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LoaderCircle, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { resolveSourceControlAiEnabled } from '../../../../shared/source-control/ai/source-control-ai-operation-policy'
import type { HostedReviewInfo } from '../../../../shared/source-control/hosted-review/hosted-review-contracts'
import type { PRCheckDetail, PRCheckRunDetails } from '../../../../shared/github/check-types'
import type { PRInfo } from '../../../../shared/github/pull-request-types'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import { forgeOwnerHostIdForWorkspace } from '@/runtime/source-control/forge/forge-credential-target'
import { loadGitLabJobLogDetails } from '@/runtime/repository-gitlab/gitlab-job-trace-client'
import { startFixChecksAgent } from '@/lib/source-control/checks/fix-checks-agent-launch'
import {
  buildFixBrokenChecksPrompt,
  getBrokenChecks,
  getCheckDetailsPromptKey
} from '../../../../shared/source-control/checks/pr-checks-fix-prompt'
import { presentGitHubPRMergeState } from '../github-pr-merge-state'
import { resolveGitHubPRMergeMethods } from '../../../../shared/github/pull-request-merge-methods'
import { useHostedReviewActions } from '../right-sidebar/hosted-review/provider-actions/use-hosted-review-actions'
import { useSourceControlPanelModel } from '../right-sidebar/source-control/panel/use-panel-model'
import { summarizeProviderChecks } from '../../../../shared/source-control/checks/provider-check-summary'

const EMPTY_CHECKS: PRCheckDetail[] = []

export function NativeChatSessionPullRequestActions({
  repo,
  worktree,
  review,
  githubPR,
  checks,
  branch
}: {
  repo: Repo
  worktree: Worktree
  review: HostedReviewInfo
  githubPR: PRInfo | null
  checks: PRCheckDetail[]
  branch: string
}): React.JSX.Element {
  const settings = useAppStore((state) => state.settings)
  const fetchPRCheckDetails = useAppStore((state) => state.fetchPRCheckDetails)
  const fetchHostedReviewForBranch = useAppStore((state) => state.fetchHostedReviewForBranch)
  const fetchPRForBranch = useAppStore((state) => state.fetchPRForBranch)
  const [isFixingChecks, setIsFixingChecks] = useState(false)
  const sourceControlAiActionsVisible = resolveSourceControlAiEnabled({ settings, repo })
  const mergeMethods = useMemo(
    () => resolveGitHubPRMergeMethods(githubPR?.mergeMethodSettings ?? null),
    [githubPR?.mergeMethodSettings]
  )
  const mergePresentation = useMemo(
    () =>
      review.provider === 'github'
        ? presentGitHubPRMergeState({
            ...githubPR,
            state: review.state,
            mergeable: review.mergeable,
            mergeStateStatus: review.mergeStateStatus,
            reviewDecision: review.reviewDecision,
            checksStatus: review.status,
            checksSummary: summarizeProviderChecks(checks),
            autoMergeEnabled: review.autoMergeEnabled,
            autoMergeAllowed: review.autoMergeAllowed,
            mergeQueueRequired: review.mergeQueueRequired
          })
        : null,
    [checks, githubPR, review]
  )
  const refreshReview = useCallback(async () => {
    const linkedReviewNumbers = {
      linkedGitHubPR: review.provider === 'github' ? review.number : null,
      linkedGitLabMR: review.provider === 'gitlab' ? review.number : null
    }
    await fetchHostedReviewForBranch(repo.path, branch, {
      force: true,
      repoId: repo.id,
      ...linkedReviewNumbers
    })
    if (review.provider === 'github') {
      await fetchPRForBranch(repo.path, branch, {
        force: true,
        repoId: repo.id,
        worktreeId: worktree.id,
        linkedPRNumber: review.number,
        reason: 'post-push'
      })
    }
  }, [
    branch,
    fetchHostedReviewForBranch,
    fetchPRForBranch,
    repo,
    review.number,
    review.provider,
    worktree.id
  ])
  const hostedReviewActions = useHostedReviewActions({
    review,
    githubPR,
    repo,
    isGitLab: review.provider === 'gitlab',
    shortLabel: review.provider === 'gitlab' ? 'MR' : 'PR',
    reviewLabel: review.provider === 'gitlab' ? 'merge request' : 'pull request',
    defaultMergeMethod: mergeMethods.defaultMethod,
    autoMergeAction: mergePresentation?.autoMergeAction ?? null,
    onRefreshReview: refreshReview
  })
  const handleFixChecks = useCallback(async () => {
    if (!sourceControlAiActionsVisible || isFixingChecks) {
      return
    }
    const broken = getBrokenChecks(checks)
    if (broken.length === 0) {
      return
    }
    setIsFixingChecks(true)
    try {
      const detailsByCheckKey: Record<string, PRCheckRunDetails> = {}
      await Promise.all(
        broken.slice(0, 5).map(async (check, index) => {
          if (review.provider === 'gitlab' && !check.gitlabJobId) {
            return
          }
          if (
            review.provider !== 'gitlab' &&
            !check.checkRunId &&
            !check.workflowRunId &&
            !check.url
          ) {
            return
          }
          try {
            const details = check.gitlabJobId
              ? await loadGitLabJobLogDetails({
                  repoPath: repo.path,
                  repoId: repo.id,
                  repoOwnerExecutionHostId: forgeOwnerHostIdForWorkspace(repo, worktree),
                  check,
                  projectRef: null
                })
              : await fetchPRCheckDetails(
                  repo.path,
                  {
                    checkRunId: check.checkRunId,
                    workflowRunId: check.workflowRunId,
                    checkName: check.name,
                    url: check.url,
                    prRepo: githubPR?.prRepo ?? null
                  },
                  { repoId: repo.id }
                )
            if (details) {
              detailsByCheckKey[getCheckDetailsPromptKey(check, index)] = details
            }
          } catch {
            console.warn('[NativeChat] failed to load check details for fix prompt')
          }
        })
      )
      const started = await startFixChecksAgent({
        repoId: repo.id,
        basePrompt: buildFixBrokenChecksPrompt({
          reviewKind: review.provider === 'gitlab' ? 'MR' : 'PR',
          reviewNumber: review.number,
          reviewTitle: review.title,
          reviewUrl: review.url,
          checks,
          checkRunDetailsByCheckKey: detailsByCheckKey
        }),
        worktreeId: worktree.id,
        groupId: worktree.id,
        launchSource: 'task_page'
      })
      if (started) {
        toast.success(
          translate(
            'components.nativeChat.sessionSidePanel.fixChecksStarted',
            'Started an agent to fix the checks'
          )
        )
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translate(
              'components.nativeChat.sessionSidePanel.fixChecksError',
              'Could not fix checks'
            )
      )
    } finally {
      setIsFixingChecks(false)
    }
  }, [
    checks,
    fetchPRCheckDetails,
    githubPR?.prRepo,
    isFixingChecks,
    repo,
    review,
    sourceControlAiActionsVisible,
    worktree
  ])
  const brokenCount = getBrokenChecks(checks).length
  const autoMergeAction = mergePresentation?.autoMergeAction

  return (
    <div className="space-y-1.5">
      {brokenCount > 0 && sourceControlAiActionsVisible ? (
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className="h-7 rounded-full bg-foreground/[0.08] px-3 text-xs text-chat-foreground-strong hover:bg-foreground/[0.13]"
          disabled={isFixingChecks}
          onClick={() => void handleFixChecks()}
        >
          {isFixingChecks ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
          {translate('components.nativeChat.sessionSidePanel.fixChecks', 'Fix checks')}
        </Button>
      ) : null}
      {autoMergeAction?.kind === 'enable' ? (
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className="h-7 rounded-full bg-foreground/[0.08] px-3 text-xs text-chat-foreground-strong hover:bg-foreground/[0.13]"
          disabled={hostedReviewActions.merging}
          onClick={() => void hostedReviewActions.handleAutoMerge()}
        >
          {hostedReviewActions.merging ? <LoaderCircle className="animate-spin" /> : null}
          {autoMergeAction.label}
        </Button>
      ) : null}
      {hostedReviewActions.actionError ? (
        <p className="text-xs text-destructive">{hostedReviewActions.actionError}</p>
      ) : null}
    </div>
  )
}

export function NativeChatSessionCreatePullRequestAction({
  worktreeId
}: {
  worktreeId: string
}): null {
  const sourceControl = useSourceControlPanelModel()
  const invoked = useRef(false)
  useEffect(() => {
    if (
      invoked.current ||
      sourceControl.activeWorktreeId !== worktreeId ||
      !sourceControl.visibleCreatePrHeaderAction ||
      sourceControl.visibleCreatePrHeaderAction.disabled
    ) {
      return
    }
    invoked.current = true
    sourceControl.handleCreatePrHeaderClick()
  }, [sourceControl, worktreeId])
  return null
}

export { EMPTY_CHECKS }
