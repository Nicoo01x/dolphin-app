import { describe, expect, it } from 'vitest'
import { eventSchemas } from './telemetry-events'

describe('dolphin cli feature tip schemas', () => {
  it('rejects raw CLI details and unknown result values', () => {
    expect(
      eventSchemas.dolphin_cli_feature_tip_setup_result.safeParse({
        source: 'app_open',
        result: 'installed',
        command_path: '/Users/alice/bin/dolphin'
      }).success
    ).toBe(false)
    expect(
      eventSchemas.dolphin_cli_feature_tip_setup_result.safeParse({
        source: 'app_open',
        result: 'installed_after_retry'
      }).success
    ).toBe(false)
  })
})
