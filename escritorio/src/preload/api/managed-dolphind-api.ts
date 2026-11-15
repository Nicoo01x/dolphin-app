/** Managed dolphind servers over SSH; desktop-only, so web clients leave it undefined. */
import { ipcRenderer } from 'electron'
import type {
  DolphindDeltaMovePreview,
  DolphindDeltaMoveResult,
  DolphindManagedCancelStopResult,
  DolphindManagedConversionResult,
  DolphindManagedDeployResult,
  DolphindManagedForgetResult,
  DolphindManagedPastLiveTerminals,
  DolphindManagedPendingMigrationRow,
  DolphindManagedRecoveryResult,
  DolphindManagedRestartResult,
  DolphindManagedStaleLockReclaimRequest,
  DolphindManagedStaleLockReclaimResult,
  DolphindManagedRollbackResult,
  DolphindManagedRuntimeStatus,
  DolphindManagedStopResult
} from '../../shared/dolphind-managed-runtime'
import type {
  DolphindSshPendingProvisioning,
  DolphindSshProvisioningRequest,
  DolphindSshProvisioningResult
} from '../../shared/dolphind-ssh-provisioning'
import type { PublicKnownRuntimeEnvironment } from '../../shared/remote-runtime/host-catalog/runtime-environments'
import type { SshTargetAddResult } from '../../shared/ssh-types'
import type {
  RuntimeSshAccessLinkRequest,
  RuntimeSshAccessUnlinkRequest
} from '../../shared/runtime-ssh-access'

export type ManagedDolphindPreloadApi = {
  deploy: (args: {
    name: string
    sshTargetId: string
    force?: boolean
  }) => Promise<DolphindManagedDeployResult>
  /**
   * Register a brand-new SSH host and install the server on it in one call.
   *
   * `deploy` needs a host that is already registered, which is why connecting a machine used to
   * be two trips through settings. The request id makes this idempotent: the intent is written
   * before the host is contacted, so a crash or a closed dialog leaves a resumable request
   * instead of a half-registered machine.
   */
  createSshHost: (args: DolphindSshProvisioningRequest) => Promise<DolphindSshProvisioningResult>
  /** Finish a provisioning request whose install did not complete. */
  resumeSshHost: (args: { requestId: string }) => Promise<DolphindSshProvisioningResult>
  listPendingSshProvisioning: () => Promise<DolphindSshPendingProvisioning[]>
  getStatus: (args: { selector: string }) => Promise<DolphindManagedRuntimeStatus>
  update: (args: {
    selector: string
    force?: boolean
    pastLiveTerminals?: DolphindManagedPastLiveTerminals
  }) => Promise<DolphindManagedDeployResult>
  rollback: (args: { selector: string }) => Promise<DolphindManagedRollbackResult>
  recover: (args: {
    selector: string
    /** Restore the snapshot over state a rejected build changed; see DOLPHIND_RECOVERY_CHANGED_STATE_CODE. */
    acceptChangedState?: boolean
  }) => Promise<DolphindManagedRecoveryResult>
  /** Restarts from this client's SSH session; refused while terminals run. */
  restart: (args: { selector: string }) => Promise<DolphindManagedRestartResult>
  /** Without `yes`, only reports whether the host's instance lock may be cleared. */
  reclaimStaleLock: (
    args: { selector: string } & DolphindManagedStaleLockReclaimRequest
  ) => Promise<DolphindManagedStaleLockReclaimResult>
  stop: (args: { selector: string }) => Promise<DolphindManagedStopResult>
  cancelStop: (args: { selector: string }) => Promise<DolphindManagedCancelStopResult>
  forget: (args: { selector: string }) => Promise<DolphindManagedForgetResult>
  linkSshAccess: (args: RuntimeSshAccessLinkRequest) => Promise<PublicKnownRuntimeEnvironment>
  unlinkSshAccess: (args: RuntimeSshAccessUnlinkRequest) => Promise<PublicKnownRuntimeEnvironment>
  convertSshHost: (args: {
    sshTargetId: string
    name: string
  }) => Promise<DolphindManagedConversionResult>
  listPendingMigrations: () => Promise<DolphindManagedPendingMigrationRow[]>
  previewDeltaMove: (args: { sshTargetId: string }) => Promise<DolphindDeltaMovePreview>
  moveDelta: (args: { sshTargetId: string }) => Promise<DolphindDeltaMoveResult>
  keepServerVersion: (args: { sshTargetId: string }) => Promise<void>
  /** "Move anyway": the next connect leaves what can't move on this desktop. */
  allowMoveLeavingBehind: (args: { sshTargetId: string }) => Promise<void>
}

