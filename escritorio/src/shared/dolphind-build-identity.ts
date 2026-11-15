import { createHash } from 'node:crypto'
import { readFileSync, realpathSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { DOLPHIND_LAUNCHER_FILENAME, DOLPHIND_SERVER_ENTRY_FILENAME } from './dolphind-artifacts'

export const DOLPHIND_BUILD_HASH_LENGTH = 16

/** The launcher embeds its server digest, keeping the hash older clients calculate. */
export function hashDolphindLauncher(entryPath: string): string {
  const entry = realpathSync(entryPath)
  const launcher =
    basename(entry) === DOLPHIND_SERVER_ENTRY_FILENAME
      ? join(dirname(entry), DOLPHIND_LAUNCHER_FILENAME)
      : entry
  return createHash('sha256')
    .update(readFileSync(launcher))
    .digest('hex')
    .slice(0, DOLPHIND_BUILD_HASH_LENGTH)
}
