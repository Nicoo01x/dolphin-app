import { existsSync } from 'node:fs'
import { join } from 'node:path'

export const DOLPHIN_REPOSITORY_CONFIG_FILENAME = 'dolphin.yaml'
export const LEGACY_DOLPHIN_REPOSITORY_CONFIG_FILENAME = 'orca.yaml'

export type RepositoryConfigFile = {
  filename:
    | typeof DOLPHIN_REPOSITORY_CONFIG_FILENAME
    | typeof LEGACY_DOLPHIN_REPOSITORY_CONFIG_FILENAME
  path: string
}

/** Prefer Dolphin's config; only use Dolphin's file when Dolphin's is absent. */
export function findRepositoryConfigFile(repoPath: string): RepositoryConfigFile | null {
  const dolphinPath = join(repoPath, DOLPHIN_REPOSITORY_CONFIG_FILENAME)
  if (existsSync(dolphinPath)) {
    return { filename: DOLPHIN_REPOSITORY_CONFIG_FILENAME, path: dolphinPath }
  }

  const rutaHeredada = join(repoPath, LEGACY_DOLPHIN_REPOSITORY_CONFIG_FILENAME)
  return existsSync(rutaHeredada)
    ? { filename: LEGACY_DOLPHIN_REPOSITORY_CONFIG_FILENAME, path: rutaHeredada }
    : null
}
