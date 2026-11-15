import { getAppEnvironment, hasAppEnvironment } from '../../shared/app-environment'
import { toLinuxPath } from '../../shared/wsl-paths'
import { prependDolphinCliDirToChildPath } from '../cli/launchers/dolphin-cli-child-path'
import { getManagedWslCliDir, getWslCliCommandName } from '../cli/wsl/wsl-managed-cli'
import { WSL_MANAGED_CLI_PATH_RESTORE } from '../wsl/execution/wsl-managed-cli-path-restore'

// A hook isn't a pane: a Dolphin started from a Dolphin terminal must not lend that pane's identity.
const INHERITED_PANE_IDENTITY_KEYS = [
  'DOLPHIN_TERMINAL_HANDLE',
  'DOLPHIN_PANE_KEY',
  'DOLPHIN_TAB_ID',
  'DOLPHIN_AGENT_LAUNCH_TOKEN',
  'DOLPHIN_WORKSPACE_ID',
  'DOLPHIN_WORKTREE_ID'
] as const

/** Give an in-process hook this app's `dolphin` CLI, as terminals get it. */
export function applyHostHookDolphinCliEnv(env: Record<string, string | undefined>): void {
  for (const key of INHERITED_PANE_IDENTITY_KEYS) {
    delete env[key]
  }
  if (!hasAppEnvironment()) {
    return
  }
  const app = getAppEnvironment()
  const userDataPath = app.getPath('userData')
  const childEnv = Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined)
  )
  childEnv.DOLPHIN_USER_DATA_PATH = userDataPath
  prependDolphinCliDirToChildPath(childEnv, {
    isPackaged: app.isPackaged(),
    userDataPath,
    resourcesPath: process.resourcesPath ?? null
  })
  for (const key of Object.keys(env)) {
    if (!(key in childEnv)) {
      delete env[key]
    }
  }
  Object.assign(env, childEnv)
}

/**
 * The guest env and a script prefix that puts the managed WSL CLI first on PATH. Inherited pane
 * identity is blanked, since wsl.exe would otherwise carry the host's values in through WSLENV.
 */
export function wslHookDolphinCliEnv(): { env: Record<string, string>; scriptPrefix: string } {
  const blankedIdentity = Object.fromEntries(INHERITED_PANE_IDENTITY_KEYS.map((key) => [key, '']))
  if (!hasAppEnvironment()) {
    return { env: blankedIdentity, scriptPrefix: '' }
  }
  const app = getAppEnvironment()
  const userDataPath = app.getPath('userData')
  const managedCliDir = getManagedWslCliDir({
    isPackaged: app.isPackaged(),
    userDataPath,
    ...(process.resourcesPath ? { resourcesPath: process.resourcesPath } : {})
  })
  if (!managedCliDir) {
    return { env: blankedIdentity, scriptPrefix: '' }
  }
  return {
    env: {
      ...blankedIdentity,
      DOLPHIN_WSL_CLI_DIR: toLinuxPath(managedCliDir),
      DOLPHIN_CLI_COMMAND: getWslCliCommandName(app.isPackaged()),
      DOLPHIN_USER_DATA_PATH: toLinuxPath(userDataPath)
    },
    scriptPrefix: `${WSL_MANAGED_CLI_PATH_RESTORE}\n`
  }
}
