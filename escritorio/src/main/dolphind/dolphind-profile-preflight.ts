import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { preflightProfileStateRuntime } from '../persistence/profile-state/startup/profile-state-runtime-preflight'
import {
  DOLPHIND_STARTUP_PREFLIGHT_FLAG,
  DOLPHIND_PROFILE_PREFLIGHT_TIMEOUT_MS,
  parseDolphindProfilePreflight,
  dolphindProfilePreflightResponseSchema,
  type DolphindProfilePreflightResponse
} from '../../shared/dolphind-profile-preflight'
import { readDolphindArtifactIdentity } from './dolphind-artifact-identity'
import { DOLPHIND_EXIT_CONFIGURATION } from './dolphind-configuration-exit'
import {
  DOLPHIND_SERVER_ENTRY_FILENAME,
  DOLPHIND_VERSION_FILENAME
} from '../../shared/dolphind-artifacts'
import { DOLPHIND_NODE_RUNTIME_IDENTITY } from '../../shared/dolphind-node-runtime-identity'
import { runProcess } from '@dolphin/process-host'
import { preflightDolphindNativeRuntime } from './dolphind-runtime-native-preflight'
import { dolphindCompileCacheEnv } from './dolphind-compile-cache'
import {
  consumeDolphindStartupQualification,
  discardDolphindStartupQualification,
  isQualifiableDolphindSlot,
  dolphindStartupQualificationKey,
  recordDolphindStartupQualification
} from './dolphind-startup-qualification'
import {
  isRunningAsBundledDolphindRuntime,
  DolphindBundledRuntimeError,
  resolveBundledDolphindSlot
} from './dolphind-bundled-runtime'

let pendingQualification: { directory: string; key: string } | null = null
// The last marker write; recording fails open, so it never rejects.
let markerRecording: Promise<void> = Promise.resolve()

/** Qualify packaged startup before touching profile indexes, data-root locks or imports. */
export async function preflightBundledDolphindStartup(): Promise<boolean> {
  const directory = resolveBundledDolphindSlot()
  if (!isRunningAsBundledDolphindRuntime(directory)) {
    return false
  }
  const identity = await readInstalledVersion(directory)
  // Windows' child also proves the process identity table, which depends on host services.
  const key =
    process.platform === 'win32' || !isQualifiableDolphindSlot(directory)
      ? null
      : await dolphindStartupQualificationKey(directory, identity).catch(() => null)
  if (key && (await consumeDolphindStartupQualification(directory, key))) {
    pendingQualification = { directory, key }
    return true
  }
  try {
    await runStartupPreflightChild(directory, identity)
  } catch (error) {
    if (key) {
      await discardDolphindStartupQualification(directory)
    }
    throw error
  }
  pendingQualification = key ? { directory, key } : null
  return false
}

/** node-pty failed to load at spawn: the next launch must re-probe and report why. */
export async function discardBundledDolphindStartupQualification(): Promise<void> {
  pendingQualification = null
  // A record still renaming its marker into place would recreate it after an earlier unlink.
  await markerRecording
  const directory = resolveBundledDolphindSlot()
  if (process.platform !== 'win32' && isQualifiableDolphindSlot(directory)) {
    await discardDolphindStartupQualification(directory)
  }
}

/** A launch whose node-pty probe did not pass must not let the next one skip either probe. */
export function forgetBundledDolphindStartupQualification(): void {
  pendingQualification = null
}

