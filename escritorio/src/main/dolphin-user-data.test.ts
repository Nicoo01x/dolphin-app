import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DOLPHIN_USER_DATA_MIGRATION_MARKER,
  getDolphinAgentHooksPath,
  getDolphinUserDataPath,
  migrateDolphinUserData
} from './dolphin-user-data-path'

describe('Dolphin user data path', () => {
  const homes: string[] = []

  afterEach(() => {
    for (const home of homes.splice(0)) {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('copies user data without copying Dolphin hooks and does not repeat', () => {
    const home = mkdtempSync(join(tmpdir(), 'dolphin-user-data-'))
    homes.push(home)
    const dolphinPath = join(home, '.orca')
    mkdirSync(join(dolphinPath, 'agent-hooks'), { recursive: true })
    writeFileSync(join(dolphinPath, 'keybindings.json'), '{"keybindings":{}}')
    writeFileSync(join(dolphinPath, 'linear-token.enc'), 'linear')
    writeFileSync(join(dolphinPath, 'agent-hooks', 'claude-hook.sh'), 'dolphin hook')

    expect(migrateDolphinUserData(home)).toBe(true)
    expect(readFileSync(join(getDolphinUserDataPath(home), 'keybindings.json'), 'utf8')).toBe(
      '{"keybindings":{}}'
    )
    expect(existsSync(join(getDolphinUserDataPath(home), 'linear-token.enc'))).toBe(true)
    expect(existsSync(getDolphinAgentHooksPath(home))).toBe(false)
    expect(existsSync(join(getDolphinUserDataPath(home), DOLPHIN_USER_DATA_MIGRATION_MARKER))).toBe(
      true
    )
    expect(migrateDolphinUserData(home)).toBe(false)
    expect(readFileSync(join(dolphinPath, 'agent-hooks', 'claude-hook.sh'), 'utf8')).toBe(
      'dolphin hook'
    )
  })

  it('fills an existing Dolphin directory without overwriting Dolphin data', () => {
    const home = mkdtempSync(join(tmpdir(), 'dolphin-user-data-existing-'))
    homes.push(home)
    mkdirSync(join(home, '.orca'), { recursive: true })
    mkdirSync(getDolphinUserDataPath(home), { recursive: true })
    writeFileSync(join(home, '.orca', 'keybindings.json'), 'dolphin')
    writeFileSync(join(getDolphinUserDataPath(home), 'keybindings.json'), 'dolphin')
    writeFileSync(join(home, '.orca', 'linear-token.enc'), 'linear')

    expect(migrateDolphinUserData(home)).toBe(true)
    expect(readFileSync(join(getDolphinUserDataPath(home), 'keybindings.json'), 'utf8')).toBe(
      'dolphin'
    )
    expect(readFileSync(join(getDolphinUserDataPath(home), 'linear-token.enc'), 'utf8')).toBe(
      'linear'
    )
  })
})
