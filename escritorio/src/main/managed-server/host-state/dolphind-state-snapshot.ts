// Snapshots protect older builds from in-place state migrations; never restore live daemon sockets, PID records or auth tokens.
import {
  currentDolphindFence,
  DOLPHIND_FENCE_LOST_EXIT,
  DOLPHIND_FENCE_LOST_MARKER,
  posixDolphindFenceGuard,
  posixDolphindFenceOwnedTest,
  type DolphindFence
} from '../activation/dolphind-activation-fence-scope'
import { quotePosixShell } from '../../../shared/shell/launch/shell-argument-quoting'
import {
  isWindowsRemoteHost,
  joinRemotePath,
  type RemoteHostPlatform
} from '../../ssh/remote-host/ssh-remote-platform'
import type { DolphindWindowsHostStateOp } from './dolphind-windows-host-state-ops'
import { pruneDolphindSnapshotsScript } from './dolphind-state-snapshot-space'
import {
  DOLPHIND_SNAPSHOT_FAILURE,
  DOLPHIND_SNAPSHOT_MEMBERS,
  DOLPHIND_STATE_MUTATION_BUSY,
  DOLPHIND_STATE_MUTATION_DEADLINE,
  DOLPHIND_STATE_MUTATION_FENCE_HEARTBEAT_SECONDS,
  DOLPHIND_STATE_MUTATION_LOCK_DIRNAME,
  DOLPHIND_STATE_RESTORE_STAGE_DIRNAME
} from './dolphind-state-snapshot-members'
import { dolphindWindowsHostOpCommand } from '../install/dolphind-remote-windows-node'
import {
  posixStateMutationGroupRecord,
  posixStateMutationPidRecord
} from './dolphind-state-mutation-owner-record'

/** Validate bare shell member words and send each path once to stay under gateway command limits (#30491). */
function plainMemberWords(): string {
  for (const member of DOLPHIND_SNAPSHOT_MEMBERS) {
    if (!/^[A-Za-z0-9._-]+$/.test(member)) {
      throw new Error(`Unsafe dolphind snapshot member name: ${JSON.stringify(member)}`)
    }
  }
  return DOLPHIND_SNAPSHOT_MEMBERS.join(' ')
}

function windowsStateCommand(
  host: RemoteHostPlatform,
  baseDir: string,
  op: DolphindWindowsHostStateOp,
  args: string[]
): string | null {
  if (!isWindowsRemoteHost(host)) {
    return null
  }
  return dolphindWindowsHostOpCommand(host, baseDir, op, args)
}

/** Host deadline; client observation lasts one minute longer. */
export const DOLPHIND_STATE_MUTATION_DEADLINE_SECONDS = 15 * 60

