import { ipcMain, type WebContents } from 'electron'
import type { Store } from '../../persistence/loading-store/store'
import { relaunchApp, type AppRelaunchReason } from '../../startup/quit/app-relaunch'
import { quitProcess } from '../../startup/process-quit-request'
import type {
  CreateLocalDolphinProfileArgs,
  CreateLocalDolphinProfileResult,
  CreateCloudLinkedDolphinProfileArgs,
  CreateCloudLinkedDolphinProfileResult,
  FindDolphinProfileProjectsByPathArgs,
  FindDolphinProfileProjectsByPathResult,
  DolphinProfileListResult,
  RefreshCurrentDolphinProfileAuthResult,
  SwitchDolphinProfileArgs,
  SwitchDolphinProfileResult,
  TransferDolphinProfileProjectArgs,
  TransferDolphinProfileProjectResult,
  ConnectCurrentDolphinProfileResult,
  DolphinProfileAuthStatus,
  DolphinCloudSignInProgress,
  SelectDolphinProfileOrgArgs,
  SelectDolphinProfileOrgResult,
  SignOutCurrentDolphinProfileResult
} from '../../../shared/dolphin-profiles'
import {
  createLocalDolphinProfile,
  getDolphinProfileListState,
  setActiveDolphinProfile
} from '../../dolphin-profiles/profile-index-store'
import { initializeNewDolphinProfileState } from '../../dolphin-profiles/storage/new-profile-state'
import { getProfileUserDataPath } from '../../dolphin-profiles/profile-storage-paths'
import { isMultiProfileUiEnabled } from '../../dolphin-profiles/profile-ui-scope'
import { transferDolphinProfileProject } from '../../dolphin-profiles/project-transfer/profile-project-transfer'
import { transferActiveProfileProject } from '../../dolphin-profiles/project-transfer/profile-active-transfer'
import { findDolphinProfileProjectsByPath } from '../../dolphin-profiles/catalog/profile-project-presence'
import {
  flushActiveProfileBeforeFileMutation,
  flushActiveProfileBeforeRelaunch
} from '../../dolphin-profiles/storage/profile-persistence-deadline'
import { normalizeExecutionHostId } from '../../../shared/execution-host'
import {
  createCloudLinkedDolphinProfile,
  connectCurrentDolphinProfile,
  getCurrentDolphinProfileAuthStatus,
  selectCurrentDolphinProfileOrg,
  signOutCurrentDolphinProfile
} from '../../dolphin-profiles/cloud-auth/profile-cloud-service'
import { refreshCurrentDolphinProfileAuth } from '../../dolphin-profiles/cloud-auth/profile-cloud-capability-refresh'
import { registerDolphinProfileOrgMemberHandlers } from './dolphin-profile-org-members-handlers'
import { onDolphinCloudSessionInvalidated } from '../../dolphin-profiles/cloud-session/profile-cloud-session-invalidation'
import {
  broadcastDolphinProfileAuthStatusChanged,
  broadcastDolphinProfileSignInProgressChanged
} from './dolphin-profile-auth-status-broadcast'
import {
  cancelDolphinCloudSignIn,
  getDolphinCloudSignInProgress,
  onDolphinCloudSignInProgressChanged
} from '../../dolphin-profiles/cloud-auth/profile-cloud-sign-in-progress'
import { profileIdFromArgs } from './dolphin-profile-id-arg'
import { transferProjectArgsFromUnknown } from './dolphin-profile-project-transfer-args'

type RegisterDolphinProfileHandlersOptions = {
  onBeforeRelaunch?: () => void | Promise<void>
  onAuthMutation?: () => void
  onBeforeSignOut?: () => void
  onAfterSignOut?: () => void
}

function findProjectsByPathArgsFromUnknown(args: unknown): FindDolphinProfileProjectsByPathArgs {
  if (!args || typeof args !== 'object') {
    throw new Error('invalid_dolphin_profile_project_path')
  }
  const candidate = args as FindDolphinProfileProjectsByPathArgs
  const path = typeof candidate.path === 'string' ? candidate.path.trim() : ''
  if (!path) {
    throw new Error('invalid_dolphin_profile_project_path')
  }
  let executionHostId: FindDolphinProfileProjectsByPathArgs['executionHostId'] = null
  if (candidate.executionHostId !== null && candidate.executionHostId !== undefined) {
    if (typeof candidate.executionHostId !== 'string') {
      throw new Error('invalid_dolphin_profile_project_path')
    }
    executionHostId = normalizeExecutionHostId(candidate.executionHostId)
    if (!executionHostId) {
      throw new Error('invalid_dolphin_profile_project_path')
    }
  }
  return {
    path,
    connectionId:
      typeof candidate.connectionId === 'string' ? candidate.connectionId.trim() || null : null,
    executionHostId,
    excludeProfileId:
      typeof candidate.excludeProfileId === 'string'
        ? candidate.excludeProfileId.trim() || null
        : null
  }
}

