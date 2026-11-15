import { DOLPHIN_SESSION_ADDRESS_PREFIX } from '../../../../shared/dolphin-session-address-prefix'

/** Format bare ids as session addresses (NULL stays NULL); never strip addresses and risk matching handles or Runs. */
export function dolphinSessionAddressSql(dolphinSessionIdSql: string): string {
  return `('${DOLPHIN_SESSION_ADDRESS_PREFIX}' || ${dolphinSessionIdSql})`
}
