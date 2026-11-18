import type { CommandHandler, HandlerContext } from '../dispatch'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError, type RuntimeClient } from '../runtime-client'
import { rejectRemoteSelectionFlags } from '../remote-selection-flag-rejection'
import { resolveSshHostTargetId } from '../host-selector-alternatives'
import type { SshEditableTarget } from '../../shared/ssh-target-management'
import type { SshConnectionState } from '../../shared/ssh-types'
import type { SshConnectionFailure } from '../../shared/ssh-connect-failure-kind'
import {
  buildHostDoctorReport,
  formatHostDoctorReport,
  type HostDoctorReport,
  type HostDoctorTarget
} from './host-doctor-report'

// The first connect uploads the server and its Node runtime; slow links take minutes.
const CONNECT_TIMEOUT_MS = 20 * 60_000

type ConnectAttempt = { state: SshConnectionState | null; error?: string }

function rejectRemote(flags: Map<string, string | boolean>, command: string): void {
  rejectRemoteSelectionFlags(
    flags,
    `\`dolphin ${command}\`. It works on this machine’s own Dolphin runtime, the same SSH registry \`dolphin host list\` reads.`,
    { nextSteps: ['Drop the flag; run the command on the machine that should reach the host.'] }
  )
}

function readPort(flags: Map<string, string | boolean>): number {
  const raw = getOptionalStringFlag(flags, 'port')
  if (raw === undefined) {
    return 22
  }
  const port = Number(raw)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new RuntimeClientError('invalid_argument', `--port must be 1-65535, got ${raw}`)
  }
  return port
}

function toDoctorTarget(target: SshEditableTarget): HostDoctorTarget {
  const destination = target.username ? `${target.username}@${target.host}` : target.host
  return {
    id: target.id,
    label: target.label,
    endpoint: target.configHost ? target.configHost : `${destination}:${target.port}`,
    address: target.host,
    user: target.username,
    port: target.port,
    ...(target.configHost ? { configHost: target.configHost } : {}),
    ...(target.identityFile ? { identityFile: target.identityFile } : {})
  }
}

async function listEditableTargets(client: RuntimeClient): Promise<SshEditableTarget[]> {
  return (await client.call<{ targets: SshEditableTarget[] }>('ssh.listEditableTargets')).result
    .targets
}

async function readEditableTarget(
  client: RuntimeClient,
  targetId: string
): Promise<SshEditableTarget> {
  const target = (await listEditableTargets(client)).find((candidate) => candidate.id === targetId)
  if (!target) {
    throw new RuntimeClientError('invalid_argument', `SSH target ${targetId} is gone.`, {
      nextSteps: ['Run `dolphin host list` to see the saved SSH targets.']
    })
  }
  return target
}

async function readState(
  client: RuntimeClient,
  targetId: string
): Promise<{ state: SshConnectionState | null; lastFailure?: SshConnectionFailure }> {
  return (
    await client.call<{ state: SshConnectionState | null; lastFailure?: SshConnectionFailure }>(
      'ssh.getState',
      { targetId }
    )
  ).result
}

/** A failed connect is an answer to report, not a CLI error; a runtime that can't be reached is. */
async function connect(client: RuntimeClient, targetId: string): Promise<ConnectAttempt> {
  try {
    const response = await client.call<{ state: SshConnectionState | null }>(
      'ssh.connect',
      { targetId },
      { timeoutMs: CONNECT_TIMEOUT_MS }
    )
    return { state: response.result.state }
  } catch (error) {
    if (error instanceof RuntimeClientError && error.code === 'runtime_timeout') {
      throw new RuntimeClientError(
        'ssh_connect_in_progress',
        'Stopped waiting, but Dolphin may still be connecting this host. Run `dolphin host doctor` in a minute before retrying.'
      )
    }
    if (error instanceof RuntimeClientError && error.code === 'runtime_error') {
      return { state: null, error: error.message }
    }
    throw error
  }
}

