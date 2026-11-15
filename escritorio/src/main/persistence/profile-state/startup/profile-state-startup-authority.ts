import type { AutomationStorageAuthority } from '../../scheduling-automations/automation-owner-projection'
import '../database/profile-state-database'
import { isSqliteAvailable as isProfileStateSqliteAvailable } from '../../../sqlite/sync-database'
import type {
  ProfileStateStoreFactoryOptions,
  ProfileStateStoreFactoryResult
} from './profile-state-store-factory'
import { createLiveProfileStateStore } from './profile-state-live-store-factory'
import { debeSembrarCarpetaPersonal } from './dolphin-siembra-carpeta-personal'

export type ProfileStateStartupRuntime = 'desktop' | 'dolphind'

export type ProfileStateStartupAuthorityOptions = Omit<
  ProfileStateStoreFactoryOptions,
  'storageAuthority'
> & {
  runtime: ProfileStateStartupRuntime
  storageAuthority: AutomationStorageAuthority
  onPersistenceFailure?: (error: Error) => void
  onPersistenceSaveDelayChanged?: (delayed: boolean) => void
  /** See ProfileStateWorkerAuthorityOptions.writerIdleStopMs. */
  writerIdleStopMs?: number
}

export class ProfileStateStartupAuthorityError extends Error {
  readonly code = 'dolphind-sqlite-authority-unsupported' as const

  constructor() {
    super(
      'dolphind requires SQLite database and backup support. Launch it through its pinned Node runtime.'
    )
    this.name = 'ProfileStateStartupAuthorityError'
  }
}

/** Desktop and dolphind share the validated authority boundary. */
export async function createProfileStateStoreForStartup(
  options: ProfileStateStartupAuthorityOptions
): Promise<ProfileStateStoreFactoryResult> {
  if (options.runtime === 'dolphind' && !isProfileStateSqliteAvailable()) {
    throw new ProfileStateStartupAuthorityError()
  }
  // Dolphin: un perfil nuevo no siembra la carpeta personal (ver DOLPHIN_SIEMBRA_CARPETA_PERSONAL).
  const initializeHomeWorkspace = debeSembrarCarpetaPersonal(options.initializeHomeWorkspace)
  return createLiveProfileStateStore(
    { ...options, initializeHomeWorkspace },
    {
      onSaveDelayChanged: options.onPersistenceSaveDelayChanged,
      writerIdleStopMs: options.writerIdleStopMs,
      onFailure:
        options.onPersistenceFailure ??
        ((error) =>
          console.error(
            '[persistence] Saving has stopped. Restart Dolphin before continuing.',
            error
          ))
    }
  )
}
