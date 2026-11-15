import type { SshTarget } from '../../../shared/ssh-types'
import type { WslDolphindHostTarget } from '../../wsl/dolphind/wsl-dolphind-host-target'
import type { RemoteInstallTransport } from './remote-install-transport'
import type { DolphindLaunchDetach } from './dolphind-remote-launch'

/** Only id/label have the same meaning across host kinds. */
export type DolphindHostTarget = SshTarget | WslDolphindHostTarget

export function isWslDolphindHostTarget(target: DolphindHostTarget): target is WslDolphindHostTarget {
  return 'kind' in target && target.kind === 'wsl'
}

export type DolphindHostTransport = RemoteInstallTransport & {
  getTarget(): DolphindHostTarget
  /** Absent on SSH, which detaches with nohup. */
  readonly dolphindLaunchDetach?: DolphindLaunchDetach
  /** Pass client-only host facts at launch; SSH adds none. */
  readonly dolphindLaunchEnv?: (
    launch: DolphindLaunchEnvRequest
  ) => Promise<readonly DolphindLaunchEnvEntry[]>
}

/** The slot being launched; entries only its own build understands must check the version. */
export type DolphindLaunchEnvRequest = { readonly fullVersion: string }

/** `keep-existing` applies the value only when the launching shell has none, so a user's own setting wins. */
export type DolphindLaunchEnvEntry = readonly [name: string, value: string, mode?: 'keep-existing']
