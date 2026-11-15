import { describe, expect, it } from 'vitest'
import { TELEMETRY_AVAILABLE } from '../diagnostics/telemetry/telemetry'

describe('telemetry UI availability', () => {
  it('is disabled when the build has no PostHog constants', () => {
    expect(TELEMETRY_AVAILABLE).toBe(false)
  })
})
