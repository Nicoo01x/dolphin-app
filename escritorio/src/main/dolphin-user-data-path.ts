import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const DOLPHIN_USER_DATA_DIRECTORY_NAME = '.dolphin'
export const DOLPHIN_AGENT_HOOKS_DIRECTORY_NAME = 'agent-hooks'
export const DOLPHIN_USER_DATA_MIGRATION_MARKER = '.migrado-de-dolphin'

const LEGACY_USER_DATA_ENTRIES = [
  'keybindings.json',
  'linear-token.enc',
  'linear-viewer.json',
  'linear-workspaces.json',
  'linear-tokens',
  'bitbucket-credential.json',
  'bitbucket-credential.enc',
  'jira-sites.json',
  'jira-tokens',
  'minimax-api-key.enc',
  'minimax-session-cookie.enc',
  'zcode-plan-api-key.enc',
  'openai-speech-token.enc',
  'opencode-go-api-key.enc'
] as const

export function getDolphinUserDataPath(homePath = homedir()): string {
  return join(homePath, DOLPHIN_USER_DATA_DIRECTORY_NAME)
}

export function getDolphinAgentHooksPath(homePath = homedir()): string {
  return join(getDolphinUserDataPath(homePath), DOLPHIN_AGENT_HOOKS_DIRECTORY_NAME)
}

export function ensureDolphinUserDataPath(homePath = homedir()): string {
  const path = getDolphinUserDataPath(homePath)
  mkdirSync(path, { recursive: true })
  return path
}

/** Copies only Dolphin-owned user files; the legacy root and its hooks remain untouched. */
export function migrateDolphinUserData(homePath = homedir()): boolean {
  const dolphinPath = getDolphinUserDataPath(homePath)
  const rutaHeredada = join(homePath, '.orca')
  if (
    existsSync(join(dolphinPath, DOLPHIN_USER_DATA_MIGRATION_MARKER)) ||
    !existsSync(rutaHeredada)
  ) {
    return false
  }

  mkdirSync(dolphinPath, { recursive: true })
  for (const entry of LEGACY_USER_DATA_ENTRIES) {
    const sourcePath = join(rutaHeredada, entry)
    const destinationPath = join(dolphinPath, entry)
    if (existsSync(sourcePath) && !existsSync(destinationPath)) {
      cpSync(sourcePath, destinationPath, { recursive: true, force: false })
    }
  }
  writeFileSync(join(dolphinPath, DOLPHIN_USER_DATA_MIGRATION_MARKER), '')
  return true
}
