// Decorate logged errors with a bounded redacted host tail, never telemetry; missing host evidence preserves the original failure.
import { redactString } from '../../observability/redactor'
import { quotePosixShell } from '../../../shared/shell/launch/shell-argument-quoting'
import { DOLPHIND_LOG_FILENAME } from './dolphind-remote-host-support'
import { execCommand } from '../../ssh/remote-exec/remote-exec-command'
import {
  isWindowsRemoteHost,
  joinRemotePath,
  type RemoteHostPlatform
} from '../../ssh/remote-host/ssh-remote-platform'
import {
  dolphindWindowsSlotOpCommand,
  readDolphindWindowsEncodedAnswer
} from './dolphind-remote-windows-node'
import { DOLPHIND_WINDOWS_LOG_TAIL_MARKER } from '../host-state/dolphind-windows-host-script'
import type { DolphindRemoteExecTarget } from './dolphind-remote-runtime-control'

export const DOLPHIND_LOG_TAIL_LINES = 40
export const DOLPHIND_LOG_TAIL_MAX_BYTES = 8 * 1024
// Error decoration must not add an unbounded delay.
const DOLPHIND_LOG_TAIL_TIMEOUT_MS = 10_000

export function dolphindLogTailCommand(host: RemoteHostPlatform, slotDir: string): string {
  const log = joinRemotePath(host, slotDir, DOLPHIND_LOG_FILENAME)
  if (isWindowsRemoteHost(host)) {
    return dolphindWindowsSlotOpCommand(host, slotDir, 'log-tail', [
      log,
      String(DOLPHIND_LOG_TAIL_MAX_BYTES)
    ])
  }
  return `tail -c ${DOLPHIND_LOG_TAIL_MAX_BYTES} ${quotePosixShell(log)} 2>/dev/null || true`
}

export function parseDolphindLogTail(host: RemoteHostPlatform, output: string): string | null {
  const raw = isWindowsRemoteHost(host)
    ? (readDolphindWindowsEncodedAnswer(output, DOLPHIND_WINDOWS_LOG_TAIL_MARKER) ?? '')
    : output
  const bounded = Buffer.from(raw, 'utf8').subarray(-DOLPHIND_LOG_TAIL_MAX_BYTES).toString('utf8')
  const lines = bounded.replace(/\s+$/u, '').split(/\r?\n/u).slice(-DOLPHIND_LOG_TAIL_LINES)
  const tail = redactString(lines.join('\n'))
  return tail.trim() ? tail : null
}

async function readDolphindLogTail(
  target: DolphindRemoteExecTarget,
  slotDir: string
): Promise<string | null> {
  try {
    // Observe cancellation failures without reusing the already-aborted request signal.
    const output = await execCommand(target.conn, dolphindLogTailCommand(target.host, slotDir), {
      wrapCommand: target.host.commandDialect !== 'powershell',
      timeoutMs: DOLPHIND_LOG_TAIL_TIMEOUT_MS
    })
    return parseDolphindLogTail(target.host, output)
  } catch (error) {
    console.warn('[ssh] Could not read the dolphind.log tail:', error)
    return null
  }
}

export async function withDolphindLogTail(
  target: DolphindRemoteExecTarget,
  slotDir: string,
  message: string
): Promise<string> {
  const tail = await readDolphindLogTail(target, slotDir)
  return tail ? `${message}\nLast lines of dolphind.log:\n${tail}` : message
}
