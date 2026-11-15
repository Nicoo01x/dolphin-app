import type { DolphinCloudAuthConfig } from '../cloud-auth/profile-cloud-auth-config'
import { DolphinCloudRequestError, selectDolphinCloudOrg } from '../cloud-auth/profile-cloud-client'
import { forceRefreshDolphinCloudSession } from '../cloud-session/profile-cloud-session-refresh'
import type { ActiveDolphinProfileState } from '../profile-index-store'
import type { DolphinProfileListState } from '../../../shared/dolphin-profiles'
import {
  beginCloudSessionRelink,
  commitCloudSessionRelink,
  readCloudSession
} from '../cloud-session/profile-cloud-session-owner'

export async function selectCloudOrg(input: {
  config: DolphinCloudAuthConfig
  active: ActiveDolphinProfileState
  userDataPath: string
  orgId: string
}): Promise<DolphinProfileListState | null> {
  const profileId = input.active.profile.id
  const cloud = input.active.profile.cloud
  const stored = readCloudSession(profileId, input.userDataPath)
  if (!cloud || stored.status !== 'found') {
    return null
  }
  const ticket = beginCloudSessionRelink(profileId, input.userDataPath)
  let selected
  try {
    selected = await selectDolphinCloudOrg(input.config, stored.session, input.orgId)
  } catch (error) {
    if (!(error instanceof DolphinCloudRequestError) || error.statusCode !== 401) {
      throw error
    }
    const refreshed = await forceRefreshDolphinCloudSession(
      input.config,
      input.active,
      input.userDataPath,
      stored.session
    )
    if (refreshed.status !== 'found') {
      throw error
    }
    selected = await selectDolphinCloudOrg(input.config, refreshed.session, input.orgId)
  }
  if (
    selected.cloud.userId !== cloud.userId ||
    selected.cloud.cloudProfileId !== cloud.cloudProfileId ||
    selected.cloud.activeOrgId !== input.orgId
  ) {
    throw new Error('dolphin_cloud_org_selection_identity_mismatch')
  }
  const list = commitCloudSessionRelink(profileId, input.userDataPath, ticket, selected)
  if (!list) {
    throw new Error('stale_cloud_session_mutation')
  }
  return list
}
