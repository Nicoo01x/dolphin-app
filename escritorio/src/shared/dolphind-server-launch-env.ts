import { DOLPHIND_IDLE_TIMEOUT_ENV } from './dolphind-idle-exit'
import { DOLPHIND_MANAGED_ACTIVATION_ROOT_ENV } from './dolphind-managed-launch-env'

/** WSL-host launch marker; SSH guests and WSLg retain their original PATH. */
export const DOLPHIND_WSL_HOST_ENV = 'DOLPHIN_WSL_DOLPHIND_HOST'

/** Desktop-provided registry ID; guests cannot read it themselves. */
export const DOLPHIND_WSL_DISTRO_GUID_ENV = 'DOLPHIN_WSL_DISTRO_GUID'

/**
 * What a client puts in a server's launch env. A user's own `dolphind` started from one of the
 * server's shells is not that server, so every pane scrubs these.
 */
export const DOLPHIND_SERVER_LAUNCH_ENV_KEYS = [
  // Not client-managed.
  DOLPHIND_MANAGED_ACTIVATION_ROOT_ENV,
  // Keeps the default idle window.
  DOLPHIND_IDLE_TIMEOUT_ENV,
  // Not a WSL host: no migration capabilities, no /mnt/c refusal, no account-push wait.
  DOLPHIND_WSL_HOST_ENV,
  DOLPHIND_WSL_DISTRO_GUID_ENV
] as const
