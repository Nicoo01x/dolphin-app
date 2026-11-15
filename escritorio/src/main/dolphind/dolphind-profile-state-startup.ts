import { createProfileStateStoreForStartup } from '../persistence/profile-state/startup/profile-state-startup-authority'
import type { ProfileStateStoreFactoryResult } from '../persistence/profile-state/startup/profile-state-store-factory'
import { ensureActiveDolphinProfile } from '../dolphin-profiles/profile-index-store'
import { initDolphinProfilePaths } from '../dolphin-profiles/profile-storage-paths'
import { initSshHostKeyStoreFile } from '../ssh/host-keys/ssh-host-key-store'
import { initDolphindHeldFenceTokenFile } from '../managed-server/activation/dolphind-held-fence-tokens'
import { emitDolphindProfileStateAuthoritySelected } from './dolphind-profile-state-telemetry'
import { isWslHostDolphindProcess } from '../ipc/wsl-guest-windows-drive-path'

/** WSL hosts are held to a per-distro memory budget; the idle writer thread costs ~13-15 MB. */
export const WSL_HOST_PROFILE_WRITER_IDLE_STOP_MS = 60_000

/** SSH hosts and the desktop keep their writer thread running. */
export function dolphindProfileWriterIdleStopMs(
  isWslHost: () => boolean = isWslHostDolphindProcess
): number | undefined {
  return isWslHost() ? WSL_HOST_PROFILE_WRITER_IDLE_STOP_MS : undefined
}

type DolphindProfileStateStartup = {
  store: ProfileStateStoreFactoryResult['store']
  authority: {
    backend: ProfileStateStoreFactoryResult['backend']
    classification: ProfileStateStoreFactoryResult['classification']
    authority_mode: 'sqlite-established'
    runtime: 'dolphind'
    migrated: boolean
  }
}

export async function createDolphindProfileStateStartup(
  userDataPath: string
): Promise<DolphindProfileStateStartup> {
  initDolphinProfilePaths()
  const profile = ensureActiveDolphinProfile(userDataPath)
  // Real persistence avoids falsely empty RPCs; headless authority keeps automations owned by this host.
  const result = await createProfileStateStoreForStartup({
    userDataPath,
    dataFile: profile.dataFile,
    databaseFile: profile.stateDatabaseFile,
    profileId: profile.profile.id,
    runtime: 'dolphind',
    storageAuthority: 'runtime',
    writerIdleStopMs: dolphindProfileWriterIdleStopMs()
  })
  const authority = {
    backend: result.backend,
    classification: result.classification,
    authority_mode: 'sqlite-established' as const,
    runtime: 'dolphind' as const,
    migrated: result.migrated
  }
  try {
    initSshHostKeyStoreFile(profile.dataFile)
    initDolphindHeldFenceTokenFile(profile.dataFile)
    emitDolphindProfileStateAuthoritySelected(authority)
    return { store: result.store, authority }
  } catch (error) {
    try {
      await result.store.freezeWritesAsync()
    } catch (closeError) {
      console.error(
        '[persistence] Failed to close profile persistence after startup failure:',
        closeError
      )
    }
    throw error
  }
}
