/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const tablero = vi.fn()
const resolverGate = vi.fn().mockResolvedValue({})

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: { closeOrchestrationPage: () => void }) => unknown) =>
    selector({ closeOrchestrationPage: vi.fn() })
}))

import OrchestrationPage from './OrchestrationPage'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('OrchestrationPage', () => {
  it('shows the designed empty state', async () => {
    tablero.mockResolvedValue({ disponible: true, runs: [] })
    Object.assign(window, {
      api: { dolphin: { orquestacionTablero: tablero, orquestacionResolverGate: resolverGate } }
    })
    render(<OrchestrationPage />)
    expect(await screen.findByText(/There are no runs yet/)).toBeTruthy()
  })

  it('resolves a pending gate with the selected option', async () => {
    tablero.mockResolvedValue({
      disponible: true,
      runs: [
        {
          id: 'run-1',
          objective: 'Objetivo',
          createdAt: '',
          coordinatorHandle: null,
          tasks: [],
          gates: [{ id: 'gate-1', question: '¿Seguimos?', options: ['Sí'] }],
          messages: []
        }
      ]
    })
    Object.assign(window, {
      api: { dolphin: { orquestacionTablero: tablero, orquestacionResolverGate: resolverGate } }
    })
    render(<OrchestrationPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sí' }))
    await waitFor(() =>
      expect(resolverGate).toHaveBeenCalledWith({ gateId: 'gate-1', decision: 'Sí' })
    )
  })

  it('disables gate options and shows an actionable error when resolving fails', async () => {
    resolverGate.mockRejectedValueOnce(new Error('gate unavailable'))
    tablero.mockResolvedValue({
      disponible: true,
      runs: [
        {
          id: 'run-1',
          objective: 'Objetivo',
          createdAt: '',
          coordinatorHandle: null,
          tasks: [],
          gates: [{ id: 'gate-1', question: '¿Seguimos?', options: ['Sí', 'No'] }],
          messages: []
        }
      ]
    })
    Object.assign(window, {
      api: { dolphin: { orquestacionTablero: tablero, orquestacionResolverGate: resolverGate } }
    })
    render(<OrchestrationPage />)
    const option = await screen.findByRole('button', { name: 'Sí' })
    fireEvent.click(option)
    expect(option.hasAttribute('disabled')).toBe(true)
    expect(await screen.findByText(/gate unavailable/)).toBeTruthy()
    expect(screen.getByText(/Try again/)).toBeTruthy()
  })
})
