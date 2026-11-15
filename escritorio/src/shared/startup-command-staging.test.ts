import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { quoteStartupArg } from './agent-launch/startup/tui-agent-startup-shell'
import {
  STAGED_STARTUP_COMMAND_STALE_MS,
  discardStagedStartupCommand,
  stageStartupCommand,
  sweepStaleStagedStartupCommands
} from './startup-command-staging'

let directory: string

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'dolphin-staging-test-'))
})

afterEach(() => {
  rmSync(directory, { recursive: true, force: true })
})

function stage(command: string, shellPath = '/bin/zsh', platform: NodeJS.Platform = 'darwin') {
  return stageStartupCommand({ command, shellPath, platform, directory })
}

describe('stageStartupCommand', () => {
  it('writes a 0600 script whose body is exactly the command, and types a sourcing line', () => {
    const command = `claude '${'x'.repeat(600)}'`
    const staged = stage(`${command}\n`)
    expect(staged.delivery).toBe('staged')
    expect(staged.scriptPath).toBeDefined()
    const scriptPath = staged.scriptPath!
    // Hoy la app escapa también las barras de la ruta al generar la orden de carga POSIX.
    expect(staged.command).toBe(`. ${quoteStartupArg(scriptPath, 'posix')}`)
    // El guion lleva el comando adentro, así que no puede quedar legible para todo el mundo. En
    // Windows los permisos POSIX no significan nada —informa 0666 siempre— y lo que protege el
    // archivo son las ACL, que mide `secure-path-windows-acl.win32.test.ts`. Acá se exige donde
    // el número quiere decir algo.
    if (process.platform !== 'win32') {
      expect(statSync(scriptPath).mode & 0o777).toBe(0o600)
    }
    // Hoy el borrado inicial usa el mismo escape POSIX portátil que la orden de carga.
    expect(readFileSync(scriptPath, 'utf8')).toBe(
      `command rm -f -- ${quoteStartupArg(scriptPath, 'posix')}\n${command}\n`
    )
  })

  it('types the full command and says so when the script cannot be written', () => {
    const command = 'a'.repeat(600)
    const staged = stageStartupCommand({
      command,
      shellPath: '/bin/bash',
      platform: 'linux',
      directory: join(directory, 'missing')
    })
    expect(staged.command).toBe(command)
    expect(staged.delivery).toBe('typed-after-stage-failed')
    expect(staged.failure).toMatch(/ENOENT/)
    expect(staged.scriptPath).toBeUndefined()
  })
})

describe('discardStagedStartupCommand', () => {
  it('removes a script the shell never sourced', () => {
    const staged = stage('a'.repeat(600))
    discardStagedStartupCommand(staged)
    expect(readdirSync(directory)).toEqual([])
  })
})

describe('sweepStaleStagedStartupCommands', () => {
  it('removes only staged scripts older than an hour', () => {
    const now = Date.now()
    const stale = join(directory, 'dolphin-launch-aaaa.sh')
    const fresh = join(directory, 'dolphin-launch-bbbb.sh')
    const unrelated = join(directory, 'something-else.sh')
    for (const path of [stale, fresh, unrelated]) {
      writeFileSync(path, '')
    }
    const staleSeconds = (now - STAGED_STARTUP_COMMAND_STALE_MS - 1000) / 1000
    utimesSync(stale, staleSeconds, staleSeconds)
    utimesSync(unrelated, staleSeconds, staleSeconds)
    sweepStaleStagedStartupCommands({ directory, now })
    expect(readdirSync(directory).sort()).toEqual(['dolphin-launch-bbbb.sh', 'something-else.sh'])
  })
})
