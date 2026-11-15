import { leerEnvDolphin } from '../../../shared/dolphin-env'
import { cleanCloudServiceOrigin } from '../../../shared/cloud-service-url'
import { DOLPHIN_USA_LA_NUBE_DE_DOLPHIN } from '../../../shared/dolphin-brand'

/**
 * Where the host registers phones for background push, or null when there is none.
 *
 * Why null by default: the default gateway belongs to the base's mobile app, and Dolphin does not use the base's
 * cloud (DOLPHIN_USA_LA_NUBE_DE_DOLPHIN). Without a gateway set on purpose the push service never
 * starts, so a packaged Dolphin never reaches one of the base's hosts on its own.
 */
export function resolvePushGatewayOrigin(
  env: NodeJS.ProcessEnv,
  packaged: boolean,
  usaLaNubeDeDolphin: boolean = DOLPHIN_USA_LA_NUBE_DE_DOLPHIN
): string | null {
  const configured = cleanCloudServiceOrigin(leerEnvDolphin('PUSH_GATEWAY_URL', env), !packaged)
  if (configured) {
    return configured
  }
  return usaLaNubeDeDolphin ? 'https://push.onorca.dev' : null
}
