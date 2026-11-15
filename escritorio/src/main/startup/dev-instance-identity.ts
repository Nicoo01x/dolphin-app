import { leerEnvDolphin } from '../../shared/dolphin-env'
import { createHash } from 'node:crypto'
import path from 'node:path'
import type { AppIdentity } from '../../shared/app-identity'

/**
 * El nombre con el que la app se presenta al sistema: `app.setName`, y con él `%APPDATA%\<nombre>`
 * y el ítem «<nombre> Safe Storage» del Keychain.
 *
 * Why «Dolphin Code» y no «Dolphin»: el perfil de producción caía en `%APPDATA%\Dolphin`, que es el
 * del Dolphin viejo que Nico tiene instalado, y lo habría tomado como propio. El mismo nombre
 * chocaba además con el juego «Dolphin» en la detección de Discord. Va igual que el `productName`
 * del empaquetado (config/electron-builder.config.cjs), que es de donde sale la carpeta instalada.
 */
const BASE_APP_NAME = 'Dolphin Code'
const BASE_APP_USER_MODEL_ID = 'io.github.nicoo01x.dolphin'
const MAX_LABEL_LENGTH = 80

export type DevInstanceIdentity = AppIdentity & {
  appUserModelId: string
  // Keep the macOS safeStorage Keychain name stable across dev branches and distinct from production.
  appName: string
}

/** Electron fixes the Keychain service before ready. Rename dev only; packaged forks must retain their CFBundleName-derived encryption keys. */
export function shouldApplyPreReadyAppName(identity: Pick<AppIdentity, 'isDev'>): boolean {
  return identity.isDev
}

function cleanEnvValue(value: string | undefined): string | null {
  const trimmed = value?.replace(/\s+/g, ' ').trim()
  if (!trimmed) {
    return null
  }
  return trimmed.length > MAX_LABEL_LENGTH
    ? `${trimmed.slice(0, MAX_LABEL_LENGTH - 3)}...`
    : trimmed
}

function lastPathSegment(value: string): string {
  const normalized = value.replace(/\\/g, '/')
  return normalized.split('/').findLast(Boolean) ?? value
}

function formatLabel(branch: string | null, worktreeName: string | null): string | null {
  if (branch && worktreeName) {
    if (branch === worktreeName || lastPathSegment(branch) === worktreeName) {
      return worktreeName
    }
    return `${worktreeName} @ ${branch}`
  }
  return branch ?? worktreeName
}

function createDevAppUserModelId(identityKey: string | null): string {
  if (!identityKey) {
    return BASE_APP_USER_MODEL_ID
  }
  const hash = createHash('sha1').update(identityKey).digest('hex').slice(0, 10)
  return `${BASE_APP_USER_MODEL_ID}.dev.${hash}`
}

export function getDevInstanceIdentity(
  isDev: boolean,
  env: NodeJS.ProcessEnv = process.env
): DevInstanceIdentity {
  if (!isDev) {
    return {
      name: BASE_APP_NAME,
      appName: BASE_APP_NAME,
      isDev: false,
      devLabel: null,
      devBranch: null,
      devWorktreeName: null,
      devRepoRoot: null,
      dockBadgeLabel: null,
      appUserModelId: BASE_APP_USER_MODEL_ID
    }
  }

  const repoRoot = cleanEnvValue(leerEnvDolphin('DEV_REPO_ROOT', env))
  const branch = cleanEnvValue(leerEnvDolphin('DEV_BRANCH', env))
  const worktreeName =
    cleanEnvValue(leerEnvDolphin('DEV_WORKTREE_NAME', env)) ??
    cleanEnvValue(path.basename(repoRoot ?? process.cwd()))
  const devLabel =
    cleanEnvValue(leerEnvDolphin('DEV_INSTANCE_LABEL', env)) ?? formatLabel(branch, worktreeName)
  const dockTitle =
    cleanEnvValue(leerEnvDolphin('DEV_DOCK_TITLE', env)) ??
    `${BASE_APP_NAME}: ${branch ?? devLabel ?? 'dev'}`

  return {
    name: dockTitle,
    // Share one dev Keychain key; branch identity remains in the display name.
    appName: `${BASE_APP_NAME} Dev`,
    isDev: true,
    devLabel,
    devBranch: branch,
    devWorktreeName: worktreeName,
    devRepoRoot: repoRoot,
    dockBadgeLabel: null,
    appUserModelId: createDevAppUserModelId(repoRoot ?? devLabel)
  }
}
