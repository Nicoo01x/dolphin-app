import { join } from 'node:path'
import { getDolphinAgentHooksPath } from '../../../dolphin-user-data-path'

export function getDolphinManagedScriptFileName(scriptFileName: string): string {
  return scriptFileName.toLowerCase().startsWith('dolphin-')
    ? scriptFileName
    : `dolphin-${scriptFileName}`
}

// Parallel Dolphin instances must share one user-wide script path.
export function getSharedManagedScriptPath(scriptFileName: string): string {
  return join(getDolphinAgentHooksPath(), getDolphinManagedScriptFileName(scriptFileName))
}
