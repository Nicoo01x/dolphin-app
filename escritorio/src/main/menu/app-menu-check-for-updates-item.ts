import { DOLPHIN_UPDATE_FEED } from '../../shared/dolphin-brand'
import type { UpdateCheckOptions } from '../../shared/update-status-types'
import { translateMain } from '../i18n/main-i18n'

/**
 * «Buscar actualizaciones…», o nada sin un feed propio: ofrecerlo sin feed sería un ítem que
 * no hace nada (Dolphin todavía no publica releases).
 */
export function createCheckForUpdatesItem(
  isMac: boolean,
  onCheckForUpdates: (options: UpdateCheckOptions) => void
): Electron.MenuItemConstructorOptions | null {
  if (!DOLPHIN_UPDATE_FEED) {
    return null
  }
  return {
    label: translateMain('menu.checkForUpdates', 'Check for Updates...'),
    // Why: modifier-click update checks are hidden power-user affordances.
    // Extracted so the macOS app-menu entry and Windows/Linux Help entry share
    // identical RC/perf channel routing.
    click: (_menuItem, _window, event) => {
      const modifierClick = !event.triggeredByAccelerator
      const localBuild = isMac && modifierClick && event.altKey === true
      const includePerfPrerelease =
        !localBuild && modifierClick && (isMac ? event.metaKey === true : event.ctrlKey === true)
      const includePrerelease = !localBuild && modifierClick && event.shiftKey === true
      onCheckForUpdates({
        includePrerelease,
        includePerfPrerelease,
        ...(localBuild ? { localBuild: true } : {})
      })
    }
  }
}
