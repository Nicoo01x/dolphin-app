import type { Platform } from './MobileHero'
import { translate } from '@/i18n/i18n'
import type { Translate } from '@/i18n/use-translate'

export type InstallCopy = { ctaLabel: string; url: string }

/**
 * Why la página de versiones de Dolphin: la app de celular es de la base y en Dolphin no existe
 * (`DOLPHIN_USA_LA_NUBE_DE_DOLPHIN` está apagada y esta pantalla no se muestra). Si algún día se
 * prende, que lleve a lo de Dolphin y no a la tienda ni al sitio de otra app.
 */
const DOLPHIN_RELEASES_URL = 'https://github.com/Nicoo01x/dolphin-app/releases/latest'

export const ANDROID_INSTALL_GUIDE_URL = DOLPHIN_RELEASES_URL

export function getInstallCopy(platform: Platform, t: Translate = translate): InstallCopy {
  return platform === 'ios'
    ? {
        ctaLabel: t('auto.components.mobile.mobile.platform.copy.openAppStore', 'Open App Store'),
        url: DOLPHIN_RELEASES_URL
      }
    : {
        ctaLabel: t('auto.components.mobile.mobile.platform.copy.downloadApk', 'Download APK'),
        url: DOLPHIN_RELEASES_URL
      }
}
