import { isAgentSessionId } from './agent-session/lifecycle/agent-session-record'
import { isTerminalHandle } from './terminal-handle-prefix'
import { DOLPHIN_SESSION_ADDRESS_PREFIX } from './dolphin-session-address-prefix'

/** Dolphin-minted structured session identity (record id/DOLPHIN_AGENT_SESSION_ID), never provider identity. Orchestration stores bare lineage-root ids after /clear,
 * not live replacement ids; derive mail spelling orca_session_id:<id> alongside run:/dispatch: addresses.
 * Resolve execution location from records. PTYs have no id today; never use pane keys because later agents inherit panes. */
export { DOLPHIN_SESSION_ADDRESS_PREFIX }

declare const dolphinSessionIdBrand: unique symbol
declare const dolphinSessionAddressBrand: unique symbol

/** A bare Dolphin session id; only `isDolphinSessionId` and `parseDolphinSessionAddress` produce one. */
export type DolphinSessionId = string & { readonly [dolphinSessionIdBrand]: true }
/** An `orca_session_id:<id>` mail address; only `formatDolphinSessionAddress` produces one. */
export type DolphinSessionAddress = string & { readonly [dolphinSessionAddressBrand]: true }

export function isDolphinSessionId(id: string): id is DolphinSessionId {
  return isAgentSessionId(id) && !isTerminalHandle(id)
}

export function formatDolphinSessionAddress(
  dolphinSessionId: DolphinSessionId
): DolphinSessionAddress {
  const address = `${DOLPHIN_SESSION_ADDRESS_PREFIX}${dolphinSessionId}`
  // Always true for a checked id; the check brands the address without a type assertion.
  if (!isDolphinSessionAddress(address)) {
    throw new Error(`Not a Dolphin session id: ${dolphinSessionId}`)
  }
  return address
}

/** The bare Dolphin session id of an `orca_session_id:<id>` address; anything else reads as null. */
export function parseDolphinSessionAddress(
  address: string | null | undefined
): DolphinSessionId | null {
  if (!address?.startsWith(DOLPHIN_SESSION_ADDRESS_PREFIX)) {
    return null
  }
  const id = address.slice(DOLPHIN_SESSION_ADDRESS_PREFIX.length)
  return isDolphinSessionId(id) ? id : null
}

function isDolphinSessionAddress(address: string): address is DolphinSessionAddress {
  return parseDolphinSessionAddress(address) !== null
}