/**
 * Registrar una máquina e instalarle el servidor, en una sola llamada (Dolphin).
 *
 * Why así: la base borró `createDolphindSshHost` de main, pero las dos mitades siguen ahí. Un host
 * que vuelve con proyectos re-adoptados no puede tomar un servidor administrado: queda como host
 * SSH directo, que es un resultado y no un error.
 */
async function createSshHost({
  requestId,
  name,
  target
}: DolphindSshProvisioningRequest): Promise<DolphindSshProvisioningResult> {
  const added: SshTargetAddResult = await ipcRenderer.invoke('ssh:addTarget', { target })
  const base = {
    requestId,
    name,
    sshTargetId: added.target.id,
    repoReadoptions: added.repoReadoptions
  }
  if (added.repoReadoptions.length > 0) {
    return {
      ...base,
      result: {
        outcome: 'pending',
        reason:
          'This host already has Dolphin projects, so it was restored as a direct SSH host. ' +
          'Dolphin can only be set up on an empty host.'
      }
    }
  }
  const result: DolphindManagedDeployResult = await ipcRenderer.invoke(
    'runtimeEnvironments:deployDolphind',
    { name, sshTargetId: added.target.id }
  )
  return { ...base, result }
}

export const managedDolphindApi: ManagedDolphindPreloadApi = {
  deploy: (args) => ipcRenderer.invoke('runtimeEnvironments:deployDolphind', args),
  createSshHost,
  // Why: la base borró los pedidos reanudables (y sus canales de main). Sin la intención guardada no
  // hay pedido que retomar; lo que quedó a medias se termina con `deploy` sobre ese host.
  resumeSshHost: () =>
    Promise.reject(new Error('Resuming a server install is no longer supported.')),
  listPendingSshProvisioning: () => Promise.resolve([]),
  getStatus: (args) => ipcRenderer.invoke('runtimeEnvironments:getDolphindStatus', args),
  update: (args) => ipcRenderer.invoke('runtimeEnvironments:updateDolphind', args),
  rollback: (args) => ipcRenderer.invoke('runtimeEnvironments:rollbackDolphind', args),
  recover: (args) => ipcRenderer.invoke('runtimeEnvironments:recoverDolphind', args),
  restart: (args) => ipcRenderer.invoke('runtimeEnvironments:restartDolphind', args),
  reclaimStaleLock: (args) =>
    ipcRenderer.invoke('runtimeEnvironments:reclaimDolphindStaleLock', args),
  stop: (args) => ipcRenderer.invoke('runtimeEnvironments:stopDolphind', args),
  cancelStop: (args) => ipcRenderer.invoke('runtimeEnvironments:cancelDolphindStop', args),
  forget: (args) => ipcRenderer.invoke('runtimeEnvironments:forgetDolphind', args),
  linkSshAccess: (args) => ipcRenderer.invoke('runtimeEnvironments:linkSshAccess', args),
  unlinkSshAccess: (args) => ipcRenderer.invoke('runtimeEnvironments:unlinkSshAccess', args),
  convertSshHost: (args) =>
    ipcRenderer.invoke('runtimeEnvironments:convertSshHostToManagedDolphind', args),
  listPendingMigrations: () =>
    ipcRenderer.invoke('runtimeEnvironments:listPendingDolphindMigrations'),
  previewDeltaMove: (args) =>
    ipcRenderer.invoke('runtimeEnvironments:previewDolphindDeltaMove', args),
  moveDelta: (args) => ipcRenderer.invoke('runtimeEnvironments:moveDolphindDelta', args),
  keepServerVersion: (args) =>
    ipcRenderer.invoke('runtimeEnvironments:keepDolphindServerVersion', args),
  allowMoveLeavingBehind: (args) =>
    ipcRenderer.invoke('runtimeEnvironments:allowDolphindMoveLeavingBehind', args)
}
