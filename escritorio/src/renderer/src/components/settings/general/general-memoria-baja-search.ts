import { translate } from '@/i18n/i18n'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { translateSearchKeyword } from '../search/settings-search-keywords'
import type { SettingsSearchEntry } from '../search/settings-search'

/** Dónde vive el ajuste: el cartel de poca RAM lleva acá. */
export const SECCION_MODO_POCA_RAM = 'modo-poca-ram'

export function tituloModoPocaRam(): string {
  return translate('memoriaBaja.ajuste.titulo', 'Low RAM mode')
}

export function descripcionModoPocaRam(): string {
  return translate(
    'memoriaBaja.ajuste.descripcion',
    'When this computer runs short on memory, Dolphin tells you in time and offers to run the heaviest workspace on your server. While it is on, idle chats stop after 5 minutes.'
  )
}

const PALABRAS: [string, string][] = [
  ['ram', 'ram'],
  ['memory', 'memory'],
  ['lowMemory', 'low memory'],
  ['crash', 'crash'],
  ['server', 'server'],
  ['vps', 'vps'],
  ['performance', 'performance']
]

export const getGeneralMemoriaBajaSearchEntries = createLocalizedCatalog(
  (): SettingsSearchEntry[] => [
    {
      title: tituloModoPocaRam(),
      description: descripcionModoPocaRam(),
      targetSectionId: SECCION_MODO_POCA_RAM,
      keywords: PALABRAS.flatMap(([clave, palabra]) =>
        translateSearchKeyword(`memoriaBaja.ajuste.palabra.${clave}`, palabra)
      )
    }
  ]
)
