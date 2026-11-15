import type {
  ConnectCurrentDolphinProfileResult,
  CreateCloudLinkedDolphinProfileArgs,
  CreateCloudLinkedDolphinProfileResult,
  DolphinProfileAuthStatus,
  SelectDolphinProfileOrgResult,
  SignOutCurrentDolphinProfileResult
} from '../../../shared/dolphin-profiles'
import { ensureActiveDolphinProfile } from '../profile-index-store'
import { getDolphinCloudAuthConfig, isDolphinCloudDevAuthEnabled } from './profile-cloud-auth-config'
import {
  invalidateCloudSessionChanges,
  readCloudSession,
  signInCloudSession,
  signOutCloudSession
} from '../cloud-session/profile-cloud-session-owner'
import {
  createDolphinCloudProfile,
  exchangeDolphinCloudAuthCode,
  revokeDolphinCloudSession
} from './profile-cloud-client'
import { beginDolphinCloudPkceFlow } from './profile-cloud-pkce'
import {
  createCloudLinkedDolphinProfileRecord,
  linkDolphinProfileToCloud,
  unlinkDolphinProfileFromCloud
} from './profile-cloud-index'
import { runWithFreshDolphinCloudSession } from '../cloud-session/profile-cloud-session-refresh'
import {
  connectDevDolphinCloudProfile,
  createDevCloudLinkedDolphinProfile,
  selectDevDolphinCloudOrg
} from './profile-cloud-dev-service'
import { getDolphinProfileAuthStatusFromProfile } from './profile-cloud-auth-status'
import { selectCloudOrg } from '../cloud-org/profile-cloud-org-selection'
import {
  endDolphinCloudSignInProgress,
  setDolphinCloudSignInLink,
  startDolphinCloudSignInProgress
} from './profile-cloud-sign-in-progress'
import { clearRelayRegionPreferenceCache } from '../../runtime/mobile-cloud-relay/relay-region-preference'

import './profile-cloud-capability-refresh'

let nextCloudConnectAttempt = 0
let linkedCloudConnectAttempt = 0

function invalidateOutstandingCloudConnectAttempts(): void {
  nextCloudConnectAttempt += 1
  linkedCloudConnectAttempt = nextCloudConnectAttempt
  endDolphinCloudSignInProgress()
}

export function getCurrentDolphinProfileAuthStatus(userDataPath: string): DolphinProfileAuthStatus {
  return getDolphinProfileAuthStatusFromProfile(
    ensureActiveDolphinProfile(userDataPath),
    userDataPath
  )
}

export async function connectCurrentDolphinProfile(
  userDataPath: string
): Promise<ConnectCurrentDolphinProfileResult> {
  const active = ensureActiveDolphinProfile(userDataPath)
  if (isDolphinCloudDevAuthEnabled()) {
    const list = connectDevDolphinCloudProfile(active, userDataPath)
    return {
      status: 'connected',
      auth: getCurrentDolphinProfileAuthStatus(userDataPath),
      activeProfileId: list.activeProfileId,
      profiles: list.profiles
    }
  }

  const configState = getDolphinCloudAuthConfig()
  if (!configState.configured) {
    return {
      status: 'unconfigured',
      auth: getDolphinProfileAuthStatusFromProfile(active, userDataPath)
    }
  }

  const attempt = ++nextCloudConnectAttempt
  const browserWait = new AbortController()
  startDolphinCloudSignInProgress(attempt, () => browserWait.abort())
  try {
    const code = await beginDolphinCloudPkceFlow(configState.config, active.profile.id, {
      signal: browserWait.signal,
      onAuthorizeUrl: (link) => setDolphinCloudSignInLink(attempt, link)
    })
    // The callback listener has closed, so its browser link is dead.
    setDolphinCloudSignInLink(attempt, null)
    if (attempt < linkedCloudConnectAttempt) {
      return {
        status: 'cancelled',
        auth: getCurrentDolphinProfileAuthStatus(userDataPath)
      }
    }
    const exchange = await exchangeDolphinCloudAuthCode(configState.config, {
      ...code,
      localProfileId: active.profile.id
    })
    if (attempt < linkedCloudConnectAttempt) {
      return {
        status: 'cancelled',
        auth: getCurrentDolphinProfileAuthStatus(userDataPath)
      }
    }
    signInCloudSession(active.profile.id, userDataPath, exchange)
    const list = linkDolphinProfileToCloud(active.profile.id, exchange.cloud, userDataPath)
    linkedCloudConnectAttempt = attempt
    return {
      status: 'connected',
      auth: getCurrentDolphinProfileAuthStatus(userDataPath),
      activeProfileId: list.activeProfileId,
      profiles: list.profiles
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message === 'dolphin_cloud_auth_timeout' && attempt === nextCloudConnectAttempt) {
      return {
        status: 'timed-out',
        auth: getCurrentDolphinProfileAuthStatus(userDataPath)
      }
    }
    if (
      message === 'dolphin_cloud_auth_timeout' ||
      message === 'dolphin_cloud_auth_denied' ||
      message === 'dolphin_cloud_auth_cancelled'
    ) {
      return {
        status: 'cancelled',
        auth: getCurrentDolphinProfileAuthStatus(userDataPath)
      }
    }
    return {
      status: 'failed',
      auth: getCurrentDolphinProfileAuthStatus(userDataPath),
      error: message
    }
  } finally {
    endDolphinCloudSignInProgress(attempt)
  }
}

