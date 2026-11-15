import { join } from 'node:path'
import { hashDolphindLauncher } from '../../../shared/dolphind-build-identity'
import { DOLPHIND_LAUNCHER_FILENAME } from '../../../shared/dolphind-artifacts'

export function computeLocalDolphindBuildHash(localDolphindDir: string): string {
  return hashDolphindLauncher(join(localDolphindDir, DOLPHIND_LAUNCHER_FILENAME))
}
