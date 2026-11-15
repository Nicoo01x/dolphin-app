import { describe, expect, it } from 'vitest'
import { DolphindBindAddressError, resolveDolphindBindHost } from './dolphind-bind-address'

describe('resolveDolphindBindHost', () => {
  it('refuses hostnames, because DNS would decide which interface got bound', () => {
    expect(() => resolveDolphindBindHost('internal.example')).toThrow(DolphindBindAddressError)
    expect(() => resolveDolphindBindHost('')).toThrow(DolphindBindAddressError)
    expect(() => resolveDolphindBindHost('0.0.0.0:80')).toThrow(DolphindBindAddressError)
    expect(() => resolveDolphindBindHost('fe80::2008%eth0')).toThrow(
      'does not support scoped IPv6 addresses'
    )
  })
})