export async function signOutCurrentDolphinProfile(
  userDataPath: string
): Promise<SignOutCurrentDolphinProfileResult> {
  // Pending browser sign-ins must not relink after explicit sign-out.
  invalidateOutstandingCloudConnectAttempts()
  const signOutEpoch = linkedCloudConnectAttempt
  const active = ensureActiveDolphinProfile(userDataPath)
  const configState = getDolphinCloudAuthConfig()
  const session = readCloudSession(active.profile.id, userDataPath)
  // Fence before network I/O so in-flight refreshes cannot save after sign-out.
  invalidateCloudSessionChanges(active.profile.id, userDataPath)
  if (!isDolphinCloudDevAuthEnabled() && configState.configured && session.status === 'found') {
    await revokeDolphinCloudSession(configState.config, session.session).catch(() => undefined)
  }
  if (linkedCloudConnectAttempt > signOutEpoch) {
    const current = ensureActiveDolphinProfile(userDataPath)
    return {
      status: 'signed-out',
      auth: getCurrentDolphinProfileAuthStatus(userDataPath),
      activeProfileId: current.index.activeProfileId,
      profiles: current.index.profiles
    }
  }
  signOutCloudSession(active.profile.id, userDataPath)
  const list = unlinkDolphinProfileFromCloud(active.profile.id, userDataPath)
  try {
    clearRelayRegionPreferenceCache(userDataPath)
  } catch {
    // A leftover latency cache must not fail the sign-out itself.
  }
  return {
    status: 'signed-out',
    auth: getCurrentDolphinProfileAuthStatus(userDataPath),
    activeProfileId: list.activeProfileId,
    profiles: list.profiles
  }
}

export async function createCloudLinkedDolphinProfile(
  userDataPath: string,
  args: CreateCloudLinkedDolphinProfileArgs
): Promise<CreateCloudLinkedDolphinProfileResult> {
  const active = ensureActiveDolphinProfile(userDataPath)
  if (isDolphinCloudDevAuthEnabled()) {
    const result = createDevCloudLinkedDolphinProfile(active, userDataPath, args)
    if (result.status !== 'created') {
      return {
        status: 'reconnect-required',
        auth: getDolphinProfileAuthStatusFromProfile(active, userDataPath)
      }
    }
    return {
      status: 'created',
      auth: getCurrentDolphinProfileAuthStatus(userDataPath),
      activeProfileId: result.list.activeProfileId,
      profiles: result.list.profiles,
      profile: result.list.profile
    }
  }

  const configState = getDolphinCloudAuthConfig()
  if (!configState.configured) {
    return {
      status: 'unconfigured',
      auth: getDolphinProfileAuthStatusFromProfile(active, userDataPath)
    }
  }
  try {
    const operation = await runWithFreshDolphinCloudSession(
      configState.config,
      active,
      userDataPath,
      (session) => createDolphinCloudProfile(configState.config, session, args)
    )
    if (operation.status !== 'ok') {
      return {
        status: 'reconnect-required',
        auth: getDolphinProfileAuthStatusFromProfile(active, userDataPath)
      }
    }
    const created = operation.value
    const list = createCloudLinkedDolphinProfileRecord(
      created.cloud,
      { name: args.name },
      userDataPath
    )
    signInCloudSession(list.profile.id, userDataPath, created)
    return {
      status: 'created',
      auth: getCurrentDolphinProfileAuthStatus(userDataPath),
      activeProfileId: list.activeProfileId,
      profiles: list.profiles,
      profile: list.profile
    }
  } catch (error) {
    return {
      status: 'failed',
      auth: getCurrentDolphinProfileAuthStatus(userDataPath),
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

export async function selectCurrentDolphinProfileOrg(
  userDataPath: string,
  orgId: string
): Promise<SelectDolphinProfileOrgResult> {
  const active = ensureActiveDolphinProfile(userDataPath)
  if (isDolphinCloudDevAuthEnabled()) {
    const result = selectDevDolphinCloudOrg(active, userDataPath, orgId)
    if (result.status !== 'updated') {
      return {
        status: 'reconnect-required',
        auth: getDolphinProfileAuthStatusFromProfile(active, userDataPath)
      }
    }
    return {
      status: 'selected',
      auth: getCurrentDolphinProfileAuthStatus(userDataPath),
      activeProfileId: result.list.activeProfileId,
      profiles: result.list.profiles
    }
  }

  const configState = getDolphinCloudAuthConfig()
  if (!configState.configured) {
    return {
      status: 'unconfigured',
      auth: getDolphinProfileAuthStatusFromProfile(active, userDataPath)
    }
  }
  try {
    const list = await selectCloudOrg({
      config: configState.config,
      active,
      userDataPath,
      orgId
    })
    if (!list) {
      return {
        status: 'reconnect-required',
        auth: getDolphinProfileAuthStatusFromProfile(active, userDataPath)
      }
    }
    return {
      status: 'selected',
      auth: getCurrentDolphinProfileAuthStatus(userDataPath),
      activeProfileId: list.activeProfileId,
      profiles: list.profiles
    }
  } catch (error) {
    return {
      status: 'failed',
      auth: getCurrentDolphinProfileAuthStatus(userDataPath),
      error: error instanceof Error ? error.message : String(error)
    }
  }
}
