import { build } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { smokeSessionScannerService } from './session-scanner-service-smoke.mjs'
import {
  externalNativeAddons,
  DOLPHIND_CHILD_ENTRY_POINTS,
  DOLPHIND_EXTERNAL_MODULES,
  dolphindChildOutputFilename
} from './dolphind-entry-build.mjs'

const ENTRY = dolphindChildOutputFilename(DOLPHIND_CHILD_ENTRY_POINTS.sessionScanner)
const directories = []
let builtDirectory

function fixtureDirectory() {
  const directory = mkdtempSync(join(tmpdir(), 'dolphin-session-scanner-smoke-test-'))
  directories.push(directory)
  return directory
}

beforeAll(async () => {
  builtDirectory = fixtureDirectory()
  await build({
    entryPoints: [resolve(DOLPHIND_CHILD_ENTRY_POINTS.sessionScanner)],
    outfile: join(builtDirectory, ENTRY),
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    external: DOLPHIND_EXTERNAL_MODULES,
    plugins: [externalNativeAddons],
    logLevel: 'silent'
  })
}, 60_000)

afterAll(() => {
  for (const directory of directories) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('session scanner service build smoke', () => {
  it('lists a seeded session through the built entry', () => {
    expect(() => smokeSessionScannerService(builtDirectory)).not.toThrow()
  }, 60_000)
})