function orgIdFromUnknown(args: unknown): string {
  if (!args || typeof args !== 'object') {
    throw new Error('invalid_dolphin_profile_org_selection')
  }
  const orgId = (args as SelectDolphinProfileOrgArgs).orgId?.trim()
  if (!orgId) {
    throw new Error('invalid_dolphin_profile_org_selection')
  }
  return orgId
}

function createCloudLinkedProfileArgsFromUnknown(args: unknown): CreateCloudLinkedDolphinProfileArgs {
  if (!args || typeof args !== 'object') {
    return {}
  }
  const candidate = args as CreateCloudLinkedDolphinProfileArgs
  const orgId = typeof candidate.orgId === 'string' ? candidate.orgId.trim() : undefined
  const name = typeof candidate.name === 'string' ? candidate.name.trim() : undefined
  return {
    ...(orgId ? { orgId } : {}),
    ...(name ? { name } : {})
  }
}

async function runBeforeProfileRelaunch(
  onBeforeRelaunch?: () => void | Promise<void>
): Promise<void> {
  try {
    await onBeforeRelaunch?.()
  } catch (error) {
    console.warn(
      '[dolphin-profiles] Pre-relaunch cleanup failed; continuing profile switch:',
      error instanceof Error ? error.name : typeof error
    )
  }
}

type ProfileRelaunchReason = Extract<AppRelaunchReason, `profile-${string}`>

function scheduleProfileRelaunch(reason: ProfileRelaunchReason, sender: WebContents): void {
  if (!sender.isDestroyed()) {
    sender.send('app:restart-committed')
  }
  setTimeout(() => {
    relaunchApp(reason)
    // Normal quit preserves renderer scrollback, PTY teardown, stats flush and final daemon checkpoints.
    quitProcess()
  }, 150)
}

