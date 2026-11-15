import type { DolphindManagedRefusal } from './dolphind-managed-runtime'
import type { DolphindDaemonRetirementVerdict } from './dolphind-stop-request'

export type DolphindDecommissionResult =
  | {
      outcome: 'decommissioned'
      version: string
      /** The daemon's fate: `retired`, or kept with its terminals (`live`/`unverifiable`). */
      retirement: DolphindDaemonRetirementVerdict
    }
  | DolphindManagedRefusal
