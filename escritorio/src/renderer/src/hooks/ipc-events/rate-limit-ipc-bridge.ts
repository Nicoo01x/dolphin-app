import type { RateLimitState } from '../../../../shared/rate-limit-types'
import { useAppStore } from '../../store'
import { toast } from 'sonner'
import { getIntlLocale, translate } from '../../i18n/i18n'

let lastAccountSwitchNoticeId: string | null = null

function showAccountSwitchNotice(state: RateLimitState): void {
  const notice = state.accountSwitchNotice
  if (!notice || notice.id === lastAccountSwitchNoticeId) {
    return
  }
  lastAccountSwitchNoticeId = notice.id
  const from =
    notice.from.label ??
    translate('auto.components.dolphin.quota.currentAccount', 'the current account')
  if (notice.kind === 'switch' && notice.to) {
    toast.info(
      translate(
        'auto.components.dolphin.quota.switched',
        'Switched to {{value0}} because {{value1}} ran out of quota.',
        {
          value0: notice.to.label ?? notice.to.id,
          value1: from
        }
      )
    )
    return
  }
  const reset = notice.resetsAt
    ? new Intl.DateTimeFormat(getIntlLocale(), { dateStyle: 'short', timeStyle: 'short' }).format(
        notice.resetsAt
      )
    : null
  toast.info(
    translate(
      'auto.components.dolphin.quota.none',
      'No account has quota left because {{value0}} ran out of quota{{value1}}',
      {
        value0: from,
        value1: reset
          ? translate('auto.components.dolphin.quota.resetAt', '; quota returns at {{value0}}.', {
              value0: reset
            })
          : translate(
              'auto.components.dolphin.quota.resetUnknown',
              '; quota returns when the provider reports it.'
            )
      }
    )
  )
}

export function registerRateLimitIpcBridge(unsubs: (() => void)[]): void {
  let initialSnapshotPending = true
  let receivedPushBeforeInitialSnapshot = false
  unsubs.push(
    window.api.rateLimits.onUpdate((state) => {
      if (initialSnapshotPending) {
        receivedPushBeforeInitialSnapshot = true
      }
      useAppStore.getState().setRateLimitsFromPush(state as RateLimitState)
      showAccountSwitchNotice(state as RateLimitState)
    })
  )
  // The startup get is a fallback: a push before resolution permanently wins.
  window.api.rateLimits.get().then((state) => {
    initialSnapshotPending = false
    if (receivedPushBeforeInitialSnapshot) {
      return
    }
    useAppStore.getState().setRateLimitsFromPush(state as RateLimitState)
    showAccountSwitchNotice(state as RateLimitState)
  })

  const unsubscribeWorkspaceSpaceProgress = window.api.workspaceSpace?.onProgress?.((progress) => {
    useAppStore.getState().applyWorkspaceSpaceProgress(progress)
  })
  if (unsubscribeWorkspaceSpaceProgress) {
    unsubs.push(unsubscribeWorkspaceSpaceProgress)
  }
}
