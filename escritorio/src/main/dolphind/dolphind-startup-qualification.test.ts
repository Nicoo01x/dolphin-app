import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const artifacts = vi.hoisted(() => ({ files: ['dolphind-server.js', 'daemon-entry.js'] }))
vi.mock('./dolphind-artifact-identity', () => ({
  listDolphindArtifactFilenames: async () => artifacts.files
}))

import {
  consumeDolphindStartupQualification,
  dolphindStartupQualificationKey,
  recordDolphindStartupQualification
} from './dolphind-startup-qualification'

let slot: string

beforeEach(() => {
  slot = mkdtempSync(join(tmpdir(), 'dolphind-qualified-'))
  for (const name of artifacts.files) {
    writeFileSync(join(slot, name), `${name} bytes`)
  }
})

afterEach(() => {
  rmSync(slot, { recursive: true, force: true })
})

describe('dolphind startup qualification', () => {
  it('keys on the artifact version and on every installed file staying the same file', async () => {
    const key = await dolphindStartupQualificationKey(slot, '0.1.0+aaaaaaaaaaaa')

    expect(await dolphindStartupQualificationKey(slot, '0.1.0+aaaaaaaaaaaa')).toBe(key)
    expect(await dolphindStartupQualificationKey(slot, '0.2.0+aaaaaaaaaaaa')).not.toBe(key)
    rmSync(join(slot, 'daemon-entry.js'))
    writeFileSync(join(slot, 'daemon-entry.js'), 'replaced')
    expect(await dolphindStartupQualificationKey(slot, '0.1.0+aaaaaaaaaaaa')).not.toBe(key)
  })

  it('consumes a matching marker once, so a launch that dies before readiness re-qualifies', async () => {
    await recordDolphindStartupQualification(slot, 'key-1')

    expect(await consumeDolphindStartupQualification(slot, 'key-1')).toBe(true)
    expect(await consumeDolphindStartupQualification(slot, 'key-1')).toBe(false)
  })
})