async function diagnose(
  client: RuntimeClient,
  target: SshEditableTarget,
  /** `always` for `host connect`; the doctor leaves a connected host alone. */
  connectWhen: 'always' | 'disconnected'
): Promise<HostDoctorReport> {
  let read = await readState(client, target.id)
  let attempt: ConnectAttempt | undefined
  if (connectWhen === 'always' || read.state?.status !== 'connected') {
    attempt = await connect(client, target.id)
    read = await readState(client, target.id)
  }
  return buildHostDoctorReport({
    target: toDoctorTarget(target),
    state: read.state ?? attempt?.state ?? null,
    ...(read.lastFailure ? { lastFailure: read.lastFailure } : {}),
    ...(attempt?.error ? { connectError: attempt.error } : {}),
    connectAttempted: attempt !== undefined
  })
}

function sameEndpoint(target: SshEditableTarget, host: string, user: string, port: number) {
  return (
    target.host.toLowerCase() === host.toLowerCase() &&
    target.username === user &&
    target.port === port
  )
}

function formatHostAdd(result: {
  target: HostDoctorTarget
  created: boolean
  doctor?: HostDoctorReport
}): string {
  const head = `${result.created ? 'Saved' : 'Already saved:'} ${result.target.label} (ssh:${result.target.id})  ${result.target.endpoint}`
  return result.doctor
    ? `${head}\n${formatHostDoctorReport(result.doctor)}`
    : `${head}\nNext: dolphin host connect ${result.target.id}`
}

async function resolveTarget(
  client: RuntimeClient,
  flags: Map<string, string | boolean>,
  command: string
): Promise<SshEditableTarget> {
  const name = getRequiredStringFlag(flags, 'target')
  const targetId = await resolveSshHostTargetId(client, name, [], `dolphin ${command} ${name}`)
  return readEditableTarget(client, targetId)
}

export const HOST_SETUP_HANDLERS: Record<string, CommandHandler> = {
  'host add': async ({ client, flags, json }) => {
    rejectRemote(flags, 'host add')
    const host = getRequiredStringFlag(flags, 'address').trim()
    const user = getRequiredStringFlag(flags, 'user').trim()
    const port = readPort(flags)
    const identityFile = getOptionalStringFlag(flags, 'identity-file')
    const label = getOptionalStringFlag(flags, 'label')?.trim() || host
    const existing = (await listEditableTargets(client)).find((target) =>
      sameEndpoint(target, host, user, port)
    )
    const target =
      existing ??
      (
        await client.call<{ target: SshEditableTarget }>('ssh.addTarget', {
          target: { label, host, port, username: user, ...(identityFile ? { identityFile } : {}) }
        })
      ).result.target
    const doctor =
      flags.get('install-server') === true ? await diagnose(client, target, 'always') : undefined
    const result = {
      target: toDoctorTarget(target),
      created: existing === undefined,
      ...(doctor ? { doctor } : {})
    }
    printResult(
      { id: 'local', ok: true, result, _meta: { runtimeId: 'local' } },
      json,
      formatHostAdd
    )
    if (doctor && !doctor.ok) {
      process.exitCode = 1
    }
  },
  'host connect': (context) => checkHost(context, 'host connect', 'always'),
  'host doctor': (context) => checkHost(context, 'host doctor', 'disconnected')
}

async function checkHost(
  { client, flags, json }: HandlerContext,
  command: 'host connect' | 'host doctor',
  connectWhen: 'always' | 'disconnected'
): Promise<void> {
  rejectRemote(flags, command)
  const target = await resolveTarget(client, flags, command)
  const report = await diagnose(client, target, connectWhen)
  printResult(
    { id: 'local', ok: true, result: report, _meta: { runtimeId: 'local' } },
    json,
    formatHostDoctorReport
  )
  if (!report.ok) {
    process.exitCode = 1
  }
}
