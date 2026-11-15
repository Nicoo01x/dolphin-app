import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { ensureDolphinUserDataPath, getDolphinUserDataPath } from '../../dolphin-user-data-path'

export const LEGACY_WORKSPACE_ID = 'legacy'

function getLegacyTokenPath(): string {
  return join(getDolphinUserDataPath(), 'linear-token.enc')
}

export function getLegacyViewerPath(): string {
  return join(getDolphinUserDataPath(), 'linear-viewer.json')
}

export function getWorkspaceFilePath(): string {
  return join(getDolphinUserDataPath(), 'linear-workspaces.json')
}

export function getWorkspaceTokenDir(): string {
  return join(getDolphinUserDataPath(), 'linear-tokens')
}

export function getWorkspaceTokenPath(workspaceId: string): string {
  if (workspaceId === LEGACY_WORKSPACE_ID) {
    return getLegacyTokenPath()
  }
  return join(getWorkspaceTokenDir(), `${Buffer.from(workspaceId).toString('base64url')}.enc`)
}

export function ensureDolphinDir(): void {
  ensureDolphinUserDataPath()
}

export function ensureWorkspaceTokenDir(): void {
  const dir = getWorkspaceTokenDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}
