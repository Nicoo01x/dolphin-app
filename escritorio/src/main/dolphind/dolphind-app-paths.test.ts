import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'

import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { resolveDolphindInstallRoot } from './dolphind-app-paths'

const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!

afterEach(() => {
  Object.defineProperty(process, 'platform', originalPlatform)
  vi.unstubAllEnvs()
})

describe('resolveDolphindInstallRoot', () => {
  // Bundle siblings live beside symlink targets, not the link.
  it.skipIf(process.platform === 'win32')('follows a symlinked script to the real bundle', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'dolphind-install-root-')))
    try {
      const bundle = join(root, 'slot')
      const bin = join(root, 'bin')
      mkdirSync(bundle)
      mkdirSync(bin)
      writeFileSync(join(bundle, 'dolphind.js'), '')
      symlinkSync(join(bundle, 'dolphind.js'), join(bin, 'dolphind'))
      expect(resolveDolphindInstallRoot(join(bin, 'dolphind'))).toBe(bundle)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
