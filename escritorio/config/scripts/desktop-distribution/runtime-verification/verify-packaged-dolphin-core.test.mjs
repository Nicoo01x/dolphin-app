import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
  assertDolphinCoreBuilt,
  dolphinCoreExtraResources,
  verifyPackagedDolphinCore
} = require('./verify-packaged-dolphin-core.cjs')

/** Un núcleo construido mínimo: lo que la app instalada necesita para levantar la consola. */
async function writeBuiltCore(root, { type = 'module', skip = [] } = {}) {
  const files = {
    'dist/ui-cli.js': '',
    'dist/dolphin.js': '',
    'dist/servidor.js': '',
    'ui/dist/index.html': '<html></html>',
    'package.json': JSON.stringify({ type })
  }
  for (const [path, content] of Object.entries(files)) {
    if (skip.includes(path)) {
      continue
    }
    const file = join(root, ...path.split('/'))
    await mkdir(join(file, '..'), { recursive: true })
    await writeFile(file, content)
  }
}

describe('verify packaged Dolphin core', () => {
  let base = ''

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), 'dolphin-packaged-core-'))
  })

  afterEach(async () => {
    await rm(base, { recursive: true, force: true })
  })

  it('accepts a package that carries the built core in resources/dolphin-app', async () => {
    await writeBuiltCore(join(base, 'dolphin-app'))
    expect(() => verifyPackagedDolphinCore(base)).not.toThrow()
  })

  it('rejects an installer without the core, so it is never published', async () => {
    await writeBuiltCore(join(base, 'dolphin-app'), { skip: ['dist/ui-cli.js'] })
    expect(() => verifyPackagedDolphinCore(base)).toThrow(/dist\/ui-cli\.js/)
    expect(() => verifyPackagedDolphinCore(join(base, 'nada'))).toThrow(/dist\/ui-cli\.js/)
  })

  it('rejects an installer whose core cannot run the X-ray bug report', async () => {
    await writeBuiltCore(join(base, 'dolphin-app'), { skip: ['dist/dolphin.js'] })
    expect(() => verifyPackagedDolphinCore(base)).toThrow(/dist\/dolphin\.js/)
  })

  it('rejects a core whose package.json would not load dist/ as ES modules', async () => {
    await writeBuiltCore(join(base, 'dolphin-app'), { type: 'commonjs' })
    expect(() => verifyPackagedDolphinCore(base)).toThrow(/type/)
  })

  it('stops packaging when the core was not built at the repo root', async () => {
    await writeBuiltCore(base, { skip: ['ui/dist/index.html'] })
    expect(() => assertDolphinCoreBuilt(base)).toThrow(/npm run ui:build/)
    await writeBuiltCore(base)
    expect(() => assertDolphinCoreBuilt(base)).not.toThrow()
  })

  it('copies dist, the console, bin and package.json, and no node_modules', () => {
    const resources = dolphinCoreExtraResources(base)
    expect(resources.map((resource) => resource.to)).toEqual([
      'dolphin-app/dist',
      'dolphin-app/ui/dist',
      'dolphin-app/ui/public',
      'dolphin-app/bin',
      'dolphin-app/package.json'
    ])
    expect(resources.some((resource) => resource.from.includes('node_modules'))).toBe(false)
  })
})
