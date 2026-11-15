import type { NodeRuntimeTarget } from '../../../shared/node-runtime-pin'
import { resolveDolphindDeploymentTargetFacts } from '../install/dolphind-deployment-target'
import { DolphindHostUnsupportedError } from '../../dolphind/dolphind-host-unavailable'
import type { DolphindHostTransport } from '../install/dolphind-host-transport'
import { pinnedRuntimeTargetForHost } from '../install/pinned-runtime-host-target'
import type { RemoteHostPlatform } from '../../ssh/remote-host/ssh-remote-platform'

/** Lets a caller that knows the host kind add its own fix; the message is the one SSH shows. */
export class DolphindHostGlibcUnsupportedError extends DolphindHostUnsupportedError {
  constructor(target: string, glibc: string) {
    super(`No Dolphin runtime supports ${target} with glibc ${glibc}.`)
  }
}

export async function resolveDolphindRuntimeTarget(options: {
  conn: DolphindHostTransport
  host: RemoteHostPlatform
  signal?: AbortSignal
  exec?: (command: string) => Promise<string>
}): Promise<NodeRuntimeTarget> {
  const facts = await resolveDolphindDeploymentTargetFacts(options)
  const target = pinnedRuntimeTargetForHost(facts)
  if (!target) {
    const glibc = facts.glibc ? `${facts.glibc.major}.${facts.glibc.minor}` : 'unknown'
    throw new DolphindHostGlibcUnsupportedError(facts.target, glibc)
  }
  return target
}
