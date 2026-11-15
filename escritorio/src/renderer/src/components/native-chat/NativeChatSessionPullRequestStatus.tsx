import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'
import type { NativeChatSessionSidePanelModel } from './native-chat-session-side-panel-model'

export function NativeChatSessionPullRequestStatus({
  details
}: {
  details: NonNullable<NativeChatSessionSidePanelModel['changes']['pullRequestDetails']>
}): React.JSX.Element {
  const ciLabel =
    details.ci.status === 'passed'
      ? translate('components.nativeChat.sessionSidePanel.ciPassed', 'CI passed')
      : details.ci.status === 'failed'
        ? translate('components.nativeChat.sessionSidePanel.ciFailed', 'CI failed {{count}}', {
            count: details.ci.failedCount
          })
        : details.ci.status === 'running'
          ? translate('components.nativeChat.sessionSidePanel.ciRunning', 'CI running')
          : translate('components.nativeChat.sessionSidePanel.ciUnknown', 'CI status unavailable')
  const ciTone =
    details.ci.status === 'passed'
      ? 'bg-emerald-500'
      : details.ci.status === 'failed'
        ? 'bg-rose-500'
        : details.ci.status === 'running'
          ? 'bg-amber-500'
          : 'bg-muted-foreground'
  const reviewLabel =
    details.review === 'approved'
      ? translate('components.nativeChat.sessionSidePanel.reviewApproved', 'Review approved')
      : details.review === 'changes_requested'
        ? translate(
            'components.nativeChat.sessionSidePanel.reviewChangesRequested',
            'Changes requested'
          )
        : details.review === 'required'
          ? translate('components.nativeChat.sessionSidePanel.reviewRequired', 'Review pending')
          : null
  const autoMergeLabel =
    details.autoMerge === 'enabled'
      ? translate(
          'components.nativeChat.sessionSidePanel.autoMergeEnabled',
          'Auto-merge will run when CI passes'
        )
      : null
  return (
    <div className="space-y-1 rounded-xl bg-foreground/[0.04] px-2.5 py-2 text-xs">
      <div className="flex items-center gap-2 text-chat-foreground-faint">
        <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', ciTone)} />
        <span>{ciLabel}</span>
      </div>
      {reviewLabel ? <div className="text-chat-foreground-faint">{reviewLabel}</div> : null}
      {autoMergeLabel ? <div className="text-chat-foreground-faint">{autoMergeLabel}</div> : null}
    </div>
  )
}
