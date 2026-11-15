import { describe, expect, it } from 'vitest'
import { rememberCandidateText } from './NativeChatRememberMenuItem'

describe('qué recuerda «Recordar esto»', () => {
  it('lo seleccionado manda sobre el mensaje', () => {
    expect(rememberCandidateText('  usá pnpm\n', 'Un mensaje largo que dice usá pnpm')).toBe(
      'usá pnpm'
    )
  })

  it('sin selección, el mensaje; sin nada, nada', () => {
    expect(rememberCandidateText('', 'Nunca toques\n  el lockfile')).toBe(
      'Nunca toques el lockfile'
    )
    expect(rememberCandidateText('   ', null)).toBeNull()
  })
})
