import { createHash } from 'node:crypto'
import { readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { DOLPHIND_SERVER_ENTRY_FILENAME } from '../../shared/dolphind-artifacts'
import { assertDolphindServerRuntime, handoffToBundledDolphind } from './dolphind-bundled-runtime'
import { DOLPHIND_EXIT_CONFIGURATION } from './dolphind-configuration-exit'
import { enableManagedDolphindCompileCache } from './dolphind-compile-cache'

declare const DOLPHIND_SERVER_SHA256: string

let loadServer: (() => void) | undefined

try {
  if (!handoffToBundledDolphind()) {
    assertDolphindServerRuntime()
    const entry = realpathSync(process.argv[1] ?? __filename)
    const server = join(dirname(entry), DOLPHIND_SERVER_ENTRY_FILENAME)
    if (
      createHash('sha256').update(readFileSync(server)).digest('hex') !== DOLPHIND_SERVER_SHA256
    ) {
      throw new Error('The Dolphin server does not match its launcher')
    }
    loadServer = () => {
      enableManagedDolphindCompileCache(dirname(entry))
      createRequire(entry)(server)
    }
  }
} catch (error) {
  console.error('dolphind: failed to launch:', error)
  process.exit(DOLPHIND_EXIT_CONFIGURATION)
}

loadServer?.()
