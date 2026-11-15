/** Whether any process runs from a dolphind slot: its server, or a terminal daemon a candidate spawned there, which outlives the candidate's stop. */
import { quotePosixShell } from '../../../shared/shell/launch/shell-argument-quoting'
import { posixProcessArgsShellFunction } from '../../managed-server/install/dolphind-remote-host-support'
import { isDolphindInstallDirLive } from '../../managed-server/install/dolphind-remote-gc'
import {
  execCommand,
  isUnconfirmedSshCommandTermination
} from '../../ssh/remote-exec/remote-exec-command'
import { joinRemotePath, type RemoteHostPlatform } from '../../ssh/remote-host/ssh-remote-platform'
import type { DolphindSlotOptions } from '../../managed-server/activation/dolphind-recovery-slot'

// Every shell running this probe carries it in argv, so the probe never counts itself.
const PROBE_MARKER = '__DOLPHIN_SLOT_PROCESS_PROBE__'

/** Prints LIVE, DEAD or UNKNOWN; anything unreadable is UNKNOWN. */
export function wslDolphindSlotProcessProbeCommand(
  host: RemoteHostPlatform,
  slotDir: string,
  userDataDir: string
): string {
  const slot = quotePosixShell(`${slotDir.replace(/\/+$/u, '')}/`)
  const daemonDir = quotePosixShell(joinRemotePath(host, userDataDir, 'daemon'))
  const inSlot =
    'grep -F -e "$dolphind_slot" -e "$dolphind_real/" | ' + `grep -vF -- ${PROBE_MARKER} | grep -q .`
  return [
    `dolphind_slot=${slot}; dolphind_ddir=${daemonDir}; : ${PROBE_MARKER};`,
    // Node realpaths its entry, so a daemon behind a symlinked home names the resolved slot.
    'dolphind_real=$(cd "$dolphind_slot" 2>/dev/null && pwd -P) && [ -n "$dolphind_real" ] || { echo UNKNOWN; exit 0; };',
    posixProcessArgsShellFunction(),
    // A live daemon whose pid file names it must be identified, not skipped.
    'for dolphind_df in "$dolphind_ddir"/daemon-v*.pid; do [ -f "$dolphind_df" ] || continue;',
    'dolphind_dp=$(sed -n \'s/.*"pid":\\([0-9][0-9]*\\).*/\\1/p\' "$dolphind_df" | head -n 1);',
    '[ -n "$dolphind_dp" ] || continue; kill -0 "$dolphind_dp" 2>/dev/null || continue;',
    'dolphind_da=$(dolphind_args "$dolphind_dp") || { echo UNKNOWN; exit 0; };',
    `printf '%s\\n' "$dolphind_da" | ${inSlot} && { echo LIVE; exit 0; };`,
    'done;',
    // Capture first so the filters below never list themselves.
    'if dolphind_all=$(ps -ww -eo args= 2>/dev/null) && [ -n "$dolphind_all" ]; then :;',
    'elif [ -r /proc/self/cmdline ]; then',
    'dolphind_all=$(for dolphind_p in /proc/[0-9]*; do tr "\\000" " " < "$dolphind_p/cmdline" 2>/dev/null; echo; done);',
    'else echo UNKNOWN; exit 0; fi;',
    `if printf '%s\\n' "$dolphind_all" | ${inSlot}; then echo LIVE; else echo DEAD; fi`
  ].join(' ')
}

/** True unless both the server's pid file and a process scan prove nothing runs from the slot. */
export async function isWslDolphindSlotInUse(
  slot: DolphindSlotOptions,
  slotDir: string
): Promise<boolean> {
  if (await isDolphindInstallDirLive(slot, slotDir)) {
    return true
  }
  try {
    const answer = await execCommand(
      slot.conn,
      wslDolphindSlotProcessProbeCommand(slot.host, slotDir, slot.userDataDir),
      { wrapCommand: true, signal: slot.signal }
    )
    return answer.trim().split('\n').at(-1)?.trim() !== 'DEAD'
  } catch (error) {
    if (isUnconfirmedSshCommandTermination(error)) {
      throw error
    }
    return true
  }
}
