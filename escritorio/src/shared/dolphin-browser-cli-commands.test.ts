import { describe, expect, it } from 'vitest'
import { parseDolphinBrowserCommand } from './dolphin-browser-cli-commands'

describe('parseDolphinBrowserCommand', () => {
  it.each([
    'dolphin worktree ls',
    'dolphin terminal send --text "dolphin click"',
    'dolphinstra click',
    'dolphin',
    'echo dolphin click',
    'echo "docs; dolphin snapshot --page p1; text"',
    "git commit -m 'run dolphin click | dolphin snapshot'",
    'git log --oneline'
  ])('does not match %s', (command) => {
    expect(parseDolphinBrowserCommand(command)).toBeNull()
  })
})
