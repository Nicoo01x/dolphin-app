import type { SshConnectionState } from '../../shared/ssh-types'
import type { SshConnectionFailure } from '../../shared/ssh-connect-failure-kind'
import { redactAgentDiagnosticText } from '../../shared/agent-diagnostic-redaction'
import { hostDoctorHints, type HostDoctorTarget } from './host-doctor-hints'

export type { HostDoctorTarget }

export type HostDoctorCheck = {
  name: 'ssh' | 'server'
  status: 'pass' | 'warn' | 'fail'
  detail: string
}

export type HostDoctorReport = {
  ok: boolean
  target: HostDoctorTarget & { selector: string }
  /** The SSH lifecycle status after the check, or `disconnected` when there is none. */
  connection: string
  /** `running` once Dolphin's server answers on the host. */
  server: 'running' | 'not-answering' | 'not-running' | 'unknown'
  platform?: string
  /** Stable code: `auth`, `timeout`, `refused`, `host-key`, `server:unavailable:<cause>`, … */
  reason?: string
  nextStep?: string
  checks: HostDoctorCheck[]
  /** Concrete commands to run on this computer or the host, in order. */
  nextSteps: string[]
  connectAttempted: boolean
}

const SERVER_NOT_ANSWERING =
  'Dolphin’s server is installed on this host but did not answer. Run `dolphin host connect` again; if it keeps failing, `dolphin environment status --environment <name>` shows its state.'

function serverState(state: SshConnectionState | null): HostDoctorReport['server'] {
  const server = state?.managedServer
  if (server?.kind === 'managed') {
    return server.serving ? 'not-answering' : 'running'
  }
  if (server?.kind === 'relay') {
    return 'not-running'
  }
  return state?.status === 'connected' ? 'not-running' : 'unknown'
}

/** Old runtimes have no `lastFailure`; their generic message still tells auth apart. */
function fallbackFailure(connectError: string | undefined): SshConnectionFailure | undefined {
  if (!connectError) {
    return undefined
  }
  return /authentication failed/i.test(connectError)
    ? { reason: 'auth', nextStep: 'The host refused the sign-in. Check the user name and SSH key.' }
    : { reason: 'unknown', nextStep: redactAgentDiagnosticText(connectError) }
}

function sshCheck(connected: boolean, failure: SshConnectionFailure | undefined): HostDoctorCheck {
  if (connected) {
    return { name: 'ssh', status: 'pass', detail: 'SSH connects and signs in.' }
  }
  const sshFailure = failure && !failure.reason.startsWith('server:')
  return {
    name: 'ssh',
    status: sshFailure || !failure ? 'fail' : 'pass',
    detail: sshFailure
      ? failure.nextStep
      : failure
        ? 'SSH reached the host; the failure came after, while setting up Dolphin’s server.'
        : 'Not connected, and no reason was recorded. Connect it with `dolphin host connect`.'
  }
}

function serverCheck(
  server: HostDoctorReport['server'],
  failure: SshConnectionFailure | undefined
): HostDoctorCheck {
  switch (server) {
    case 'running':
      return { name: 'server', status: 'pass', detail: 'Dolphin’s server runs on this host.' }
    case 'not-answering':
      return { name: 'server', status: 'warn', detail: SERVER_NOT_ANSWERING }
    default:
      return {
        name: 'server',
        status: 'fail',
        detail:
          failure?.reason.startsWith('server:') === true
            ? failure.nextStep
            : 'Dolphin’s server is not running here yet; it is set up when SSH connects.'
      }
  }
}

export function buildHostDoctorReport(args: {
  target: HostDoctorTarget
  state: SshConnectionState | null
  lastFailure?: SshConnectionFailure
  connectError?: string
  connectAttempted: boolean
}): HostDoctorReport {
  const { target, state } = args
  const connected = state?.status === 'connected'
  const server = serverState(state)
  const rawFailure =
    connected && server === 'running'
      ? undefined
      : (args.lastFailure ?? fallbackFailure(args.connectError))
  const failure = rawFailure
    ? { reason: rawFailure.reason, nextStep: redactAgentDiagnosticText(rawFailure.nextStep) }
    : undefined
  const checks = [sshCheck(connected, failure), serverCheck(server, failure)]
  // Ready means what the person asked for: connected, with the server answering there.
  const ok = connected && server === 'running'
  return {
    ok,
    target: { ...target, selector: `ssh:${target.id}` },
    connection: state?.status ?? 'disconnected',
    server,
    ...(state?.remotePlatform ? { platform: state.remotePlatform } : {}),
    ...(failure ? { reason: failure.reason, nextStep: failure.nextStep } : {}),
    checks,
    nextSteps: hostDoctorHints(target, failure?.reason, ok),
    connectAttempted: args.connectAttempted
  }
}

export function formatHostDoctorReport(report: HostDoctorReport): string {
  const { target } = report
  const lines = [
    `host: ${target.label} (${target.selector})  ${target.endpoint}`,
    `connection: ${report.connection}${report.platform ? `  platform: ${report.platform}` : ''}`,
    `server: ${report.server}`,
    ...(report.reason ? [`reason: ${report.reason}`] : []),
    ...report.checks.map((check) => `[${check.status}] ${check.name}: ${check.detail}`)
  ]
  if (report.nextSteps.length > 0) {
    lines.push('next steps:', ...report.nextSteps.map((step, index) => `  ${index + 1}. ${step}`))
  }
  lines.push(report.ok ? 'OK: this host is connected and ready.' : 'Not ready yet.')
  return lines.join('\n')
}
