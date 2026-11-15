// D7: switch Electron serve ↔ dolphind serve on one profile without replacing surviving daemon terminals; each host must refuse the other’s profile lock.
// Build pnpm build:dolphind, then run electron-headless with DOLPHIN_E2E_DOLPHIND_SERVE=1 DOLPHIN_BACKGROUND_LAUNCH=1.
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runProcess } from '@dolphin/process-host'
import { getDaemonPidPath } from '../../src/main/daemon/launch/daemon-spawner'
import { readDaemonPidRecord } from '../../src/main/daemon/endpoint/identity/daemon-endpoint-incarnation'
import { resolveBundledDolphindRuntime } from '../../src/main/dolphind/dolphind-bundled-runtime'
import { DOLPHIND_EXIT_CONFIGURATION } from '../../src/main/dolphind/dolphind-configuration-exit'
import {
  buildDaemonSessionClient,
  type DaemonSessionClientResult
} from '../../src/main/dolphind/dolphind-daemon-session-client-fixture'
import { expect, test } from './helpers/dolphin-app'
import { resolveElectronExecutable } from './helpers/daemon-generation-runtime-fixture'
import {
  launchHeadlessPairedRuntimeHost,
  type HeadlessPairedRuntimeHost
} from './helpers/headless-paired-runtime-host'
import { cleanupE2EDaemons } from './helpers/electron-process-shutdown'
import {
  cliServeProfile,
  isPidAlive,
  spawnUntilReady,
  startCliServe
} from './helpers/dolphin-serve-cli-host'

const RUN = process.env.DOLPHIN_E2E_DOLPHIND_SERVE === '1'
const slotDir = path.resolve('out/dolphind')
const dolphindRuntime = RUN && existsSync(slotDir) ? resolveBundledDolphindRuntime(slotDir) : null
const SINGLE_INSTANCE_ALREADY_RUNNING_EXIT_CODE = 3

test.describe.configure({ mode: 'serial' })

let scratch = ''
let clientScript = ''

test.beforeAll(async () => {
  test.skip(
    !RUN,
    'Set DOLPHIN_E2E_DOLPHIND_SERVE=1 (and build out/dolphind) to run the serve mode switch.'
  )
  expect(
    dolphindRuntime,
    'pnpm build:dolphind must produce a packaged slot in out/dolphind'
  ).toBeTruthy()
  // Short root: macOS caps a unix socket path at 104 bytes, and the daemon's lives in userData.
  scratch = mkdtempSync(
    path.join(process.platform === 'win32' ? os.tmpdir() : '/tmp', 'dolphin-d7-')
  )
  clientScript = path.join(scratch, 'daemon-client.cjs')
  await buildDaemonSessionClient(clientScript)
})

test.afterAll(() => {
  if (scratch) {
    rmSync(scratch, { recursive: true, force: true, maxRetries: 50, retryDelay: 100 })
  }
})

function daemonPid(userDataDir: string): number | null {
  return readDaemonPidRecord(getDaemonPidPath(path.join(userDataDir, 'daemon')))?.pid ?? null
}

/** A paired client's terminal, straight to the profile's daemon, under this runner's Node. */
async function terminal(
  host: HeadlessPairedRuntimeHost,
  op: 'create' | 'attach',
  marker: string
): Promise<DaemonSessionClientResult> {
  const result = await runProcess({
    program: process.execPath,
    args: [clientScript, op, path.join(host.userDataDir, 'daemon'), 'serve-d7', marker, scratch],
    env: host.env,
    timeoutMs: 30_000
  })
  expect(result.code, result.stderr).toBe(0)
  return JSON.parse(result.stdout.trim().split('\n').at(-1) ?? '{}')
}

type DolphindServe = { daemonPid: number; stop: () => Promise<void> }

/** `dolphin serve` on dolphind, as the T6-11 launcher runs it, on the host's own profile. */
async function startDolphindServe(
  host: Pick<HeadlessPairedRuntimeHost, 'env' | 'userDataDir'>
): Promise<DolphindServe> {
  const serve = await spawnUntilReady({
    label: 'dolphind serve',
    program: dolphindRuntime!,
    args: [path.join(slotDir, 'dolphind.js'), '--bind', '127.0.0.1', '--port', '0', '--json'],
    env: { ...host.env, DOLPHIN_USER_DATA: host.userDataDir },
    timeoutMs: 120_000,
    parseReady: (stdout) => {
      const newline = stdout.indexOf('\n')
      return newline === -1 ? null : stdout.slice(0, newline)
    }
  })
  try {
    const daemon = JSON.parse(serve.ready).health?.terminalDaemon
    expect(daemon?.state, serve.stderr()).toBe('live')
    // POSIX: SIGTERM is dolphind's graceful stop and leaves the daemon running by design.
    return { daemonPid: daemon.pid, stop: serve.stop }
  } catch (error) {
    // Why: the caller never gets stop(), and a leaked dolphind keeps the profile lock.
    await serve.stop()
    throw error
  }
}

// Why: an SSH-managed dolphind on this machine runs under ~/.orca, beside the desktop's own profile.
test("Electron serve starts beside a live daemon another profile's dolphind forked", async () => {
  const other = cliServeProfile(scratch)
  const dolphind = await startDolphindServe(other)
  try {
    const host = await launchHeadlessPairedRuntimeHost({
      pinnedServePort: true,
      userDataParent: scratch
    })
    try {
      expect(daemonPid(host.userDataDir)).not.toBe(dolphind.daemonPid)
    } finally {
      await host.dispose()
    }
  } finally {
    await dolphind.stop()
    await cleanupE2EDaemons(other.userDataDir)
  }
})

