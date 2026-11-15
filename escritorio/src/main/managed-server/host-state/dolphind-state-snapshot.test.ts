import { describe, expect, it } from 'vitest'

import {
  parseDolphindSnapshotCapture,
  parseDolphindSnapshotPresence,
  parseDolphindSnapshotRestore,
  restoreDolphindStateSnapshotCommand
} from './dolphind-state-snapshot'

import { getRemoteHostPlatform } from '../../ssh/remote-host/ssh-remote-platform'

const posix = getRemoteHostPlatform('linux-x64')

const ROOT = '/home/u/.dolphin'
const SNAP = '/home/u/.dolphin-remote/dolphind-state-snapshots/pre-0.2.0+bb01-1000'
const BASE = '/home/u/.dolphin-remote'

describe('capturing the pre-activation snapshot', () => {
  it.each([
    ['CAPTURED', 'captured'],
    ['EMPTY', 'empty'],
    ['tar: broken', 'failed'],
    ['', 'failed'],
    // Gateways may append shell job notices after a valid verdict (#30491).
    ['CAPTURED\r\nsh: line 1:  2468 Terminated   ( while sleep 60 ... )\n', 'captured'],
    ['FAILED\nCAPTURED-looking noise', 'failed']
  ])('parses %j as %s', (output, expected) => {
    expect(parseDolphindSnapshotCapture(output)).toBe(expected)
  })
})

describe('restoring the snapshot', () => {
  it('reports a missing archive instead of extracting nothing and claiming success', () => {
    expect(restoreDolphindStateSnapshotCommand(posix, ROOT, SNAP, BASE)).toContain('echo MISSING')
    expect(parseDolphindSnapshotRestore('MISSING')).toBe('missing')
    expect(parseDolphindSnapshotRestore('RESTORED')).toBe('restored')
    expect(parseDolphindSnapshotRestore('FAILED')).toBe('failed')
    expect(parseDolphindSnapshotRestore('RESTORED\nsh: line 1: 13 Terminated')).toBe('restored')
  })

  it.each([
    ['PRESENT', 'present'],
    ['ABSENT', 'absent'],
    ['', 'unverifiable'],
    ['bash: tar: command not found', 'unverifiable']
  ])('reads snapshot presence %j as %s, never treating silence as absence', (out, expected) => {
    expect(parseDolphindSnapshotPresence(out)).toBe(expected)
  })
})
