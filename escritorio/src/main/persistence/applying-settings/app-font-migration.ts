import type { GlobalSettings } from '../../../shared/global-settings-types'
import { DEFAULT_APP_FONT_FAMILY } from '../../../shared/constants'

const LEGACY_APP_FONT_FAMILY_DEFAULT = 'Geist'

/**
 * Why: `appFontFamily` se persiste, así que todo perfil existente guarda 'Geist' sin haberlo
 * elegido (era el default del upstream). Se mueve una sola vez a Inter; con el flag ya puesto,
 * un 'Geist' guardado es una elección y se respeta. Cualquier otra fuente se respeta siempre.
 */
export function migrateAppFontFamilyOffGeist(settings: GlobalSettings | undefined): {
  settings: Pick<GlobalSettings, 'appFontFamily' | 'appFontFamilyMovedOffGeist'>
  needsSave: boolean
} {
  const alreadyMoved = settings?.appFontFamilyMovedOffGeist === true
  const current = settings?.appFontFamily
  const shouldMoveInheritedDefault =
    !alreadyMoved && (current === undefined || current === LEGACY_APP_FONT_FAMILY_DEFAULT)
  const appFontFamily = shouldMoveInheritedDefault
    ? DEFAULT_APP_FONT_FAMILY
    : (current ?? DEFAULT_APP_FONT_FAMILY)

  return {
    settings: { appFontFamily, appFontFamilyMovedOffGeist: true },
    needsSave: !alreadyMoved || current === undefined
  }
}
