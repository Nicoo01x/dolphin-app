export const DOLPHIND_PAIRING_REPAIR_FAILED_CODE = 'dolphind_pairing_repair_failed'

export class DolphindManagedPairingRepairFailedError extends Error {
  readonly code = DOLPHIND_PAIRING_REPAIR_FAILED_CODE
  constructor(reason: string) {
    super(
      `${DOLPHIND_PAIRING_REPAIR_FAILED_CODE}: the Dolphin server on this host no longer accepts this ` +
        `computer, and Dolphin couldn't pair with it again over SSH: ${reason}. Nothing on the host ` +
        `was stopped; its terminals can't be verified until Dolphin pairs again. Connect again to retry.`
    )
    this.name = 'DolphindManagedPairingRepairFailedError'
  }
}
