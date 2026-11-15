import {
  DOLPHIND_BUILD_TARGET_FILENAME,
  DOLPHIND_LAUNCHER_FILENAME,
  DOLPHIND_SERVER_ENTRY_FILENAME,
  DOLPHIND_NODE_RUNTIME_DIR_PREFIX,
  DOLPHIND_NODE_RUNTIME_MARKER_FILENAME,
  DOLPHIND_NODE_RUNTIME_POSIX_EXECUTABLE,
  DOLPHIND_RUNTIMES_DIRNAME,
  dolphindBunRuntimeFilename
} from '../../../shared/dolphind-artifacts'
import { assertPosixDolphindHost } from './dolphind-remote-host-support'
import { quotePosixShell } from '../../../shared/shell/launch/shell-argument-quoting'
import { joinRemotePath, type RemoteHostPlatform } from '../../ssh/remote-host/ssh-remote-platform'

// Assign the long slot path once to reduce command size on the wire.
function assignDolphindSlot(directory: string): string {
  return `dolphind_slot=${quotePosixShell(directory.replace(/\/+$/, ''))}; `
}

// Rollback must still accept legacy single-entry slots.
export function selectDolphindSlotEntryCommand(host: RemoteHostPlatform, directory: string): string {
  assertPosixDolphindHost(host)
  const server = `"$dolphind_slot"/${quotePosixShell(DOLPHIND_SERVER_ENTRY_FILENAME)}`
  const launcher = `"$dolphind_slot"/${quotePosixShell(DOLPHIND_LAUNCHER_FILENAME)}`
  return `${assignDolphindSlot(directory)}if [ -f ${server} ]; then dolphind_entry=${server}; else dolphind_entry=${launcher}; fi`
}

/** Set $dolphind_runtime or exit 78; callers decide what an absent marker means. */
export function dolphindNodeSlotRuntimeCommand(host: RemoteHostPlatform, directory: string): string {
  assertPosixDolphindHost(host)
  const nodeMarker = `"$dolphind_slot"/${quotePosixShell(DOLPHIND_NODE_RUNTIME_MARKER_FILENAME)}`
  const nodeRuntimePrefix = `"\${dolphind_slot%/*}"/${quotePosixShell(
    `${DOLPHIND_RUNTIMES_DIRNAME}/${DOLPHIND_NODE_RUNTIME_DIR_PREFIX}`
  )}`
  const nodeExecutable = quotePosixShell(`/${DOLPHIND_NODE_RUNTIME_POSIX_EXECUTABLE}`)
  return (
    `${assignDolphindSlot(directory)}dolphind_node_sha=$(cat ${nodeMarker}) || exit 78; ` +
    // The digest becomes a path segment; reject non-SHA256 values.
    // Leading ( keeps the case pattern parseable inside command substitution.
    'case "$dolphind_node_sha" in ("" | *[!0-9a-f]*) exit 78;; esac; ' +
    '[ "${#dolphind_node_sha}" -eq 64 ] || exit 78; ' +
    `dolphind_runtime=${nodeRuntimePrefix}"$dolphind_node_sha"${nodeExecutable}; ` +
    '[ -x "$dolphind_runtime" ] || exit 78; '
  )
}

/** Keeps address space small under RLIMIT_AS: undici's WASM memory otherwise reserves 4-9 GiB (#37538).
 * Caps any WASM memory in dolphind at 64 MiB. Pinned Node only: older host Node rejects the flag. */
const DOLPHIND_PINNED_NODE_FLAGS = '--disable-wasm-trap-handler --wasm-max-mem-pages=1024'

/** Also sets $dolphind_runtime_flags. Legacy host Node fallback must never hide an incomplete Node or Bun slot. */
export function selectDolphindSlotRuntimeCommand(
  host: RemoteHostPlatform,
  directory: string,
  legacyNodePath: string
): string {
  assertPosixDolphindHost(host)
  const nodeMarker = quotePosixShell(
    joinRemotePath(host, directory, DOLPHIND_NODE_RUNTIME_MARKER_FILENAME)
  )
  const runtime = quotePosixShell(
    joinRemotePath(host, directory, dolphindBunRuntimeFilename(host.os))
  )
  const target = quotePosixShell(joinRemotePath(host, directory, DOLPHIND_BUILD_TARGET_FILENAME))
  return (
    // One compound command: launch chains it with && after cd.
    `if [ -e ${nodeMarker} ]; then ${dolphindNodeSlotRuntimeCommand(host, directory)}` +
    `dolphind_runtime_flags=${quotePosixShell(DOLPHIND_PINNED_NODE_FLAGS)}; ` +
    `elif [ -e ${target} ] || [ -e ${runtime} ]; then ` +
    `[ -x ${runtime} ] || exit 78; dolphind_runtime=${runtime}; dolphind_runtime_flags=; ` +
    `else dolphind_runtime=${quotePosixShell(legacyNodePath)}; dolphind_runtime_flags=; fi`
  )
}
