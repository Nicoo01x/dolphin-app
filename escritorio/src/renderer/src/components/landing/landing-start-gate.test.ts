import { describe, expect, it } from 'vitest'
import { resolveStartGate, startGateIsWaiting, type StartGateInput } from './landing-start-gate'

function input(overrides: Partial<StartGateInput> = {}): StartGateInput {
  return {
    projectCount: 1,
    selectedProjectId: 'project-1',
    prompt: 'Add a settings screen',
    creating: false,
    launchReady: true,
    formDisabled: false,
    ...overrides
  }
}

describe('resolveStartGate', () => {
  it('starts once there is a project, a prompt and a known agent', () => {
    expect(resolveStartGate(input())).toEqual({ kind: 'ready' })
  })

  it('asks for a project before anything else, even with a prompt already typed', () => {
    expect(resolveStartGate(input({ projectCount: 0, selectedProjectId: null }))).toEqual({
      kind: 'blocked',
      reason: 'no-projects'
    })
  })

  it('tells the user to write something rather than that detection is pending', () => {
    // Both are pending on a cold start. Saying "reading agents" there would make an empty box
    // look like the app is busy, when what it needs is the ask.
    expect(resolveStartGate(input({ prompt: '   ', launchReady: false }))).toEqual({
      kind: 'blocked',
      reason: 'empty-prompt'
    })
  })

  it('holds while the target host inventory is still being read', () => {
    expect(resolveStartGate(input({ launchReady: false }))).toEqual({
      kind: 'blocked',
      reason: 'reading-agents'
    })
  })

  it('surfaces a project that still needs a location or a connection', () => {
    expect(resolveStartGate(input({ formDisabled: true }))).toEqual({
      kind: 'blocked',
      reason: 'project-not-ready'
    })
  })

  it('reports the in-flight create above every other reason', () => {
    expect(
      resolveStartGate(input({ creating: true, prompt: '', projectCount: 0, formDisabled: true }))
    ).toEqual({ kind: 'blocked', reason: 'creating' })
  })

  it('separates what the app is doing from what the user has to do', () => {
    expect(startGateIsWaiting(resolveStartGate(input({ creating: true })))).toBe(true)
    expect(startGateIsWaiting(resolveStartGate(input({ launchReady: false })))).toBe(true)
    expect(startGateIsWaiting(resolveStartGate(input({ prompt: '' })))).toBe(false)
    expect(startGateIsWaiting(resolveStartGate(input()))).toBe(false)
  })
})
