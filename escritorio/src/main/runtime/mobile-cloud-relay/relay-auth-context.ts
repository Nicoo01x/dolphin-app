import type { DolphinCloudAuthConfig } from '../../dolphin-profiles/cloud-auth/profile-cloud-auth-config'
import { ensureActiveDolphinProfile } from '../../dolphin-profiles/profile-index-store'
import { readFreshDolphinCloudSession } from '../../dolphin-profiles/cloud-session/profile-cloud-session-refresh'
import type { RelayAuthContext } from './relay-auth-identity'

export async function readRelayAuthContext(
  authConfig: DolphinCloudAuthConfig,
  userDataPath: string
): Promise<RelayAuthContext | null> {
  const active = ensureActiveDolphinProfile(userDataPath)
  if (!active.profile.cloud) {
    return null
  }
  const session = await readFreshDolphinCloudSession(authConfig, active, userDataPath)
  if (session.status !== 'found') {
    return null
  }
  // Refresh/org selection can change linkage; derive identity from post-refresh profile state.
  const refreshed = ensureActiveDolphinProfile(userDataPath)
  const cloud = refreshed.profile.cloud
  if (!cloud || refreshed.profile.id !== active.profile.id) {
    return null
  }
  return {
    identity: {
      userId: cloud.userId,
      profileId: cloud.cloudProfileId,
      organizationId: cloud.activeOrgId ?? ''
    },
    accessToken: session.session.accessToken,
    relayEntitled: session.session.capabilities.flags['relay.use'] === true
  }
}