/** Host serialization and deadline survive SSH channel loss, preventing overlapping restores after client timeout. */
export function serializedStateMutationCommand(
  baseDir: string,
  script: string,
  heartbeatSeconds = DOLPHIND_STATE_MUTATION_FENCE_HEARTBEAT_SECONDS,
  // Calls outside a held activation fence must not refresh any fence.
  owned: DolphindFence | null = currentDolphindFence()
): string {
  const lock = quotePosixShell(`${baseDir}/${DOLPHIND_STATE_MUTATION_LOCK_DIRNAME}`)
  const busy = `echo ${DOLPHIND_STATE_MUTATION_BUSY}; exit 0;`
  const staleMinutes = Math.max(1, Math.ceil((3 * heartbeatSeconds) / 60))
  const guarded = [
    `lock=${lock};`,
    `mkdir -p ${quotePosixShell(baseDir)} 2>/dev/null;`,
    'if ! mkdir "$lock" 2>/dev/null; then',
    'holder=$(cat "$lock/pid" 2>/dev/null); group=$(cat "$lock/pgid" 2>/dev/null);',
    // Exclusive PID publication makes resumed contenders back off; no PID means work never started.
    'if [ -z "$holder" ]; then',
    `[ -n "$(find "$lock" -maxdepth 0 -mmin +1 2>/dev/null)" ] || { ${busy} };`,
    // A dead shell can leave tar/rm alive; any surviving process-group member still holds the lock.
    `elif [ -n "$group" ]; then kill -0 "-$group" 2>/dev/null && { ${busy} };`,
    // Without group proof, retain live PIDs or recent heartbeats.
    `elif kill -0 "$holder" 2>/dev/null || [ -z "$(find "$lock" -maxdepth 0 -mmin +${staleMinutes} 2>/dev/null)" ]; then ${busy}`,
    'fi;',
    `rm -rf "$lock"; mkdir "$lock" 2>/dev/null || { ${busy} }; fi;`,
    posixStateMutationPidRecord('"$lock"', busy),
    // Recheck after mutation-lock acquisition because fence takeover holds that lock too.
    owned
      ? `${posixDolphindFenceOwnedTest(owned)} || { rm -rf "$lock"; echo ${DOLPHIND_FENCE_LOST_MARKER}; exit ${DOLPHIND_FENCE_LOST_EXIT}; };`
      : '',
    posixStateMutationGroupRecord('"$lock"'),
    // Refresh only the owned fence with touch -c; never recreate a released fence or keep a successor fresh.
    `beat_fence() { touch -c -m "$lock" 2>/dev/null; ${
      owned
        ? `${posixDolphindFenceOwnedTest(owned)} && touch -c -m ${quotePosixShell(owned.lockDir)} 2>/dev/null;`
        : ':;'
    } };`,
    'beat_fence;',
    `( while sleep ${heartbeatSeconds} && kill -0 $$ 2>/dev/null; do beat_fence; done ) >/dev/null 2>&1 & beat=$!;`,
    // Reap quietly because gateways can merge job notices into verdict stdout.
    `trap 'kill "$beat" 2>/dev/null; wait "$beat" 2>/dev/null; rm -rf "$lock"' EXIT;`,
    script
  ].join(' ')
  const run = `sh -c ${quotePosixShell(guarded)}`
  return [
    // Superseded holders must refuse before acquiring the mutation lock.
    ...(owned ? [posixDolphindFenceGuard(owned)] : []),
    // Own the workload process group so teardown can account for every spawned mutation process.
    'dolphin_state_group() { if command -v setsid >/dev/null 2>&1; then DOLPHIN_STATE_MUTATION_GROUP=1 setsid "$@";',
    `elif command -v perl >/dev/null 2>&1; then DOLPHIN_STATE_MUTATION_GROUP=1 perl -e ${quotePosixShell('setpgrp(0, 0); exec { $ARGV[0] } @ARGV or exit 127')} "$@";`,
    'else "$@"; fi; };',
    // Run timeout inside the group so KILL reaches tar/rm; use word lists once and retain old BusyBox -t support.
    `dolphin_deadline=; if timeout 1 true 2>/dev/null; then dolphin_deadline="timeout -s KILL ${DOLPHIND_STATE_MUTATION_DEADLINE_SECONDS}";`,
    `elif timeout -t 1 true 2>/dev/null; then dolphin_deadline="timeout -t ${DOLPHIND_STATE_MUTATION_DEADLINE_SECONDS} -s KILL"; fi;`,
    `dolphin_state_group $dolphin_deadline ${run};`,
    `status=$?; ${owned ? `[ "$status" -eq ${DOLPHIND_FENCE_LOST_EXIT} ] && exit ${DOLPHIND_FENCE_LOST_EXIT}; ` : ''}if [ "$status" -eq 124 ] || [ "$status" -eq 137 ]; then echo ${DOLPHIND_STATE_MUTATION_DEADLINE}; fi`
  ].join(' ')
}

export function dolphindSnapshotDirName(fullVersion: string, takenAtMs: number): string {
  // Repeated attempts at the same version need distinct snapshots.
  return `pre-${fullVersion}-${takenAtMs}`
}

/** Preserve incumbent state so interrupted rollback can restore it. */
export function dolphindRollbackRescueDirName(fullVersion: string, takenAtMs: number): string {
  return `rollback-rescue-${fullVersion}-${takenAtMs}`
}

