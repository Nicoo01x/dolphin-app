import { DOLPHIN_MAC_ACTUALIZA_SOLO } from '../../../shared/dolphin-brand'
import { getReleaseNotesUrlForVersion } from '../../../shared/release-channel'
import type { UpdateStatus } from '../../../shared/update-status-types'

/**
 * Si en esta Mac la versión nueva se baja a mano en vez de instalarse sola.
 *
 * Why: Squirrel.Mac, el motor que reemplaza la app en macOS, rechaza cualquier versión que no
 * esté firmada con un Developer ID y notarizada. Dolphin todavía sale sin firmar, así que la
 * instalación automática bajaría la versión entera para fallar al final. El aviso sigue saliendo
 * igual —la versión nueva existe y hay que contarlo—, pero el botón lleva a la release.
 *
 * Es `=== true` a propósito: cualquier duda (la constante ausente en un mock, un build viejo) cae
 * en la descarga manual, que nunca rompe nada.
 */
export function macActualizaPorDescarga(platform: NodeJS.Platform = process.platform): boolean {
  return platform === 'darwin' && DOLPHIN_MAC_ACTUALIZA_SOLO !== true
}

/** La página de la release de esa versión, de donde se baja el .dmg. */
export function urlDeDescargaManual(version: string): string | null {
  return getReleaseNotesUrlForVersion(version) || null
}

/** Le suma al aviso de «hay una versión nueva» adónde ir a buscarla, si esta Mac no la instala sola. */
export function conDescargaManual(
  status: UpdateStatus,
  platform: NodeJS.Platform = process.platform
): UpdateStatus {
  if (status.state !== 'available' || !macActualizaPorDescarga(platform)) {
    return status
  }
  const url = urlDeDescargaManual(status.version)
  return url ? { ...status, manualDownloadUrl: url } : status
}
