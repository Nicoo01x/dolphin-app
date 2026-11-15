import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { hashDolphindLauncher } from './dolphind-build-identity'

let directory = ''
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'dolphin-entry-identity-'))
})
afterEach(() => {
  rmSync(directory, { recursive: true, force: true })
})

it('keeps the launcher hash older clients expect for both split entry paths', () => {
  const launcher = join(directory, 'dolphind.js')
  const server = join(directory, 'dolphind-server.js')
  writeFileSync(launcher, 'launcher-a')
  writeFileSync(server, 'server-a')
  const first = hashDolphindLauncher(launcher)
  expect(hashDolphindLauncher(server)).toBe(first)
  expect(first).toBe(createHash('sha256').update('launcher-a').digest('hex').slice(0, 16))
  writeFileSync(launcher, 'launcher-b')
  expect(hashDolphindLauncher(server)).not.toBe(first)
})
