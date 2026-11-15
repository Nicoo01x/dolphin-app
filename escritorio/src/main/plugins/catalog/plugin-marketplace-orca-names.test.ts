import { describe, expect, it } from 'vitest'
import { LEGACY_PLUGIN_CATALOG_FILENAME } from '../../../shared/plugins/catalog/plugin-catalog'
import { LEGACY_PLUGIN_MARKETPLACE_FILENAME } from '../../../shared/plugins/catalog/plugin-marketplace'
import { parseHostPluginManifest } from '../../../shared/plugins/manifest/plugin-manifest'
import { parsePluginMarketplaceIndex } from './plugin-marketplace-fetch'

// Dolphin habla el contrato público de la base: el catálogo oficial y el de la comunidad publican
// `orca-catalog.json` con `minimumOrca`, y sus plugins declaran `engines.orca`.
const releaseDeLaBase = {
  version: '1.0.0',
  commit: 'a'.repeat(40),
  contentHash: 'b'.repeat(64),
  execution: 'data',
  minimumOrca: '1.4.245',
  types: ['app-theme']
}

function catalogoDeLaBase(): Buffer {
  return Buffer.from(
    JSON.stringify({
      catalogVersion: 2,
      name: 'Orca Plugins',
      owner: 'stablyai',
      plugins: [
        {
          id: 'stablyai.orca-tema',
          source: { kind: 'git', url: 'https://github.com/stablyai/orca-plugins.git', ref: 'main' },
          categories: ['themes'],
          releases: [releaseDeLaBase]
        }
      ]
    })
  )
}

describe('el contrato de plugins de la base', () => {
  it('lee orca-catalog.json y traduce minimumOrca', () => {
    const catalogo = parsePluginMarketplaceIndex(LEGACY_PLUGIN_CATALOG_FILENAME, catalogoDeLaBase())

    expect(catalogo.plugins.map((plugin) => plugin.id)).toEqual(['stablyai.orca-tema'])
    expect(catalogo.plugins[0]?.releases?.[0]?.minimumDolphin).toBe('1.4.245')
  })

  it('sigue leyendo el marketplace v1 con el nombre de la base', () => {
    const v1 = Buffer.from(JSON.stringify({ name: 'Legacy', owner: 'community', plugins: [] }))

    expect(parsePluginMarketplaceIndex(LEGACY_PLUGIN_MARKETPLACE_FILENAME, v1)).toMatchObject({
      name: 'Legacy'
    })
  })

  it('acepta un manifiesto con engines.orca como si dijera engines.dolphin', () => {
    const parsed = parseHostPluginManifest({
      manifestVersion: 2,
      id: 'orca-tema',
      name: 'Tema',
      version: '1.0.0',
      execution: 'data',
      engines: { orca: '>=1.4.245' },
      contributes: {},
      capabilities: []
    })

    expect(parsed.ok && parsed.manifest.engines).toEqual({ dolphin: '>=1.4.245' })
  })
})
