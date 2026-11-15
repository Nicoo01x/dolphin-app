import { describe, expect, it } from 'vitest'
import { isDolphinSessionId, parseDolphinSessionAddress } from './dolphin-session-address'
import { testDolphinSessionId } from './dolphin-session-address-test-fixture'

const SESSION_ID = testDolphinSessionId('0b7e4c2a-5f1d-4e8a-9c3b-2d6f8a1e4b70')

describe('Dolphin session address', () => {
  it('reads only the addressed spelling when parsing an address', () => {
    // A bare id is what the columns store, not an address.
    expect(parseDolphinSessionAddress(SESSION_ID)).toBeNull()
    expect(parseDolphinSessionAddress(null)).toBeNull()
    expect(parseDolphinSessionAddress(undefined)).toBeNull()
    expect(parseDolphinSessionAddress('')).toBeNull()
  })

  it.each([
    ['an unknown prefix', `pane:${SESSION_ID}`],
    ['the Run mailbox namespace', 'run:run_123'],
    ['the Dispatch mailbox namespace', 'dispatch:ctx_123'],
    ['an empty prefix', `:${SESSION_ID}`],
    ['an empty id', 'orca_session_id:'],
    ['an id with a separator', `orca_session_id:${SESSION_ID}:extra`],
    ['an id the session predicate rejects', 'orca_session_id:short'],
    ['a terminal handle', 'term_4f2c9a']
  ])('refuses %s', (_label, value) => {
    expect(parseDolphinSessionAddress(value)).toBeNull()
  })

  it('no longer reads the retired session:<id> spelling as a session, as an address or a bare id', () => {
    expect(parseDolphinSessionAddress(`session:${SESSION_ID}`)).toBeNull()
    expect(isDolphinSessionId(`session:${SESSION_ID}`)).toBe(false)
  })

  it.each([
    ['a PTY terminal handle', 'term_4f2c9a1b-7d3e-4a5f-8b6c-9d0e1f2a3b4c'],
    ['a short PTY terminal handle', 'term_4f2c9a'],
    ['a structured-worker handle', 'structworker_4f2c9a1b-7d3e-4a5f-8b6c-9d0e1f2a3b4c']
  ])('never treats %s as a Dolphin session id', (_label, handle) => {
    // Handles share the session-id charset, so the session-record predicate alone would accept them.
    expect(isDolphinSessionId(handle)).toBe(false)
    expect(parseDolphinSessionAddress(`orca_session_id:${handle}`)).toBeNull()
  })
})
