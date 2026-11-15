import type { HostedReviewInfo } from '../../../../shared/source-control/hosted-review/hosted-review-contracts'
import type { PRCheckDetail } from '../../../../shared/github/check-types'
import { summarizeProviderChecks } from '../../../../shared/source-control/checks/provider-check-summary'
import { presentGitHubPRMergeState } from '../github-pr-merge-state'
import type { NativeChatSessionSidePanelInput } from './native-chat-session-side-panel-model'

export function buildNativeChatSessionPullRequestDetails(
  review: HostedReviewInfo,
  checks: readonly PRCheckDetail[]
): NonNullable<NativeChatSessionSidePanelInput['pullRequestDetails']> {
  const summary = summarizeProviderChecks(checks)
  const ciStatus =
    summary.state === 'success'
      ? 'passed'
      : summary.state === 'failure'
        ? 'failed'
        : summary.state === 'pending'
          ? 'running'
          : review.status === 'success'
            ? 'passed'
            : review.status === 'failure'
              ? 'failed'
              : review.status === 'pending'
                ? 'running'
                : 'unknown'
  return {
    ci: {
      status: ciStatus,
      failedCount: summary.failed || (review.status === 'failure' ? 1 : 0)
    },
    review:
      review.reviewDecision === 'APPROVED'
        ? 'approved'
        : review.reviewDecision === 'CHANGES_REQUESTED'
          ? 'changes_requested'
          : review.reviewDecision === 'REVIEW_REQUIRED'
            ? 'required'
            : null,
    autoMerge:
      review.provider === 'github'
        ? review.autoMergeEnabled
          ? 'enabled'
          : presentGitHubPRMergeState({
                state: review.state,
                mergeable: review.mergeable,
                mergeStateStatus: review.mergeStateStatus,
                reviewDecision: review.reviewDecision,
                checksStatus: review.status,
                autoMergeAllowed: review.autoMergeAllowed,
                mergeQueueRequired: review.mergeQueueRequired
              }).autoMergeAction?.kind === 'enable'
            ? 'available'
            : 'unavailable'
        : 'unavailable'
  }
}