/** Report EMPTY without fabricating a restorable archive; publish complete captures and remove failed partials before retry. */
export function captureDolphindStateSnapshotCommand(
  host: RemoteHostPlatform,
  userDataDir: string,
  snapshotDir: string,
  baseDir: string,
  prune?: { snapshotsRoot: string; keep: readonly string[] }
): string {
  const windows = windowsStateCommand(host, baseDir, 'snapshot-capture', [userDataDir, snapshotDir])
  if (windows) {
    return windows
  }
  return serializedStateMutationCommand(
    baseDir,
    [
      `root=${quotePosixShell(userDataDir)}; dir=${quotePosixShell(snapshotDir)};`,
      `archive="$dir"/state.tar;`,
      `snapshot_fail() { printf '${DOLPHIND_SNAPSHOT_FAILURE} %s\\n' "$(printf %s "$1" | tr '\\n' ' ' | cut -c 1-400)"; echo FAILED; exit 0; };`,
      prune ? pruneDolphindSnapshotsScript(prune.snapshotsRoot, prune.keep) : '',
      // Members intentionally undergo shell word splitting into separate tar arguments.
      `members=; for m in ${plainMemberWords()}; do`,
      'if [ -e "$root/$m" ] || [ -L "$root/$m" ]; then',
      'links=$(find "$root/$m" -type l -print 2>&1) && [ -z "$links" ] ||',
      'snapshot_fail "$m holds a symbolic link or an entry Dolphin cannot read: $links";',
      'members="$members $m"; fi; done;',
      // Set umask before directory creation so the whole snapshot is owner-only.
      'if [ -z "$members" ]; then echo EMPTY; else umask 077;',
      // Publish only a completed tar; interrupted capture must never look restorable.
      'if err=$( { mkdir -p "$dir" && tar -C "$root" -cf "$archive.partial" $members &&',
      'mv "$archive.partial" "$archive"; } 2>&1 ); then echo CAPTURED; else',
      'rm -f "$archive.partial"; rmdir "$dir" 2>/dev/null; snapshot_fail "$err"; fi; fi'
    ].join(' ')
  )
}

type DolphindSnapshotCapture = 'captured' | 'empty' | 'failed'

/** Scan known verdict lines because gateways can append merged stderr after completion (#30491). */
function lastVerdict(output: string, verdicts: readonly string[]): string | undefined {
  return output
    .split('\n')
    .map((line) => line.trim())
    .findLast((line) => verdicts.includes(line))
}

export function parseDolphindSnapshotCapture(output: string): DolphindSnapshotCapture {
  const value = lastVerdict(output, ['CAPTURED', 'EMPTY', 'FAILED'])
  if (value === 'CAPTURED') {
    return 'captured'
  }
  return value === 'EMPTY' ? 'empty' : 'failed'
}

export function probeDolphindStateSnapshotCommand(
  host: RemoteHostPlatform,
  snapshotDir: string,
  baseDir: string
): string {
  const windows = windowsStateCommand(host, baseDir, 'snapshot-probe', [snapshotDir])
  if (windows) {
    return windows
  }
  const archive = quotePosixShell(joinRemotePath(host, snapshotDir, 'state.tar'))
  return `test -f ${archive} && echo PRESENT || echo ABSENT`
}

type DolphindSnapshotPresence = 'present' | 'absent' | 'unverifiable'

/** Missing probe evidence is unverifiable rather than absent. */
export function parseDolphindSnapshotPresence(output: string): DolphindSnapshotPresence {
  const value = lastVerdict(output, ['PRESENT', 'ABSENT', 'UNKNOWN'])
  if (value === 'PRESENT') {
    return 'present'
  }
  return value === 'ABSENT' ? 'absent' : 'unverifiable'
}

