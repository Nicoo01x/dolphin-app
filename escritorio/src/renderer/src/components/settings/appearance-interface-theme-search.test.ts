import { expect, it } from 'vitest'
import { getAppearancePaneSearchEntries } from './appearance/appearance-search'
import { getInterfaceThemeEntries } from './appearance-interface-theme-search'
import { matchesSettingsSearch } from './search/settings-search'

/**
 * Un ajuste que no está en la búsqueda, para quien no sabe en qué pestaña vive, no existe. Esto
 * fija las dos mitades: que la sección esté en el catálogo de Apariencia con su destino de
 * navegación, y que las palabras con las que alguien la buscaría de verdad la encuentren.
 */

it('registers interface colors in the appearance catalog with its navigation target', () => {
  const entries = getAppearancePaneSearchEntries().filter(
    (entry) => entry.targetSectionId === 'interface-theme'
  )
  expect(entries).toHaveLength(1)
  expect(entries[0].title).toBe('Interface colors')
  expect(getInterfaceThemeEntries()[0].targetSectionId).toBe('interface-theme')
  for (const query of [
    'accent',
    'surface',
    'ink',
    'contrast',
    'light',
    'dark',
    'hex',
    'custom theme',
    // La ortografía británica también: quien escribe «colours» busca lo mismo.
    'colours'
  ]) {
    expect(matchesSettingsSearch(query, entries), query).toBe(true)
  }
  expect(matchesSettingsSearch('unrelated xyz', entries)).toBe(false)
})
