import { dirname, join } from 'node:path'
import { resolveAppImageGenerationOfExecutable } from '../../../shared/appimage-cache-identity'
import {
  isAppImageStableLauncherReady,
  resolveAppImageStableLauncherPath
} from './appimage-stable-launcher'
import { LINUX_CLI_COMMAND_NAME } from '../packaged-assets/bundled-cli-launcher-path'

// Generation services lack $APPIMAGE; register the stable launcher so later pruning cannot break it.
export function resolveGenerationStableLauncherPath(resourcesPath: string): string | null {
  const generation = resolveAppImageGenerationOfExecutable(
    join(dirname(resourcesPath), LINUX_CLI_COMMAND_NAME)
  )
  if (!generation || !isAppImageStableLauncherReady(generation.cacheRootPath)) {
    return null
  }
  return resolveAppImageStableLauncherPath(generation.cacheRootPath)
}
