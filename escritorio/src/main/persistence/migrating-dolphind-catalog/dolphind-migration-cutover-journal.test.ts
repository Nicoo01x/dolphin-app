import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { dolphindMigrationCutoverFixture as cutover } from '../../managed-server/migration/cutover/testing/dolphind-migration-cutover-fixture'
import {
  findDolphindMigrationSourceCutoverForTarget,
  listDolphindMigrationSourceCutovers,
  dolphindMigrationCutoverJournalDirectory,
  removeDolphindMigrationSourceCutover,
  writeDolphindMigrationSourceCutover
} from './dolphind-migration-cutover-journal'

let userDataPath: string
beforeEach(() => {
  userDataPath = mkdtempSync(join(tmpdir(), 'dolphind-cutover-journal-'))
})
afterEach(() => rmSync(userDataPath, { recursive: true, force: true }))

const journalPath = (id: string) =>
  join(dolphindMigrationCutoverJournalDirectory(userDataPath), `${id}.json`)

describe('migration cutover journal sidecar', () => {
  it('round-trips a cutover in an owner-only file', () => {
    writeDolphindMigrationSourceCutover(userDataPath, cutover())
    expect(findDolphindMigrationSourceCutoverForTarget(userDataPath, 'ssh-1')).toEqual(cutover())
    if (process.platform !== 'win32') {
      expect(statSync(journalPath('migration-1')).mode & 0o077).toBe(0)
    }
    removeDolphindMigrationSourceCutover(userDataPath, 'migration-1')
    expect(listDolphindMigrationSourceCutovers(userDataPath)).toEqual([])
  })

  it.each([
    ['corrupt JSON', '{not json'],
    ['a manifest bound to another target', JSON.stringify({ ...cutover(), sshTargetId: 'ssh-2' })],
    ['a tampered manifest', JSON.stringify({ ...cutover(), manifestSha256: 'f'.repeat(64) })],
    ['an unknown version', JSON.stringify({ ...cutover(), version: 2 })]
  ])('fails closed on %s', (_label, contents) => {
    mkdirSync(dolphindMigrationCutoverJournalDirectory(userDataPath), { recursive: true })
    writeFileSync(journalPath('migration-1'), contents)
    expect(() => listDolphindMigrationSourceCutovers(userDataPath)).toThrow('stays fenced')
  })

  it("reads a newer build's journal that adds an optional field", () => {
    mkdirSync(dolphindMigrationCutoverJournalDirectory(userDataPath), { recursive: true })
    writeFileSync(journalPath('migration-1'), JSON.stringify({ ...cutover(), addedLater: true }))
    expect(listDolphindMigrationSourceCutovers(userDataPath)).toEqual([cutover()])
  })

  it('fails closed on a file whose name disagrees with its migration', () => {
    mkdirSync(dolphindMigrationCutoverJournalDirectory(userDataPath), { recursive: true })
    writeFileSync(journalPath('other'), JSON.stringify(cutover()))
    expect(() => listDolphindMigrationSourceCutovers(userDataPath)).toThrow('stays fenced')
  })

  it('ignores durable-write temporaries but refuses two journals for one target', () => {
    writeDolphindMigrationSourceCutover(userDataPath, cutover())
    writeFileSync(join(dolphindMigrationCutoverJournalDirectory(userDataPath), 'x.json.tmp'), '?')
    expect(listDolphindMigrationSourceCutovers(userDataPath)).toHaveLength(1)
    writeDolphindMigrationSourceCutover(userDataPath, cutover('migration-2'))
    expect(() => findDolphindMigrationSourceCutoverForTarget(userDataPath, 'ssh-1')).toThrow(
      'journals name SSH target'
    )
  })
})
