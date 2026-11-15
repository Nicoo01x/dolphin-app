import { describe, expect, it } from 'vitest'
import { GEMINI_SESSION_HISTORY } from './gemini-session-history'

const UUID = '0b5f2c1e-8d4a-4f7b-9c3e-2a1d6e5f4b3c'

describe('las filas de Session History de un chat de Gemini', () => {
  it('se listan con el id de sesión ACP, como Gemini graba su charla', () => {
    expect(GEMINI_SESSION_HISTORY.rowAgents).toEqual(['gemini'])
    expect(
      GEMINI_SESSION_HISTORY.rowSessionId({
        linkId: 'link-1',
        handle: { transport: 'acp', agent: 'gemini', nativeId: UUID },
        origin: 'created',
        mintedAtFence: 1,
        observedAt: 1
      })
    ).toBe(UUID)
  })

  it.each([
    [['--resume', UUID], UUID],
    [['-r', UUID, 'seguí con esto'], UUID],
    [[`--resume=${UUID}`], UUID]
  ])('un `%j` retoma esa sola charla', (args, target) => {
    expect(GEMINI_SESSION_HISTORY.parseResumeArgs(args)).toEqual({ target })
  })

  it.each([[['--resume', 'latest']], [['-r', '5']], [['--resume']], [['--resume', '--yolo']]])(
    'un `%j` puede abrir cualquier charla de la carpeta',
    (args) => {
      expect(GEMINI_SESSION_HISTORY.parseResumeArgs(args)).toEqual({ target: null })
    }
  )

  it('sin `--resume` no retoma nada', () => {
    expect(GEMINI_SESSION_HISTORY.parseResumeArgs(['--acp'])).toBeNull()
    expect(GEMINI_SESSION_HISTORY.parseResumeArgs(['-p', 'hola'])).toBeNull()
  })
})