export function registerDolphinProfileHandlers(
  store: Store,
  options: RegisterDolphinProfileHandlersOptions = {}
): void {
  ipcMain.handle('dolphinProfiles:list', (): DolphinProfileListResult => ({
    ...getDolphinProfileListState(),
    multiProfileUi: isMultiProfileUiEnabled()
  }))

  ipcMain.handle('dolphinProfiles:authStatus', (): DolphinProfileAuthStatus =>
    getCurrentDolphinProfileAuthStatus(getProfileUserDataPath())
  )

  // Push background invalidation; re-entering onAuthMutation would loop into the relay coordinator that just failed.
  onDolphinCloudSessionInvalidated(broadcastDolphinProfileAuthStatusChanged)
  onDolphinCloudSignInProgressChanged(broadcastDolphinProfileSignInProgressChanged)

  ipcMain.handle(
    'dolphinProfiles:createLocal',
    (_event, args?: CreateLocalDolphinProfileArgs): CreateLocalDolphinProfileResult => {
      const result = createLocalDolphinProfile(args)
      initializeNewDolphinProfileState(result.profile.id, store.getSettings().telemetry)
      return result
    }
  )

  ipcMain.handle(
    'dolphinProfiles:switch',
    async (event, args: SwitchDolphinProfileArgs): Promise<SwitchDolphinProfileResult> => {
      const profileId = profileIdFromArgs(args)
      const current = getDolphinProfileListState()
      if (profileId === current.activeProfileId) {
        return { status: 'already-active' }
      }

      // Flush the source profile before switching the startup index; keep its writer alive through relaunch cleanup.
      await flushActiveProfileBeforeRelaunch(store)
      setActiveDolphinProfile(profileId)
      await runBeforeProfileRelaunch(options.onBeforeRelaunch)

      scheduleProfileRelaunch('profile-switch', event.sender)

      return { status: 'relaunching' }
    }
  )

  ipcMain.handle(
    'dolphinProfiles:transferProject',
    async (
      event,
      rawArgs: TransferDolphinProfileProjectArgs
    ): Promise<TransferDolphinProfileProjectResult> => {
      const args = transferProjectArgsFromUnknown(rawArgs)
      const current = getDolphinProfileListState()
      if (args.targetProfileId === current.activeProfileId) {
        throw new Error('active_target_dolphin_profile_transfer_requires_relaunch')
      }
      if (args.mode === 'move' && args.sourceProfileId === current.activeProfileId) {
        // Finish transfer before relaunch side effects so validation failure cannot strand the app quitting.
        const result = await transferActiveProfileProject(
          args,
          getProfileUserDataPath(),
          store,
          async () => {
            await runBeforeProfileRelaunch(options.onBeforeRelaunch)
            scheduleProfileRelaunch('profile-transfer', event.sender)
          }
        )
        if (result.status === 'transferred') {
          await runBeforeProfileRelaunch(options.onBeforeRelaunch)
          try {
            setActiveDolphinProfile(args.targetProfileId)
          } finally {
            // The source has already changed and its writer cannot resume.
            scheduleProfileRelaunch('profile-transfer', event.sender)
          }
          return { ...result, willRelaunch: true }
        }
        return result
      }
      if (args.sourceProfileId !== current.activeProfileId) {
        await store.flushPendingOrThrowAsync({ drainToStableGeneration: false })
        return transferDolphinProfileProject(args, getProfileUserDataPath())
      }
      const maintenance = await flushActiveProfileBeforeFileMutation(store)
      try {
        return transferDolphinProfileProject(args, getProfileUserDataPath())
      } finally {
        await maintenance.resume()
      }
    }
  )

  ipcMain.handle(
    'dolphinProfiles:findProjectProfiles',
    (_event, rawArgs: FindDolphinProfileProjectsByPathArgs): FindDolphinProfileProjectsByPathResult =>
      findDolphinProfileProjectsByPath(
        findProjectsByPathArgsFromUnknown(rawArgs),
        getProfileUserDataPath()
      )
  )

  ipcMain.handle(
    'dolphinProfiles:connectCurrent',
    async (): Promise<ConnectCurrentDolphinProfileResult> => {
      const result = await connectCurrentDolphinProfile(getProfileUserDataPath())
      if (result.status === 'connected') {
        options.onAuthMutation?.()
      }
      return result
    }
  )

  ipcMain.handle('dolphinProfiles:signInProgress', (): DolphinCloudSignInProgress | null =>
    getDolphinCloudSignInProgress()
  )

  ipcMain.handle('dolphinProfiles:cancelSignIn', (): void => cancelDolphinCloudSignIn())

  ipcMain.handle(
    'dolphinProfiles:createCloudLinked',
    async (
      _event,
      rawArgs?: CreateCloudLinkedDolphinProfileArgs
    ): Promise<CreateCloudLinkedDolphinProfileResult> => {
      const result = await createCloudLinkedDolphinProfile(
        getProfileUserDataPath(),
        createCloudLinkedProfileArgsFromUnknown(rawArgs)
      )
      if (result.status === 'created') {
        initializeNewDolphinProfileState(result.profile.id, store.getSettings().telemetry)
        options.onAuthMutation?.()
      }
      return result
    }
  )

  ipcMain.handle(
    'dolphinProfiles:refreshAuth',
    async (): Promise<RefreshCurrentDolphinProfileAuthResult> => {
      const result = await refreshCurrentDolphinProfileAuth(getProfileUserDataPath())
      if (result.status === 'refreshed') {
        options.onAuthMutation?.()
      }
      return result
    }
  )

  ipcMain.handle(
    'dolphinProfiles:signOutCurrent',
    async (): Promise<SignOutCurrentDolphinProfileResult> => {
      options.onBeforeSignOut?.()
      return signOutCurrentDolphinProfile(getProfileUserDataPath()).finally(options.onAfterSignOut)
    }
  )

  ipcMain.handle(
    'dolphinProfiles:selectOrg',
    async (_event, rawArgs: SelectDolphinProfileOrgArgs): Promise<SelectDolphinProfileOrgResult> => {
      const result = await selectCurrentDolphinProfileOrg(
        getProfileUserDataPath(),
        orgIdFromUnknown(rawArgs)
      )
      if (result.status === 'selected') {
        options.onAuthMutation?.()
      }
      return result
    }
  )

  registerDolphinProfileOrgMemberHandlers()
}
