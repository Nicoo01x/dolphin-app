import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { hashPluginTree } from './plugin-content-hash'
import {
  discoverPlugins,
  isInvalidDiscoveredPlugin,
  type ValidDiscoveredPlugin
} from './plugin-discovery'
import { readApprovedPluginNewFileTemplate } from './plugin-new-file-template'

// El plugin que suma tipos de archivo al menú `+`, mirado como lo mira la app: se descubre y sus
// plantillas se leen por el mismo camino que usa el menú (el «archivo nuevo» de la base, que lee los
// `newFiles` del manifiesto). Es la prueba de punta a punta de ese plugin.
const LAUNCH_DIR = join(__dirname, '../../../resources/plugins/launch')
const PLUGIN_KEY = 'stablyai.dolphin-archivos'
const PLUGIN_DIR = join(LAUNCH_DIR, PLUGIN_KEY)
const HOST_VERSION = '1.5.4'

async function descubierto(): Promise<ValidDiscoveredPlugin> {
  const descubiertos = await discoverPlugins({
    pluginsDir: join(LAUNCH_DIR, 'no-hay-nada-instalado'),
    devPluginPaths: [PLUGIN_DIR],
    hostVersion: HOST_VERSION
  })
  const plugin = descubiertos.find((candidato) => candidato.pluginKey === PLUGIN_KEY)
  if (!plugin || isInvalidDiscoveredPlugin(plugin)) {
    throw new Error('el plugin de archivos no se descubrió como válido')
  }
  return plugin
}

describe('el plugin de archivos nuevos que viaja en el instalador', () => {
  it('está en el índice de empaquetados con el hash de su árbol', async () => {
    const indice = JSON.parse(await readFile(join(LAUNCH_DIR, 'bundled-plugins.json'), 'utf8')) as {
      plugins: { pluginKey: string; path: string; contentHash: string }[]
    }
    const entrada = indice.plugins.find((plugin) => plugin.pluginKey === PLUGIN_KEY)

    expect(entrada).toBeDefined()
    expect(entrada?.path).toBe(PLUGIN_KEY)
    const hashed = await hashPluginTree(PLUGIN_DIR)
    // El hash son los BYTES del árbol: un archivo escrito con CRLF no da el mismo hash que
    // después de que `.gitattributes` lo normalice a LF. Si esto falla con dos hashes parecidos,
    // recalcular el del árbol como está en el disco AHORA, no el de antes de commitear.
    expect(hashed.ok ? hashed.hash : hashed).toBe(entrada?.contentHash)
  })

  it('ofrece sus cuatro tipos de archivo, cada uno con lo mínimo ya escrito', async () => {
    const plugin = await descubierto()
    const newFiles = plugin.manifest.contributes.newFiles

    expect(newFiles.map((entry) => entry.extension).sort()).toEqual(['.json', '.py', '.sh', '.ts'])
    const shell = newFiles.find((entry) => entry.extension === '.sh')
    expect(plugin.manifest.name).toBe('Archivos')
    const plantilla = await readApprovedPluginNewFileTemplate(
      { findApprovedPlugin: () => plugin },
      PLUGIN_KEY,
      shell?.id ?? ''
    )
    // Why la plantilla y no un archivo vacío: un `.sh` sin shebang y sin `set -euo pipefail` es
    // justo lo que después muerde, y escribir esas dos líneas es lo que nadie hace.
    expect(plantilla).toContain('#!/usr/bin/env bash')
    expect(plantilla).toContain('set -euo pipefail')
  })

  it('no aporta nada si no está aprobado', async () => {
    // El sistema de plugins viaja apagado y cada plugin espera su consentimiento: hasta que
    // alguien diga que sí, el menú `+` no escribe ninguna plantilla suya.
    expect(
      await readApprovedPluginNewFileTemplate(
        { findApprovedPlugin: () => null },
        PLUGIN_KEY,
        'shell'
      )
    ).toBeNull()
  })
})
