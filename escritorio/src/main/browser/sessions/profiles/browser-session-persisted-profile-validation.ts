import { getDolphinProfileBrowserSessionPartition } from '../../../../shared/dolphin-profiles'
import type { BrowserSessionProfile } from '../../../../shared/browser-workspace-types'

const BROWSER_SESSION_PROFILE_ID_RE =
  /^[\da-f-]{8}-[\da-f-]{4}-[\da-f-]{4}-[\da-f-]{4}-[\da-f-]{12}$/

// Persisted metadata must not add arbitrary partitions to the webview allowlist.
export function isValidPersistedBrowserSessionProfile(
  profile: unknown,
  activeDolphinProfileId: string
): profile is BrowserSessionProfile {
  if (!profile || typeof profile !== 'object') {
    return false
  }
  const candidate = profile as Partial<BrowserSessionProfile>
  return (
    candidate.id !== 'default' &&
    candidate.scope !== 'default' &&
    typeof candidate.id === 'string' &&
    typeof candidate.partition === 'string' &&
    typeof candidate.label === 'string' &&
    isProfileOwnedSessionPartition(candidate.id, candidate.partition, activeDolphinProfileId)
  )
}

function isProfileOwnedSessionPartition(
  profileId: string,
  partition: string,
  activeDolphinProfileId: string
): boolean {
  return (
    BROWSER_SESSION_PROFILE_ID_RE.test(profileId) &&
    partition === getDolphinProfileBrowserSessionPartition(activeDolphinProfileId, profileId)
  )
}
