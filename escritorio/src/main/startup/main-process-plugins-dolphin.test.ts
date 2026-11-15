import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Why empaquetado: es donde la base salía a la red; en desarrollo ya no salía sola.
vi.mock('electron', () => ({ app: { isPackaged: true, getPath: () => '' } }))

import { bajaEstadisticasDePlugins, bajaListaDeBloqueados } from './main-process-plugins-dolphin'

describe('la red de los plugins en Dolphin', () => {
  it('no le pide las estadísticas de instalaciones a la nube de la base', () => {
    expect(bajaEstadisticasDePlugins()).toBe(false)
  })

  it('no baja la lista de bloqueados de la nube de la base, ni empaquetado', () => {
    expect(bajaListaDeBloqueados()).toBe(false)
  })

  it('el arranque no siembra catálogos ni busca actualizaciones con un temporizador', () => {
    // Why leer el fuente: armar initializeMainProcessPlugins entero es levantar media app. Lo que
    // importa es que no quede ningún temporizador que salga a GitHub a los 15 s o al minuto.
    const fuente = readFileSync(join(__dirname, 'main-process-plugins.ts'), 'utf8')
    expect(fuente).not.toMatch(/setTimeout\(/)
    expect(fuente).toMatch(
      /dolphin\.cuandoSeAbraElCatalogo\(\(\) => syncPluginAutoUpdate\(true\)\)/
    )
    expect(fuente).toMatch(/dolphin\.bajaEstadisticasDePlugins\(\)/)
  })
})

describe('cuandoSeAbraElCatalogo', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('espera a que la persona abra el catálogo y avisa una sola vez', async () => {
    const catalogo = await import('../plugins/catalog/catalogo-abierto')
    const listener = vi.fn()
    catalogo.cuandoSeAbraElCatalogo(listener)
    expect(listener).not.toHaveBeenCalled()
    catalogo.avisarQueSeAbrioElCatalogo()
    catalogo.avisarQueSeAbrioElCatalogo()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('corre enseguida lo que se engancha después de abierto', async () => {
    const catalogo = await import('../plugins/catalog/catalogo-abierto')
    catalogo.avisarQueSeAbrioElCatalogo()
    const listener = vi.fn()
    catalogo.cuandoSeAbraElCatalogo(listener)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