async function runStartupPreflightChild(directory: string, identity: string): Promise<void> {
  const nonce = randomUUID()
  // Keep disposable SQLite ownership and native state out of the serving process.
  const result = await runProcess({
    program: process.execPath,
    args: [join(directory, DOLPHIND_SERVER_ENTRY_FILENAME), DOLPHIND_STARTUP_PREFLIGHT_FLAG, nonce],
    // Reuse the serving runtime code cache for this identical bundle.
    env: { ...process.env, DOLPHIN_BACKGROUND_LAUNCH: '1', ...dolphindCompileCacheEnv(directory) },
    timeoutMs: DOLPHIND_PROFILE_PREFLIGHT_TIMEOUT_MS,
    maxOutputBytes: 64 * 1024,
    terminationBarrier: true
  })
  if (result.code !== 0 || result.timedOut || result.outputTruncated) {
    const Failure =
      result.code === DOLPHIND_EXIT_CONFIGURATION ? DolphindBundledRuntimeError : Error
    throw new Failure(`The bundled Dolphin runtime failed readiness: ${result.stderr}`)
  }
  try {
    parseDolphindProfilePreflight(result.stdout, nonce, DOLPHIND_NODE_RUNTIME_IDENTITY, identity)
  } catch (cause) {
    throw new DolphindBundledRuntimeError(
      'The bundled runtime returned invalid readiness identity',
      {
        cause
      }
    )
  }
}

/** Call once readiness is published: only a launch that got there lets the next one skip. */
export async function confirmBundledDolphindStartupQualified(): Promise<void> {
  const qualified = pendingQualification
  pendingQualification = null
  if (qualified) {
    markerRecording = recordDolphindStartupQualification(qualified.directory, qualified.key)
    await markerRecording
  }
}

export async function runDolphindProfilePreflight(
  nonce: string | undefined,
  options: { nativeFeatures?: boolean; servedUserDataPath?: string } = {}
): Promise<void> {
  const checkedNonce = z.string().uuid().parse(nonce)
  const directory = resolveBundledDolphindSlot()
  let artifactVersion: string
  try {
    artifactVersion = await readDolphindArtifactIdentity(directory)
  } catch (cause) {
    throw new DolphindBundledRuntimeError(
      'The bundled Dolphin artifacts are incomplete or altered',
      {
        cause
      }
    )
  }
  const result = await preflightProfileStateRuntime()
  // Host Node rollback launchers do not serve the bundled slot.
  if (isRunningAsBundledDolphindRuntime(directory)) {
    await preflightDolphindNativeRuntime(options)
  }
  const response: DolphindProfilePreflightResponse = {
    type: 'dolphin_profile_state_ready',
    nonce: checkedNonce,
    runtime: 'node',
    runtimeVersion: process.versions.node,
    artifactVersion,
    ...result,
    ...(options.servedUserDataPath === undefined
      ? {}
      : { liveDaemonProtocols: await readServedDaemonProtocols(options.servedUserDataPath) })
  }
  console.log(JSON.stringify(response))
}

/** The served data root, never this probe's own, decides which daemons a restart must reach. */
async function readServedDaemonProtocols(servedUserDataPath: string): Promise<number[] | null> {
  // A failed probe leaves the crossing unverifiable; it must not fail the candidate itself.
  try {
    // Import lazily: startup preflight loads this module and needs no daemon code.
    const [{ listLiveDaemonProtocols }, { daemonRuntimeDirFor }, protocol] = await Promise.all([
      import('../daemon/launch/daemon-generation-liveness'),
      import('../daemon/endpoint/publication/daemon-runtime-dir'),
      import('../daemon/protocol/daemon-protocol-version')
    ])
    return await listLiveDaemonProtocols(daemonRuntimeDirFor(servedUserDataPath), [
      protocol.PROTOCOL_VERSION,
      ...protocol.PREVIOUS_DAEMON_PROTOCOL_VERSIONS
    ])
  } catch {
    return null
  }
}

async function readInstalledVersion(directory: string): Promise<string> {
  try {
    return dolphindProfilePreflightResponseSchema.shape.artifactVersion.parse(
      (await readFile(join(directory, DOLPHIND_VERSION_FILENAME), 'utf8')).trim()
    )
  } catch (cause) {
    throw new DolphindBundledRuntimeError(
      'The installed Dolphin artifact version is missing or invalid',
      {
        cause
      }
    )
  }
}
