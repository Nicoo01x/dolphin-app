// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n/i18n'
import type { DolphinPortonState } from './use-dolphin-porton'
import { useDolphinPorton } from './use-dolphin-porton'
import { StudioPorton } from './StudioPorton'

vi.mock('./use-dolphin-porton', () => ({ useDolphinPorton: vi.fn() }))

const mockedUseDolphinPorton = vi.mocked(useDolphinPorton)

function state(
  overrides: Partial<DolphinPortonState> & { start?: () => void } = {}
): DolphinPortonState & { start: () => void } {
  const { start = vi.fn(), ...porton } = overrides
  return {
    running: false,
    starting: false,
    run: {
      desde: 'antes',
      hasta: 'después',
      fases: [{ nombre: 'revisión', estado: 'fallo', detalle: 'revisión: Hay una duda.' }]
    },
    interrupted: false,
    failure: null,
    ...porton,
    start
  }
}

describe('StudioPorton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseDolphinPorton.mockReturnValue(state())
  })

  afterEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('shows the review concern without its protocol prefix', async () => {
    await i18n.changeLanguage('es')
    render(<StudioPorton repoPath="/repo" isVisible revision={{ tarea: 'Arreglalo' }} />)

    expect(screen.getByText('Otro modelo tiene dudas: Hay una duda.')).toBeDefined()
  })

  it('shows the accepted review line', async () => {
    await i18n.changeLanguage('es')
    mockedUseDolphinPorton.mockReturnValue(
      state({
        run: {
          desde: 'antes',
          hasta: 'después',
          fases: [{ nombre: 'revisión', estado: 'paso' }]
        }
      })
    )
    render(<StudioPorton repoPath="/repo" isVisible revision={{ tarea: 'Arreglalo' }} />)

    expect(screen.getByText('Otro modelo lo revisó y lo acepta')).toBeDefined()
  })

  it.each([
    [true, 1],
    [false, 0]
  ])('starts one review when the agent stops and the setting is %s', (enabled, calls) => {
    const start = vi.fn()
    mockedUseDolphinPorton.mockReturnValue(state({ start }))
    const { rerender } = render(
      <StudioPorton
        repoPath="/repo"
        isVisible
        revision={{ tarea: 'Arreglalo' }}
        autoReview={{ enabled, agentWorking: true, hasChanges: true }}
      />
    )

    rerender(
      <StudioPorton
        repoPath="/repo"
        isVisible
        revision={{ tarea: 'Arreglalo' }}
        autoReview={{ enabled, agentWorking: false, hasChanges: true }}
      />
    )
    rerender(
      <StudioPorton
        repoPath="/repo"
        isVisible
        revision={{ tarea: 'Arreglalo' }}
        autoReview={{ enabled, agentWorking: false, hasChanges: true }}
      />
    )

    expect(start).toHaveBeenCalledTimes(calls)
  })
})