test('a terminal survives Electron serve → dolphind serve → Electron serve on one profile', async () => {
  const host = await launchHeadlessPairedRuntimeHost({
    pinnedServePort: true,
    userDataParent: scratch
  })
  try {
    const created = await terminal(host, 'create', 'ELECTRON')
    expect(created).toMatchObject({ isReattach: false, output: true })
    const electronDaemon = daemonPid(host.userDataDir)
    expect(electronDaemon).toBeTruthy()

    await host.restartServeProcess({
      betweenProcesses: async () => {
        // Electron serve has quit; dolphind serve takes the same profile and adopts its daemon.
        const dolphind = await startDolphindServe(host)
        try {
          expect(dolphind.daemonPid).toBe(electronDaemon)
          expect(await terminal(host, 'attach', 'DOLPHIND')).toEqual({
            pid: created.pid,
            isReattach: true,
            output: true
          })
        } finally {
          await dolphind.stop()
        }
      }
    })

    // Back on Electron serve: still the same daemon and the same live terminal.
    expect(daemonPid(host.userDataDir)).toBe(electronDaemon)
    expect(await terminal(host, 'attach', 'BACK')).toEqual({
      pid: created.pid,
      isReattach: true,
      output: true
    })
  } finally {
    await host.dispose()
  }
})

test("Electron serve adopts a terminal dolphind's daemon owns", async () => {
  const host = await launchHeadlessPairedRuntimeHost({
    pinnedServePort: true,
    userDataParent: scratch
  })
  try {
    let created: DaemonSessionClientResult | null = null
    let dolphindDaemon: number | null = null
    await host.restartServeProcess({
      betweenProcesses: async () => {
        // Retire Electron's daemon so dolphind serve forks its own on the pinned Node.
        const previous = daemonPid(host.userDataDir)
        if (previous) {
          process.kill(previous, 'SIGKILL')
          await expect.poll(() => isPidAlive(previous), { timeout: 10_000 }).toBe(false)
        }
        const dolphind = await startDolphindServe(host)
        try {
          dolphindDaemon = dolphind.daemonPid
          expect(dolphindDaemon).not.toBe(previous)
          created = await terminal(host, 'create', 'DOLPHIND')
          expect(created).toMatchObject({ isReattach: false, output: true })
        } finally {
          await dolphind.stop()
        }
      }
    })
    expect(daemonPid(host.userDataDir)).toBe(dolphindDaemon)
    expect(await terminal(host, 'attach', 'ELECTRON')).toEqual({
      pid: created!.pid,
      isReattach: true,
      output: true
    })
  } finally {
    await host.dispose()
  }
})

test('each serve host refuses a profile the other holds', async () => {
  const host = await launchHeadlessPairedRuntimeHost({
    pinnedServePort: true,
    userDataParent: scratch
  })
  try {
    // Electron serve holds the profile: dolphind serve refuses with its configuration exit code.
    const refused = await runProcess({
      program: dolphindRuntime!,
      args: [path.join(slotDir, 'dolphind.js'), '--bind', '127.0.0.1', '--port', '0', '--json'],
      env: { ...host.env, DOLPHIN_USER_DATA: host.userDataDir },
      timeoutMs: 60_000
    })
    expect(refused.code).toBe(DOLPHIND_EXIT_CONFIGURATION)
    expect(refused.stdout).toBe('')
    expect(refused.stderr).toContain('The Dolphin desktop app')

    await host.restartServeProcess({
      betweenProcesses: async () => {
        // dolphind serve holds it: an Electron launch on the same profile exits as a duplicate.
        const dolphind = await startDolphindServe(host)
        try {
          const electron = await runProcess({
            program: resolveElectronExecutable(process.cwd()),
            args: [...host.electronArgs, '--serve', '--serve-json', '--serve-port', '0'],
            env: host.env,
            timeoutMs: 90_000
          })
          expect(electron.code).toBe(SINGLE_INSTANCE_ALREADY_RUNNING_EXIT_CODE)
          expect(`${electron.stdout}${electron.stderr}`).toContain('Another dolphind')
        } finally {
          await dolphind.stop()
        }
      }
    })
  } finally {
    await host.dispose()
  }
})

/** Which host holds the profile: both take `dolphind.lock`, each under its own role. */
function profileLockRole(userDataDir: string): unknown {
  return JSON.parse(readFileSync(path.join(userDataDir, 'dolphind.lock'), 'utf8')).role
}

// Needs out/dolphind-template for this runner's target, as a packaged install carries.
test('`dolphin serve` runs on dolphind by default and on Electron with DOLPHIN_SERVE_RUNTIME=electron', async () => {
  const profile = cliServeProfile(scratch)
  try {
    const byDefault = await startCliServe(profile)
    try {
      expect(byDefault.stderr()).toContain('[serve] running on dolphind')
      expect(byDefault.readiness.health).toBeDefined()
      expect(profileLockRole(profile.userDataDir)).toBe('dolphind')
    } finally {
      await byDefault.stop()
    }

    // Electron serve publishes no build-health block yet, which is what tells the two apart.
    const electron = await startCliServe(profile, { DOLPHIN_SERVE_RUNTIME: 'electron' })
    try {
      expect(electron.stderr()).not.toContain('[serve] running on dolphind')
      expect(electron.readiness.health).toBeUndefined()
    } finally {
      await electron.stop()
    }
  } finally {
    await cleanupE2EDaemons(profile.userDataDir)
  }
})
