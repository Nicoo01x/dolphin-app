import { NODE_RUNTIME_PIN } from './node-runtime-pin'
import type { DolphindPreflightRuntimeIdentity } from './dolphind-profile-preflight'

/** What a Node slot's candidate must report: the pinned runtime, never a host Node. */
export const DOLPHIND_NODE_RUNTIME_IDENTITY: DolphindPreflightRuntimeIdentity = {
  runtime: 'node',
  runtimeVersion: NODE_RUNTIME_PIN.version
}