/** Caller must stop dolphind first; stage/extract before replacing only snapshot members, leaving daemon state untouched. */
export function restoreDolphindStateSnapshotCommand(
  host: RemoteHostPlatform,
  userDataDir: string,
  snapshotDir: string,
  baseDir: string
): string {
  const windows = windowsStateCommand(host, baseDir, 'snapshot-restore', [userDataDir, snapshotDir])
  if (windows) {
    return windows
  }
  const members = plainMemberWords()
  return serializedStateMutationCommand(
    baseDir,
    [
      `root=${quotePosixShell(userDataDir)};`,
      `archive=${quotePosixShell(joinRemotePath(host, snapshotDir, 'state.tar'))};`,
      `stage="$root"/${DOLPHIND_STATE_RESTORE_STAGE_DIRNAME};`,
      'test -f "$archive" || { echo MISSING; exit 0; };',
      'umask 077;',
      'test -d "$root" || mkdir -p "$root";',
      // Re-extract intact archives so interrupted restoration can safely restart.
      'rm -rf "$stage"; mkdir -p "$stage" || { echo FAILED; exit 0; };',
      // Validate all archived bytes before deleting live state.
      'tar -C "$stage" -xf "$archive" 2>/dev/null || { rm -rf "$stage"; echo FAILED; exit 0; };',
      `ok=; for m in ${members}; do [ -e "$stage/$m" ] && ok=1; done;`,
      '[ -n "$ok" ] || { rm -rf "$stage"; echo FAILED; exit 0; };',
      removeMembersCommand(members),
      `[ -n "$ok" ] && for m in ${members}; do`,
      '[ ! -e "$stage/$m" ] || mv "$stage/$m" "$root/$m" || { ok=; break; }; done;',
      'if [ -n "$ok" ]; then rm -rf "$stage"; echo RESTORED; else echo FAILED; fi'
    ].join(' ')
  )
}

/** Clear candidate-written state when the original root was empty. */
export function clearDolphindStateSnapshotMembersCommand(
  host: RemoteHostPlatform,
  userDataDir: string,
  baseDir: string
): string {
  const windows = windowsStateCommand(host, baseDir, 'snapshot-clear', [userDataDir])
  if (windows) {
    return windows
  }
  return serializedStateMutationCommand(
    baseDir,
    [
      `root=${quotePosixShell(userDataDir)}; test -d "$root" || mkdir -p "$root"; ok=1;`,
      removeMembersCommand(plainMemberWords()),
      'if [ -n "$ok" ]; then echo RESTORED; else echo FAILED; fi'
    ].join(' ')
  )
}

function removeMembersCommand(members: string): string {
  return `[ -n "$ok" ] && for m in ${members}; do rm -rf "$root/$m" || { ok=; break; }; done;`
}

type DolphindSnapshotRestore = 'restored' | 'missing' | 'failed'

export function parseDolphindSnapshotRestore(output: string): DolphindSnapshotRestore {
  const value = lastVerdict(output, ['RESTORED', 'MISSING', 'FAILED'])
  if (value === 'RESTORED') {
    return 'restored'
  }
  return value === 'MISSING' ? 'missing' : 'failed'
}

/** Compare only after stopping the candidate; changed state cannot be handed to an older build. */
export function compareDolphindStateSnapshotCommand(
  host: RemoteHostPlatform,
  userDataDir: string,
  snapshotDir: string,
  baseDir: string
): string {
  const windows = windowsStateCommand(host, baseDir, 'snapshot-compare', [userDataDir, snapshotDir])
  if (windows) {
    return windows
  }
  const unknown = '{ echo UNKNOWN; exit 0; };'
  return [
    `root=${quotePosixShell(userDataDir)}; dir=${quotePosixShell(snapshotDir)};`,
    `archive="$dir"/state.tar;`,
    `test -d "$root" && test -r "$root" && test -x "$root" || ${unknown}`,
    `test -f "$archive" || ${unknown}`,
    `comparison=$(mktemp -d "$dir"/compare.XXXXXX) || ${unknown}`,
    `trap 'rm -rf "$comparison"' EXIT HUP INT TERM;`,
    `tar -C "$comparison" -xf "$archive" || ${unknown}`,
    `links=$(find "$comparison" -type l -print) && [ -z "$links" ] || ${unknown}`,
    `verdict=UNCHANGED; for m in ${plainMemberWords()}; do`,
    'if [ -e "$root/$m" ] || [ -L "$root/$m" ]; then',
    `links=$(find "$root/$m" -type l -print) && [ -z "$links" ] || ${unknown}`,
    'diff -r "$root/$m" "$comparison/$m" >/dev/null 2>&1 || verdict=CHANGED;',
    'elif [ -e "$comparison/$m" ] || [ -L "$comparison/$m" ]; then verdict=CHANGED; fi; done;',
    'echo "$verdict"'
  ].join(' ')
}

export function dolphindSnapshotIsUnchanged(output: string): boolean {
  return lastVerdict(output, ['UNCHANGED', 'CHANGED', 'UNKNOWN']) === 'UNCHANGED'
}
