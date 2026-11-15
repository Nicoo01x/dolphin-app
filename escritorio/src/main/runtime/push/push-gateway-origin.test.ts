import { describe, expect, it } from 'vitest'
import { resolvePushGatewayOrigin } from './push-gateway-origin'

describe('resolvePushGatewayOrigin', () => {
  it("has no gateway by default: push.onorca.dev is DOLPHIN Mobile's, not Dolphin's", () => {
    expect(resolvePushGatewayOrigin({}, true)).toBeNull()
    expect(resolvePushGatewayOrigin({}, false)).toBeNull()
  })

  it('uses a gateway set on purpose', () => {
    expect(
      resolvePushGatewayOrigin({ DOLPHIN_PUSH_GATEWAY_URL: 'https://push.example.com' }, true)
    ).toBe('https://push.example.com')
  })

  it("keeps DOLPHIN's gateway only when Dolphin is set to use DOLPHIN's cloud", () => {
    expect(resolvePushGatewayOrigin({}, true, true)).toBe('https://push.onorca.dev')
  })
})
