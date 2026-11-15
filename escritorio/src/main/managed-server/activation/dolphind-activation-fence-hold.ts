/** Retry live fences later, clear abandoned bare fences, and require recovery for interrupted journaled state. */
import {
  dolphindActivationFenceExists,
  withStaleDolphindActivationRecoveryLock,
  type DolphindActivationLockOptions
} from './dolphind-activation-lock'
import { readDolphindActivationTransaction } from './dolphind-activation-transaction-store'
import { dolphindActivationFenceLockDir } from './dolphind-activation-transaction'
import { isRelayInstallLockStale } from '../install/remote-install-lock'
import { findExitedOwnLockToken } from './dolphind-exited-own-lock'
import { dolphindRemoteBaseDir } from '../install/dolphind-remote-windows-node'

export const DOLPHIND_ACTIVATION_FENCE_BUSY_CODE = 'dolphind_activation_fence_busy'
const DOLPHIND_ACTIVATION_RECOVERY_REQUIRED_CODE = 'dolphind_activation_recovery_required'

type DolphindActivationFenceRefusal = {
  code: string
  reason: string
  /** Bare stale fence cleared; the caller may retry immediately. */
  cleared?: true
}

export async function dolphindActivationFenceRefusal(
  options: DolphindActivationLockOptions,
  attempt: string
): Promise<DolphindActivationFenceRefusal> {
  const lockDir = dolphindActivationFenceLockDir(options.host, options.remoteHome)
  const journal = (await readDolphindActivationTransaction(options).catch(() => null)) !== null
  const baseDir = dolphindRemoteBaseDir(options.host, options.remoteHome)
  const stale =
    (await findExitedOwnLockToken(options, lockDir, { baseDir, guardsStateMutation: true })) !==
      null || (await isRelayInstallLockStale(options.conn, lockDir, options.host))
  if (stale && !journal && (await clearAbandonedFence(options))) {
    return {
      code: DOLPHIND_ACTIVATION_FENCE_BUSY_CODE,
      reason: `An abandoned fence held this host and was cleared; the ${attempt} is retried.`,
      cleared: true
    }
  }
  const stuck =
    stale || (journal && !(await dolphindActivationFenceExists(options).catch(() => true)))
  return stuck
    ? {
        code: DOLPHIND_ACTIVATION_RECOVERY_REQUIRED_CODE,
        reason: `An interrupted update or stop holds this host, so the ${attempt} did not start. Recover it first.`
      }
    : {
        code: DOLPHIND_ACTIVATION_FENCE_BUSY_CODE,
        reason: `Another run is changing this host’s Dolphin server, so the ${attempt} did not start. It is retried on a later connect.`
      }
}

/** Drop a stale fence only after rechecking under takeover that no journal appeared. */
async function clearAbandonedFence(options: DolphindActivationLockOptions): Promise<boolean> {
  try {
    return await withStaleDolphindActivationRecoveryLock(options, async (lock) => {
      if (await readDolphindActivationTransaction(options)) {
        lock.retain()
        return false
      }
      return true
    })
  } catch {
    // Failed takeover leaves the fence intact for normal refusal classification.
    return false
  }
}
