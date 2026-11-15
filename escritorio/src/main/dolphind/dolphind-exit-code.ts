import { DolphindBindAddressError } from '../../shared/dolphind-bind-address'
import { DolphindBundledRuntimeError } from './dolphind-bundled-runtime'
import { DolphindInstanceLockError } from './dolphind-data-root-privacy'
import { ProfileStateAccessError } from '../persistence/profile-state/access/profile-state-access-error'
import { DOLPHIND_EXIT_CONFIGURATION } from './dolphind-configuration-exit'
import { SINGLE_INSTANCE_ALREADY_RUNNING_EXIT_CODE } from '../../shared/single-instance-exit-code'
import { DOLPHIND_EXIT_TERMINALS_NOT_DURABLE } from '../../shared/serve-supervised-terminal-durability'
import { DolphindTerminalsNotDurableError } from './dolphind-serve-supervision'

export const DOLPHIND_EXIT_FAILED = 1

export function resolveDolphindExitCode(error: unknown): number {
  // Supervisors wait for an existing holder instead of abandoning the host.
  if (
    error instanceof DolphindInstanceLockError &&
    error.code === 'dolphind_instance_lock_holder_unverifiable'
  ) {
    return SINGLE_INSTANCE_ALREADY_RUNNING_EXIT_CODE
  }
  if (error instanceof DolphindTerminalsNotDurableError) {
    return DOLPHIND_EXIT_TERMINALS_NOT_DURABLE
  }
  return error instanceof DolphindInstanceLockError ||
    error instanceof DolphindBindAddressError ||
    error instanceof DolphindBundledRuntimeError ||
    error instanceof ProfileStateAccessError
    ? DOLPHIND_EXIT_CONFIGURATION
    : DOLPHIND_EXIT_FAILED
}
