import { describe, expect, it } from 'vitest'
import { vistaDeMensajeDeConsola } from './dolphin-console-message'

describe('vistaDeMensajeDeConsola', () => {
  it('accepts known console views', () => {
    expect(vistaDeMensajeDeConsola('dolphin:app:vista:bandeja')).toBe('bandeja')
    expect(vistaDeMensajeDeConsola('dolphin:app:vista:cosechas')).toBe('cosechas')
  })

  it('ignores unknown console views and other messages', () => {
    expect(vistaDeMensajeDeConsola('dolphin:app:vista:inventada')).toBeNull()
    expect(vistaDeMensajeDeConsola('dolphin:app:recargar')).toBeNull()
  })
})
