import { describe, expect, it } from 'vitest'
import { validateResolveGateRequest } from './orchestration-dashboard-validation'

describe('validateResolveGateRequest', () => {
  it('accepts bounded non-empty strings', () => {
    expect(validateResolveGateRequest({ gateId: 'gate-1', decision: 'Sí' })).toEqual({
      gateId: 'gate-1',
      decision: 'Sí'
    })
  })
  it.each([
    { gateId: '', decision: 'Sí' },
    { gateId: 'gate', decision: '' },
    { gateId: 4, decision: 'Sí' },
    null
  ])('rejects malformed input', (value) => {
    expect(() => validateResolveGateRequest(value)).toThrow()
  })
})
