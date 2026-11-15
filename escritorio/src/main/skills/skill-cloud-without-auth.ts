import { leerEnvDolphin } from '../../shared/dolphin-env'
import type { SkillCloudOperation, SkillCloudOptions } from '../../shared/skill-cloud-contract'
import { DOLPHIN_USA_LA_NUBE_DE_DOLPHIN } from '../../shared/dolphin-brand'
import { resolveArtifactCloudApiUrl } from '../artifacts/artifact-cloud-config'

/**
 * A skill-cloud call that needs no session (resolving a share link, granting its download).
 *
 * Why the gate: sin una dirección puesta a propósito, esto le pregunta a la nube
 * de la base, que Dolphin no usa (ver dolphin-brand.ts); contesta «no configurado» sin salir a la red.
 */
export async function runSkillCloudOperationWithoutAuth<T>(
  options: SkillCloudOptions,
  operation: (apiUrl: string) => Promise<T>,
  env: NodeJS.ProcessEnv = process.env
): Promise<SkillCloudOperation<T>> {
  if (
    !DOLPHIN_USA_LA_NUBE_DE_DOLPHIN &&
    !options.apiUrl?.trim() &&
    !leerEnvDolphin('ARTIFACTS_API_URL', env)?.trim()
  ) {
    return {
      status: 'unconfigured',
      message: "Sharing skills by link isn't available in Dolphin yet."
    }
  }
  const value = await operation(resolveArtifactCloudApiUrl(options.apiUrl))
  return { status: 'ok', value }
}
