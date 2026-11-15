import type { SettingsSearchEntry } from './search/settings-search'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { translate } from '@/i18n/i18n'
import { translateSearchKeyword } from './search/settings-search-keywords'

/** Cada palabra de búsqueda pasa por el catálogo: quien busca en su idioma tiene que encontrarlo. */
const PALABRAS: [string, string][] = [
  ['background', 'background'],
  ['wallpaper', 'wallpaper'],
  ['painting', 'painting'],
  ['landscape', 'landscape'],
  ['image', 'image'],
  ['blur', 'blur'],
  ['veil', 'veil'],
  ['transparency', 'transparency']
]

export const getFondoDelChatEntries = createLocalizedCatalog((): SettingsSearchEntry[] => [
  {
    title: translate('settings.appearance.fondoDelChat.title', 'Chat background'),
    description: translate(
      'settings.appearance.fondoDelChat.description',
      'A painting behind the window. The panels go translucent on top and the text stays readable.'
    ),
    targetSectionId: 'chat-background',
    keywords: PALABRAS.flatMap(([clave, palabra]) =>
      translateSearchKeyword(`settings.appearance.fondoDelChat.keyword.${clave}`, palabra)
    )
  }
])
