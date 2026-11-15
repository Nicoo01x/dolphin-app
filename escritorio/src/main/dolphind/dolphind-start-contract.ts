import type { ServeReadiness } from '../server/serve-readiness'
import type { DolphindManagedStopContext } from '../../shared/dolphind-stop-request'

export type DolphindOptions = {
  port?: number
  json?: boolean
  noPairing?: boolean
  pairingAddress?: string
  /** Request a mobile-scoped pairing offer and terminal QR. */
  mobilePairing?: boolean
  grantDesktopControl?: boolean
  /** Print only the ephemeral-VM recipe line. */
  recipeJson?: boolean
  projectRoot?: string
  bind?: string
  /** Say out loud that `--bind` means the open internet. Without it a public address is
   *  refused; see `bindHostIsPublic`. */
  exposeToPublicNetwork?: boolean
  /** Accept clients from public addresses, not only localhost, LAN and Tailscale. */
  allowPublic?: boolean
  /** Refuse public addresses even when grandfathered or otherwise accepted. */
  refusePublic?: boolean
  /** Slots have no browser client; dolphin serve supplies the installed app client. */
  webClientRoot?: string
}

export type DolphindHandle = {
  readiness: ServeReadiness
  managedStop: DolphindManagedStopContext
  stop(): Promise<void>
}
