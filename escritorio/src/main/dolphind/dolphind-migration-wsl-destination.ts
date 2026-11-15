// In-place WSL moves require the desktop-launched dolphind in the source distro to own the unchanged paths.
import type { DolphindMigrationManifestSource } from '../../shared/dolphind-migration/dolphind-migration-manifest'
import { isDolphindMigrationLocalWslSource } from '../../shared/dolphind-migration/dolphind-migration-source-kind'
import { isWslHostDolphindProcess } from '../ipc/wsl-guest-windows-drive-path'
import { DOLPHIND_WSL_DISTRO_GUID_ENV } from '../../shared/dolphind-server-launch-env'

export const DOLPHIND_MIGRATION_SOURCE_NOT_THIS_HOST = 'dolphind_migration_source_not_this_host'

export { DOLPHIND_WSL_DISTRO_GUID_ENV }

export function servesLocalWslMigrationSource(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): boolean {
  return isWslHostDolphindProcess(env, platform)
}

// E2E hosts stand in for a WSL host's dolphind; a real one is identified by isWslHostDolphindProcess.
export const DOLPHIN_E2E_WSL_MOVE_DESTINATION_ENV = 'DOLPHIN_E2E_WSL_MOVE_DESTINATION'

/**
 * Whether this host is a WSL move's destination: it installs moved panes' terminal history and
 * serves their stored scrollback. Every other host keeps that wire surface off.
 */
export function servesWslMovedPaneHistory(env: NodeJS.ProcessEnv = process.env): boolean {
  return isWslHostDolphindProcess(env) || env[DOLPHIN_E2E_WSL_MOVE_DESTINATION_ENV] === '1'
}

export function assertDolphindMigrationSourceServedHere(
  source: DolphindMigrationManifestSource,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): void {
  if (!isDolphindMigrationLocalWslSource(source)) {
    return
  }
  // WSL distro names and their UNC forms are case-insensitive.
  const distro = env.WSL_DISTRO_NAME?.trim().toLowerCase()
  if (!servesLocalWslMigrationSource(env, platform) || distro !== source.distro.toLowerCase()) {
    throw new Error(DOLPHIND_MIGRATION_SOURCE_NOT_THIS_HOST)
  }
  // Re-registering a distro reuses its name, not its files; require its registry ID when supplied.
  const guid = env[DOLPHIND_WSL_DISTRO_GUID_ENV]?.trim().toLowerCase()
  if (source.distroGuid !== undefined && guid !== source.distroGuid.toLowerCase()) {
    throw new Error(DOLPHIND_MIGRATION_SOURCE_NOT_THIS_HOST)
  }
}
