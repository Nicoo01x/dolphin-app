import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { findRepositoryConfigFile } from './repository-config-file'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('findRepositoryConfigFile', () => {
  it('reports the legacy dolphin.yaml filename when it is the file found', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dolphin-repository-config-'))
    roots.push(root)
    await writeFile(join(root, 'dolphin.yaml'), 'scripts:\n  setup: npm install\n')

    expect(findRepositoryConfigFile(root)).toMatchObject({ filename: 'dolphin.yaml' })
  })
})
