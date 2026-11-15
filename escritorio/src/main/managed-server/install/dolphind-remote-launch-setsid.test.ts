import { execFileSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DOLPHIND_PID_FILENAME, DOLPHIND_READINESS_FILENAME } from './dolphind-remote-host-support'
import { dolphindLaunchCommand, type DolphindLaunchSpec } from './dolphind-remote-launch'
import { getRemoteHostPlatform } from '../../ssh/remote-host/ssh-remote-platform'

const host = getRemoteHostPlatform('linux-x64')

function spec(remoteInstallDir: string, nodePath = '/usr/bin/node'): DolphindLaunchSpec {
  return {
    remoteInstallDir,
    nodePath,
    fullVersion: '0.2.0+bb01',
    userDataDir: '/home/u/.dolphin',
    bindHost: '127.0.0.1',
    port: 7777,
    activationRoot: '/home/u/.dolphin-remote/.dolphind-activation-transaction'
  }
}

describe('the WSL launch (setsid)', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it.skipIf(process.platform !== 'linux')(
    'really detaches: the recorded PID is the runtime, in a new session, and writes readiness',
    () => {
      const dir = mkdtempSync(join(tmpdir(), 'dolphind-setsid-'))
      dirs.push(dir)
      const runtime = join(dir, 'fake-node')
      writeFileSync(runtime, `#!/bin/sh\necho '{"type":"dolphin_server_ready"}'\nsleep 30\n`)
      chmodSync(runtime, 0o755)
      const out = execFileSync('sh', [
        '-c',
        dolphindLaunchCommand(host, spec(dir, runtime), 'setsid')
      ])
      const pid = Number(out.toString().trim())
      try {
        expect(Number.isSafeInteger(pid) && pid > 0).toBe(true)
        expect(readFileSync(join(dir, DOLPHIND_PID_FILENAME), 'utf8').trim()).toBe(String(pid))
        const ps = (field: string, target: number): string =>
          execFileSync('ps', ['-o', `${field}=`, '-p', String(target)])
            .toString()
            .trim()
        expect(ps('args', pid)).toContain(join(dir, 'dolphind.js'))
        expect(ps('sid', pid)).toBe(String(pid))
        expect(ps('sid', pid)).not.toBe(ps('sid', process.pid))
        for (
          let i = 0;
          i < 50 && !readFileSync(join(dir, DOLPHIND_READINESS_FILENAME), 'utf8');
          i++
        ) {
          execFileSync('sleep', ['0.05'])
        }
        expect(readFileSync(join(dir, DOLPHIND_READINESS_FILENAME), 'utf8')).toContain(
          'dolphin_server_ready'
        )
      } finally {
        try {
          process.kill(pid)
        } catch {
          // Cleanup tolerates children already reaped.
        }
      }
    }
  )

  // Daemon children create user files and must retain login umask (#31125).
  it.skipIf(process.platform !== 'linux')(
    'runs the daemon at the login umask while its PID and readiness files stay owner-only',
    () => {
      const dir = mkdtempSync(join(tmpdir(), 'dolphind-setsid-umask-'))
      dirs.push(dir)
      const runtime = join(dir, 'fake-node')
      writeFileSync(runtime, `#!/bin/sh\n: > daemon-file\necho '{"type":"dolphin_server_ready"}'\n`)
      chmodSync(runtime, 0o755)
      const command = dolphindLaunchCommand(host, spec(dir, runtime), 'setsid')
      execFileSync('sh', ['-c', `umask 022; ${command}`])
      for (
        let i = 0;
        i < 50 && !readFileSync(join(dir, DOLPHIND_READINESS_FILENAME), 'utf8');
        i++
      ) {
        execFileSync('sleep', ['0.05'])
      }
      const mode = (name: string): number => statSync(join(dir, name)).mode & 0o777
      expect(mode('daemon-file')).toBe(0o644)
      expect(mode(DOLPHIND_PID_FILENAME)).toBe(0o600)
      expect(mode(DOLPHIND_READINESS_FILENAME)).toBe(0o600)
    }
  )
})
