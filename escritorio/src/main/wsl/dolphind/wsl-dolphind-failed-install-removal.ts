/** A slot this connect uploaded whose candidate then failed its start check is deleted, so the next connect re-uploads it instead of relaunching the same broken bytes. */
import { readDolphindActivationRecord } from '../../managed-server/activation/dolphind-activation-record-store'
import { dolphindGcPinnedDirNames } from '../../managed-server/activation/dolphind-activation-record'
import {
  probeDolphindSlotReadiness,
  provenLiveDaemonVersion
} from '../../managed-server/lifecycle/dolphind-managed-version-gc'
import { withDolphindActivationLock } from '../../managed-server/activation/dolphind-activation-lock'
import { removeRemoteInstallVersionDir } from '../../managed-server/install/remote-install-gc'
import {
  DOLPHIND_INSTALL_MODEL,
  remoteInstallDirName
} from '../../managed-server/install/remote-install-model'
import { readDolphindGcTransactionPins } from '../../managed-server/activation/dolphind-gc-transaction-pins'
import {
  dolphindSlotDir,
  type DolphindSlotOptions
} from '../../managed-server/activation/dolphind-recovery-slot'
import type { DolphindDeployResult } from '../../managed-server/install/dolphind-remote-deploy'
import { isWslDolphindSlotInUse } from './wsl-dolphind-slot-process-probe'

export async function removeFailedFreshWslDolphindInstall(
  slot: DolphindSlotOptions,
  deployed: DolphindDeployResult
): Promise<void> {
  if (
    deployed.outcome !== 'installed-not-activated' ||
    !deployed.startCheckFailed ||
    !deployed.freshlyInstalled
  ) {
    return
  }
  const version = deployed.fullVersion
  try {
    // Under the activation fence, so no activator can preflight or launch this slot meanwhile.
    const outcome = await withDolphindActivationLock(
      slot,
      async () => {
        if (!(await mayRemove(slot, version))) {
          return 'pinned'
        }
        const removed = await removeRemoteInstallVersionDir(
          slot.conn,
          DOLPHIND_INSTALL_MODEL,
          dolphindSlotDir(slot, version),
          slot.host,
          { isDirLive: (dir) => isWslDolphindSlotInUse(slot, dir) }
        )
        return removed ? 'removed' : 'in-use'
      },
      () => 'fenced'
    )
    console.warn(
      outcome === 'removed'
        ? `[wsl-dolphind] Removed dolphind ${version}, which failed its start check after install.`
        : `[wsl-dolphind] Kept failed dolphind ${version} (${outcome}): it may still be in use.`
    )
  } catch (error) {
    // The connect already failed; a cleanup error must not replace its reason.
    console.warn(`[wsl-dolphind] Could not remove failed dolphind ${version}:`, error)
  }
}

/** The GC's pins: active, rollback target, the active daemon's build and any journaled slot. */
async function mayRemove(slot: DolphindSlotOptions, version: string): Promise<boolean> {
  const dirName = remoteInstallDirName(DOLPHIND_INSTALL_MODEL, version)
  const record = await readDolphindActivationRecord(slot)
  // Nothing active serves terminals; a daemon the rejected candidate left here is caught by the process probe.
  const liveDaemonVersion = record.active
    ? provenLiveDaemonVersion(await probeDolphindSlotReadiness(slot, record.active))
    : null
  if (liveDaemonVersion === undefined) {
    return false
  }
  if (dolphindGcPinnedDirNames(record, liveDaemonVersion).includes(dirName)) {
    return false
  }
  const transaction = await readDolphindGcTransactionPins(slot, { callerHoldsFence: true })
  return transaction.state === 'pinned' && !transaction.dirNames.includes(dirName)
}
