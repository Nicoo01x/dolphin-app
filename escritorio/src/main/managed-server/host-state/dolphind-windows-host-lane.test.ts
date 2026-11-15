// Real Windows SSH host lane: invoke-windows-host-cells.ps1 supplies DOLPHIN_RUN_SSH_WINDOWS_HOST=1 and DOLPHIN_SSH_WINDOWS_HOST_CELL.
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it, vi, type MockInstance } from 'vitest'

vi.mock('electron', () => ({ app: { getAppPath: () => process.cwd() } }))

import { SshConnection } from '../../ssh/connection/ssh-connection'
import {
  connectHostileHost,
  installHostileHostAppEnvironment
} from '../../ssh/hostile-host-test-support/ssh-hostile-host-test-harness'
import { resolveDolphindRemoteContext } from '../install/dolphind-remote-context'
import { proveWindowsStdioBridge } from '../lifecycle/testing/dolphind-windows-stdio-bridge-test-cell'
import { deployDolphind } from '../install/dolphind-remote-deploy'
import { dolphindLivenessProbeCommand, parseDolphindLiveness } from '../install/dolphind-remote-launch'
import { dolphindSlotDir, type DolphindSlotOptions } from '../activation/dolphind-recovery-slot'
import { decommissionRemoteDolphind } from '../install/dolphind-remote-decommission'
import { readDolphindActivationRecord } from '../activation/dolphind-activation-record-store'
import { gcOldDolphindVersions } from '../install/dolphind-remote-gc'
import { execDolphindRemote } from '../install/dolphind-remote-runtime-control'
import { dolphindWindowsNodeCommandLine } from '../install/dolphind-remote-windows-node'
import { joinRemotePath } from '../../ssh/remote-host/ssh-remote-platform'
import {
  isWindowsDolphindCellId,
  readWindowsHostCellDescriptor,
  windowsHostSshTarget
} from '../../ssh/hostile-host-test-support/ssh-windows-host-cells'

const RUN = process.env.DOLPHIN_RUN_SSH_WINDOWS_HOST === '1'
const CELL_TIMEOUT_MS = 20 * 60_000

/** Host operations must avoid PowerShell hops regardless of sshd DefaultShell. */
function isDolphindHostCommand(command: string): boolean {
  return /dolphind-host-script-[0-9a-f]{16}\.js|[\\/]dolphind\.js /u.test(command)
}

describe.runIf(RUN)('managed dolphind on a Windows OpenSSH host', () => {
  let cleanupAppEnvironment: (() => void) | null = null

  beforeAll(() => {
    cleanupAppEnvironment = installHostileHostAppEnvironment()
  })

  afterAll(() => {
    cleanupAppEnvironment?.()
  })

  it(
    'deploys, serves, decommissions by request and exits',
    async () => {
      const descriptor = readWindowsHostCellDescriptor(process.env.DOLPHIN_SSH_WINDOWS_HOST_CELL ?? '')
      if (!isWindowsDolphindCellId(descriptor.cell)) {
        throw new Error(`${descriptor.cell} is not a managed dolphind cell`)
      }
      const sshTarget = windowsHostSshTarget(descriptor, randomUUID())
      let exec: MockInstance<SshConnection['exec']> | null = null
      const receipt: Record<string, unknown> = { cell: descriptor.cell, target: descriptor.target }
      let conn: SshConnection | null = null
      try {
        conn = await connectHostileHost(sshTarget)
        exec = vi.spyOn(SshConnection.prototype, 'exec')
        const context = await resolveDolphindRemoteContext(sshTarget, conn)
        expect(context.host.os).toBe('win32')
        const options: DolphindSlotOptions = {
          conn,
          host: context.host,
          remoteHome: context.remoteHome,
          nodePath: 'node',
          userDataDir: context.userDataDir,
          bindHost: '127.0.0.1',
          port: 0
        }
        const idle = { liveSessions: 0, startedSinceActivation: 0, daemonProtocolVersion: null }
        const deployed = await deployDolphind({
          ...options,
          target: context.serverTarget,
          census: idle,
          recountCensus: async () => idle,
          releaseIncumbentAdmission: async () => {}
        })
        receipt.deploy = deployed
        expect(deployed.outcome).toBe('installed-and-activated')
        const slotDir = dolphindSlotDir(options, deployed.fullVersion)
        const liveness = async () =>
          parseDolphindLiveness(
            await execDolphindRemote(options, dolphindLivenessProbeCommand(options.host, slotDir))
          )
        expect(await liveness()).toBe('LIVE')
        // Probe the native dolphin launcher installed inside the managed profile.
        const cli = joinRemotePath(options.host, context.userDataDir, 'cli', 'bin', 'dolphin.exe')
        const status = JSON.parse(
          await execDolphindRemote(options, dolphindWindowsNodeCommandLine(cli, ['status', '--json']))
        )
        receipt.cliStatus = status.result
        expect(status.result.runtime).toMatchObject({ reachable: true })
        expect(status.result.app.desktopWindowStatus).toBe('blocked')
        // This account blocks forwarding; verify the managed tunnel's stdio fallback.
        receipt.stdioBridge = await proveWindowsStdioBridge(conn, options.host, slotDir)
        expect(receipt.stdioBridge).toMatchObject({
          forwarding: 'refused',
          response: expect.stringMatching(/^HTTP\/1\.1 101/u)
        })
        const record = await readDolphindActivationRecord(options)
        receipt.decommission = await decommissionRemoteDolphind({
          ...options,
          record,
          census: { liveSessions: 0, startedSinceActivation: 0, daemonProtocolVersion: null }
        })
        // Include the refusal detail because matcher diffs omit the message.
        expect(receipt.decommission, JSON.stringify(receipt.decommission)).toMatchObject({
          outcome: 'decommissioned',
          version: deployed.fullVersion
        })
        expect(await liveness()).toBe('DEAD')
        await gcOldDolphindVersions({
          conn,
          host: options.host,
          remoteHome: options.remoteHome,
          currentDirAbsPath: slotDir,
          record: await readDolphindActivationRecord(options)
        })
        expect(await liveness()).toBe('DEAD')

        const commands = exec.mock.calls.map(([command]) => String(command))
        const dolphindCommands = commands.filter(isDolphindHostCommand)
        receipt.dolphindCommands = dolphindCommands.length
        receipt.powershellCommands = commands.filter((command) =>
          /^powershell\.exe /iu.test(command)
        ).length
        expect(dolphindCommands.length).toBeGreaterThan(0)
        for (const command of dolphindCommands) {
          expect(command).not.toMatch(/EncodedCommand/u)
        }
        receipt.passed = true
      } finally {
        exec?.mockRestore()
        await conn?.disconnect().catch(() => {})
        writeFileSync(descriptor.receipt, `${JSON.stringify(receipt, null, 2)}\n`)
      }
    },
    CELL_TIMEOUT_MS
  )
})
