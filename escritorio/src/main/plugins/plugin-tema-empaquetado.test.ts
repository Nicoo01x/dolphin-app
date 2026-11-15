import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PLUGIN_APP_THEME_REQUIRED_TOKENS } from '../../shared/plugins/artifacts/plugin-theme-artifact'
import { PluginContentVerifier } from './plugin-content-integrity'
import { PluginContentPackRegistry } from './contributions/plugin-content-pack-registry'
import { hashPluginTree } from './plugin-content-hash'
import { discoverPlugins, isInvalidDiscoveredPlugin } from './plugin-discovery'

// El plugin de temas que viaja en el instalador, mirado como lo mira la app: se descubre,
// se reconcilia y queda listado. Es la prueba de punta a punta de la familia «temas»;
// los esquemas de cada artefacto tienen sus propios tests unitarios.
const LAUNCH_DIR = join(__dirname, '../../../resources/plugins/launch')
const PLUGIN_DIR = join(LAUNCH_DIR, 'stablyai.dolphin-tema-mar')
// Why stablyai.dolphin-*: `isOfficialPluginIdentity` solo deja viajar en el instalador a los
// plugins con la identidad oficial, y el indice de empaquetados lo exige en su esquema.
const PLUGIN_KEY = 'stablyai.dolphin-tema-mar'
const HOST_VERSION = '1.5.4'

async function descubrir() {
  return discoverPlugins({
    // El plugin viaja en resources, no instalado en el perfil: se descubre como dev path,
    // que es el camino que no exige lockfile.
    pluginsDir: join(LAUNCH_DIR, 'no-hay-nada-instalado'),
    devPluginPaths: [PLUGIN_DIR],
    hostVersion: HOST_VERSION
  })
}

async function registroCon(isKilled: (pluginKey: string) => boolean) {
  const registry = new PluginContentPackRegistry(new PluginContentVerifier(), isKilled)
  await registry.reconcile(await descubrir(), () => true)
  return registry
}

function soloUno<T>(entries: readonly T[]): T {
  expect(entries).toHaveLength(1)
  const [primero] = entries
  if (primero === undefined) {
    throw new Error('el registro no listó ningún tema')
  }
  return primero
}

describe('el plugin de temas que viaja en el instalador', () => {
  it('está en el índice de empaquetados con el hash de su árbol', async () => {
    const indice = JSON.parse(await readFile(join(LAUNCH_DIR, 'bundled-plugins.json'), 'utf8')) as {
      plugins: { pluginKey: string; path: string; contentHash: string }[]
    }
    const entrada = indice.plugins.find((plugin) => plugin.pluginKey === PLUGIN_KEY)

    expect(entrada).toBeDefined()
    expect(entrada?.path).toBe(PLUGIN_KEY)
    const hashed = await hashPluginTree(PLUGIN_DIR)
    // Un hash viejo acá no rompe nada visible: el bootstrap salta el plugin y nadie ve los temas.
    //
    // Y queda viejo con una facilidad incómoda: el hash son los BYTES del árbol, así que basta
    // con que un archivo del plugin se escriba con CRLF para que no sea el mismo que después de
    // que `.gitattributes` lo normalice a LF. Si este test falla con dos hashes parecidos,
    // recalcular el del árbol como está en el disco AHORA, no el de antes de commitear.
    expect(hashed.ok && hashed.hash).toBe(entrada?.contentHash)
  })

  it('se descubre con sus dos contribuciones de tema', async () => {
    const descubiertos = await descubrir()
    const plugin = descubiertos.find((candidato) => candidato.pluginKey === PLUGIN_KEY)

    expect(plugin).toBeDefined()
    if (!plugin || isInvalidDiscoveredPlugin(plugin)) {
      throw new Error('el plugin de temas no se descubrió como válido')
    }
    expect(plugin.manifest.contributes.themes).toEqual([
      { id: 'mar', title: 'Mar', path: 'themes/mar.json' }
    ])
    expect(plugin.manifest.contributes.terminalThemes).toEqual([
      { id: 'mar', title: 'Mar', path: 'themes/mar-terminal.json' }
    ])
  })

  it('queda listado en el registro, con los tokens que no declara ya derivados', async () => {
    const registry = await registroCon(() => false)

    expect(registry.error(PLUGIN_KEY)).toBeNull()
    const tema = soloUno(registry.themes.list())
    expect(tema.id).toBe(`plugin:${PLUGIN_KEY}/mar`)
    expect(tema.label).toBe('Mar')
    expect(tema.pluginName).toBe('Mar')
    expect(tema.base).toBe('dark')
    for (const token of PLUGIN_APP_THEME_REQUIRED_TOKENS) {
      expect(tema.tokens[token]).toBeDefined()
    }
    // Declara 11 tokens; el resto los completa la derivación, que es lo que evita un gris
    // de fábrica sobre una paleta azul.
    expect(Object.keys(tema.tokens).length).toBeGreaterThan(11)
    expect(tema.tokens['--sidebar']).toBeDefined()

    const terminal = soloUno(registry.terminalThemes.list())
    expect(terminal.id).toBe(`plugin:${PLUGIN_KEY}/mar`)
    expect(terminal.terminal.background).toBe('#07090c')
    expect(terminal.mode).toBe('dark')
  })

  it('no aporta ningún tema si el plugin está revocado', async () => {
    // Why: los temas se reconcilian como una familia más justamente para que un plugin matado
    // pierda sus temas por el mismo camino que pierde sus comandos.
    const registry = await registroCon((pluginKey) => pluginKey === PLUGIN_KEY)

    expect(registry.themes.list()).toEqual([])
    expect(registry.terminalThemes.list()).toEqual([])
  })
})
