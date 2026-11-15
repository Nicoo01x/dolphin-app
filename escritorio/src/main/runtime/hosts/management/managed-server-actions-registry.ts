/** Desktop main publishes managed-server actions for runtime RPC; headless hosts without a registry advertise none. */
import type {
  DolphindManagedPastLiveTerminals,
  DolphindManagedCancelStopResult,
  DolphindManagedDeployResult,
  DolphindManagedForgetResult,
  DolphindManagedRecoveryResult,
  DolphindManagedRollbackResult,
  DolphindManagedRuntimeStatus,
  DolphindManagedStopResult
} from '../../../../shared/dolphind-managed-runtime'

export type ManagedServerActions = {
  status: (selector: string) => Promise<DolphindManagedRuntimeStatus>
  update: (
    selector: string,
    force: boolean,
    pastLiveTerminals?: DolphindManagedPastLiveTerminals
  ) => Promise<DolphindManagedDeployResult>
  rollback: (selector: string) => Promise<DolphindManagedRollbackResult>
  /** `acceptChangedState` restores the snapshot over state a rejected build changed. */
  recover: (selector: string, acceptChangedState?: boolean) => Promise<DolphindManagedRecoveryResult>
  stop: (selector: string) => Promise<DolphindManagedStopResult>
  cancelStop: (selector: string) => Promise<DolphindManagedCancelStopResult>
  forget: (selector: string) => Promise<DolphindManagedForgetResult>
  /** Forget only while another saved entry still manages the same server. */
  forgetRedundant: (selector: string) => Promise<DolphindManagedForgetResult>
}

let registered: ManagedServerActions | null = null

export function registerManagedServerActions(actions: ManagedServerActions | null): void {
  registered = actions
}

export function getManagedServerActions(): ManagedServerActions | null {
  return registered
}
