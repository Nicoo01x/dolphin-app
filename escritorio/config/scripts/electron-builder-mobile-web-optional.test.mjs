import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const electronBuilderConfig = require('../electron-builder.config.cjs')

// electron-builder Arch enum: x64=1, arm64=3.
const HOST_ARCH = process.arch === 'arm64' ? 3 : 1
const packWith = (mobileWebBundleDir) =>
  electronBuilderConfig.beforePack(
    { electronPlatformName: process.platform, arch: HOST_ARCH },
    mobileWebBundleDir,
    () => undefined
  )

// Dolphin no trae DOLPHIN Mobile: su bundle es opcional, pero si está tiene que estar entero.
describe('beforePack and the mobile web bundle', () => {
  let scratch
  beforeAll(async () => {
    scratch = await mkdtemp(join(tmpdir(), 'dolphin-mobile-web-optional-'))
  })
  afterAll(async () => {
    await rm(scratch, { recursive: true, force: true })
  })

  it('packages without a mobile web bundle, which Dolphin does not ship', () => {
    expect(() => packWith(join(scratch, 'no-mobile-web'))).not.toThrow()
  })

  it('still refuses a mobile web bundle that is there but broken', async () => {
    const broken = join(scratch, 'broken-mobile-web')
    await mkdir(broken, { recursive: true })
    expect(() => packWith(broken)).toThrow(/manifest/)
  })
})
