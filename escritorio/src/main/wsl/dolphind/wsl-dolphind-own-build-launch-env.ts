import { hostMallocTunablesLaunchEnv } from '../../memory/host-malloc-tunables'
import type { DolphindHostTransport } from '../../managed-server/install/dolphind-host-transport'

/** An older slot would leak GLIBC_TUNABLES to user shells, so only this build's own slot gets it. */
export function withOwnBuildLaunchEnv<T extends DolphindHostTransport>(
  conn: T,
  ownBuildVersion: () => string | null
): T {
  const dolphindLaunchEnv: DolphindHostTransport['dolphindLaunchEnv'] = async (launch) => [
    ...((await conn.dolphindLaunchEnv?.(launch)) ?? []),
    ...(launch.fullVersion === ownBuildVersion() ? hostMallocTunablesLaunchEnv() : [])
  ]
  // Delegate rather than spread so prototype methods survive; #private fields would still need explicit forwarding.
  return Object.create(conn, { dolphindLaunchEnv: { value: dolphindLaunchEnv } })
}
