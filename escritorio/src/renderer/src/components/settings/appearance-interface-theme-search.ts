import type { SettingsSearchEntry } from './search/settings-search'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { translate } from '@/i18n/i18n'
import { translateSearchKeyword } from './search/settings-search-keywords'

/** Cada palabra de búsqueda pasa por el catálogo: quien busca en su idioma tiene que encontrarlo. */
const PALABRAS: [string, string][] = [
  ['customTheme', 'custom theme'],
  ['colors', 'colors'],
  ['colours', 'colours'],
  ['accent', 'accent'],
  ['surface', 'surface'],
  ['ink', 'ink'],
  ['contrast', 'contrast'],
  ['light', 'light'],
  ['dark', 'dark'],
  ['hex', 'hex']
]

export const getInterfaceThemeEntries = createLocalizedCatalog((): SettingsSearchEntry[] => [
  {
    title: translate('settings.appearance.interfaceTheme.title', 'Interface colors'),
    description: translate(
      'settings.appearance.interfaceTheme.description',
      'Pick the accent, the surface, the ink and how much contrast each theme gets.'
    ),
    targetSectionId: 'interface-theme',
    keywords: PALABRAS.flatMap(([clave, palabra]) =>
      translateSearchKeyword(`settings.appearance.interfaceTheme.keyword.${clave}`, palabra)
    )
  }
])
