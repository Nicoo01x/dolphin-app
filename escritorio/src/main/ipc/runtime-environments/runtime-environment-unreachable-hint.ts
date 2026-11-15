import { withRemoteRuntimeTailscaleHint } from '../../../shared/remote-runtime/remote-runtime-tailscale-hint'
import { classifyRuntimeEnvironmentHost } from '../../../shared/remote-runtime/host-catalog/runtime-environment-host-kind'
import type { KnownRuntimeEnvironment } from '../../../shared/remote-runtime/host-catalog/runtime-environments'

// Why: old remote messages still say Dolphin, while current runtime producers say Dolphin.
const UNREACHABLE_RE =
  /could not connect to the remote (?:dolphin|dolphin) runtime|remote (?:dolphin|dolphin) runtime closed the connection|timed out (?:waiting for|while connecting to) the remote (?:dolphin|dolphin) runtime/i

export function withRuntimeUnreachableHint(
  environment: Pick<KnownRuntimeEnvironment, 'dolphindDeployment' | 'sshAccess'>,
  message: string,
  endpoint: string | null | undefined
): string {
  const host = classifyRuntimeEnvironmentHost(environment)
  switch (host.kind) {
    case 'network':
      return withRemoteRuntimeTailscaleHint(message, endpoint)
    case 'ssh':
      // An SSH tunnel already crosses networks; Tailscale cannot help it.
      return message
    case 'wsl':
      // WSL is reached locally through wsl.exe; a Tailscale hint cannot help.
      return UNREACHABLE_RE.test(message)
        ? `${message} The Dolphin server in the WSL distro ${host.deployment.distro} isn’t answering; connect it again in Settings → Remote Dolphin Servers → WSL hosts.`
        : message
  }
}
