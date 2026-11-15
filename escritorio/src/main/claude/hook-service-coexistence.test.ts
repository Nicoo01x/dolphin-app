import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ClaudeHookService } from './hook-service'

describe('Dolphin Claude hook coexistence', () => {
  let tmpHome = ''

  afterEach(() => {
    vi.unstubAllEnvs()
    if (tmpHome) {
      rmSync(tmpHome, { recursive: true, force: true })
    }
  })

  it('preserves an DOLPHIN hook through install, update, and remove', () => {
    tmpHome = mkdtempSync(join(tmpdir(), 'dolphin-claude-hook-coexistence-'))
    vi.stubEnv('HOME', tmpHome)
    vi.stubEnv('USERPROFILE', tmpHome)
    const settingsPath = join(tmpHome, '.claude', 'settings.json')
    const dolphinEntry = {
      type: 'command',
      command: '/home/alice/.orca/agent-hooks/claude-hook.cmd'
    }
    mkdirSync(join(tmpHome, '.claude'), { recursive: true })
    writeFileSync(settingsPath, JSON.stringify({ hooks: { Stop: [{ hooks: [dolphinEntry] }] } }))

    const readDolphinEntry = (): unknown => {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      return settings.hooks?.Stop?.flatMap((definition) => definition.hooks ?? []).find(
        (hook) => JSON.stringify(hook) === JSON.stringify(dolphinEntry)
      )
    }

    expect(new ClaudeHookService().install().state).toBe('installed')
    expect(readDolphinEntry()).toEqual(dolphinEntry)
    expect(new ClaudeHookService().install().state).toBe('installed')
    expect(readDolphinEntry()).toEqual(dolphinEntry)
    expect(new ClaudeHookService().remove().state).toBe('not_installed')
    expect(readDolphinEntry()).toEqual(dolphinEntry)
  })
})
