import { leerEnvDolphin } from '../../shared/dolphin-env'
import { dirname, join, resolve } from 'node:path'
import { SERVE_USER_DATA_PATH_ENV } from '../../shared/serve-user-data-path'
import { getPlatformUserDataPath } from './metadata'

/** Dev builds read DOLPHIN_DEV_USER_DATA_PATH rather than --user-data-dir. */
function launchesDevApp(env: NodeJS.ProcessEnv): boolean {
  return leerEnvDolphin('APP_EXECUTABLE_NEEDS_APP_ROOT', env) === '1'
}

/** Resolve absolutely: the launched child runs from the app root, not the caller’s cwd. */
export function resolveLaunchUserDataPath(env: NodeJS.ProcessEnv = process.env): string {
  const userDataPath = leerEnvDolphin('USER_DATA_PATH', env)
  if (userDataPath) {
    return resolve(userDataPath)
  }
  if (launchesDevApp(env)) {
    return resolve(
      leerEnvDolphin('DEV_USER_DATA_PATH', env) ||
        join(dirname(getPlatformUserDataPath()), 'dolphin-dev')
    )
  }
  return getPlatformUserDataPath()
}

/** Pin the profile through both packaged and dev entry points. */
export function pinLaunchUserDataPath(
  args: string[],
  env: NodeJS.ProcessEnv,
  userDataPath: string
): { args: string[]; env: NodeJS.ProcessEnv } {
  const pinnedEnv: NodeJS.ProcessEnv = { ...env, DOLPHIN_USER_DATA_PATH: userDataPath }
  if (launchesDevApp(env)) {
    pinnedEnv.DOLPHIN_DEV_USER_DATA_PATH = userDataPath
  }
  return { args: [...args, `--user-data-dir=${userDataPath}`], env: pinnedEnv }
}

/** Serve checks this profile before acquiring its instance lock. */
export function pinServeUserDataPath(
  args: string[],
  env: NodeJS.ProcessEnv,
  userDataPath: string
): { args: string[]; env: NodeJS.ProcessEnv } {
  const pinned = pinLaunchUserDataPath(args, env, userDataPath)
  return { args: pinned.args, env: { ...pinned.env, [SERVE_USER_DATA_PATH_ENV]: userDataPath } }
}
