import { DOLPHIND_MANAGED_ACTIVATION_ROOT_ENV } from '../../shared/dolphind-managed-launch-env'

type DolphindWsPortOptions = {
  wsPort?: number
  preferPinnedWsPort?: boolean
  requirePinnedWsPort?: boolean
}

/** Honor explicit ports; managed launches permit fallback because WSL distros share loopback. */
export function dolphindWsPortOptions(
  port: number | undefined,
  env: NodeJS.ProcessEnv = process.env
): DolphindWsPortOptions {
  if (port === undefined) {
    return {}
  }
  const managed = Boolean(env[DOLPHIND_MANAGED_ACTIVATION_ROOT_ENV])
  return {
    wsPort: port,
    preferPinnedWsPort: true,
    ...(managed ? {} : { requirePinnedWsPort: true })
  }
}
