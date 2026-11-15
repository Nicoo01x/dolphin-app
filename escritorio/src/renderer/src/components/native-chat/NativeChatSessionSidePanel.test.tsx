// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NativeChatSessionSidePanelFromInput } from './NativeChatSessionSidePanel'
import type { NativeChatSessionSidePanelInput } from './native-chat-session-side-panel-model'

const emptyInput: NativeChatSessionSidePanelInput = {
  host: null,
  repo: null,
  branch: null,
  git: {
    available: false,
    loading: false,
    error: false,
    summary: null,
    branchEntries: [],
    statusEntries: [],
    lineTotal: null
  },
  connectors: { status: 'empty', names: [] },
  contextUsage: null,
  pullRequest: 'none',
  messages: [],
  portonRepoPath: null
}

// Why a mano: la suite corre sin los globals de vitest, así que el limpiado automático de Testing
// Library no se engancha y lo que pintó un test queda en el documento del siguiente.
afterEach(cleanup)

describe('NativeChatSessionSidePanel', () => {
  it('renders the six cards and their empty states', () => {
    render(<NativeChatSessionSidePanelFromInput input={emptyInput} />)

    expect(screen.getByTestId('session-side-panel-environment')).toBeDefined()
    expect(screen.getByTestId('session-side-panel-connectors')).toBeDefined()
    expect(screen.getByTestId('session-side-panel-timeline')).toBeDefined()
    expect(screen.getByTestId('session-side-panel-changes')).toBeDefined()
    expect(screen.getByTestId('session-side-panel-porton')).toBeDefined()
    expect(screen.getByTestId('session-side-panel-context')).toBeDefined()
    expect(screen.getByText('No environment')).toBeDefined()
    expect(screen.getByText('No connectors')).toBeDefined()
    // Esta tarjeta es de Dolphin y sus textos todavía no están en el catálogo: sale el de respaldo,
    // igual que los de la ventana de delegación.
    expect(screen.getByText('Todavía no pasó nada en esta charla')).toBeDefined()
    expect(screen.getByText('No changes')).toBeDefined()
    expect(screen.getByText('Context unavailable')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Run the gate' })).toBeDefined()
  })

  it('la línea de tiempo cuenta lo que fue pasando, con la hora de cada hito', () => {
    render(
      <NativeChatSessionSidePanelFromInput
        input={{
          ...emptyInput,
          messages: [
            {
              id: 'm1',
              role: 'user',
              blocks: [{ type: 'text', text: 'arreglá el login' }],
              timestamp: Date.parse('2026-10-31T15:04:00Z'),
              source: 'transcript'
            },
            {
              id: 'm2',
              role: 'assistant',
              model: 'claude-opus-5-5',
              blocks: [
                { type: 'tool-call', name: 'Edit', callId: 'c1', input: { file_path: '/r/a.ts' } }
              ],
              timestamp: Date.parse('2026-10-31T15:05:00Z'),
              source: 'transcript'
            }
          ]
        }}
      />
    )

    // Acotado a la tarjeta: el archivo también está en «Lo que tocó el agente», más abajo.
    const tarjeta = within(screen.getByTestId('session-side-panel-timeline'))
    expect(tarjeta.getByText('arreglá el login')).toBeDefined()
    // El chip del modelo lleva la marca, que es de donde sale su logo.
    expect(tarjeta.getByText('Opus 5.5').getAttribute('data-marca')).toBe('claude')
    expect(tarjeta.getByText('a.ts')).toBeDefined()
    // La hora, en la del que mira: se espera la misma cuenta, no un número clavado.
    const hora = new Date(Date.parse('2026-10-31T15:04:00Z')).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit'
    })
    expect(tarjeta.getByText(hora)).toBeDefined()
  })

  it('renders the files touched by this session above git changes and opens them', () => {
    const onOpenSessionFile = vi.fn()
    render(
      <NativeChatSessionSidePanelFromInput
        input={{
          ...emptyInput,
          repo: { name: 'repo', path: '~/Projects' },
          messages: [
            {
              id: 'agent-1',
              role: 'assistant',
              blocks: [{ type: 'tool-call', name: 'Edit', input: { file_path: 'src/agent.ts' } }],
              timestamp: null,
              source: 'transcript'
            }
          ]
        }}
        onOpenSessionFile={onOpenSessionFile}
      />
    )

    expect(screen.getByText(/What the agent touched|Lo que tocó el agente/)).toBeDefined()
    const file = screen.getByRole('button', { name: /src\/agent\.ts/ })
    fireEvent.click(file)
    expect(onOpenSessionFile).toHaveBeenCalledWith(expect.anything(), 'src/agent.ts')
  })

  it('renders totals, connector names, context usage, and PR action', () => {
    render(
      <NativeChatSessionSidePanelFromInput
        input={{
          ...emptyInput,
          host: 'Esta computadora',
          repo: { name: 'repo', path: '~/Projects' },
          branch: { kind: 'branch', branchName: 'main' },
          git: {
            ...emptyInput.git,
            available: true,
            summary: {
              baseRef: 'main',
              baseOid: 'base',
              compareRef: 'HEAD',
              headOid: 'head',
              mergeBase: 'base',
              changedFiles: 1,
              status: 'ready'
            },
            branchEntries: [{ path: 'README.md', status: 'modified', added: 5, removed: 3 }],
            lineTotal: { added: 5, removed: 3, mergeBase: 'base' }
          },
          connectors: { status: 'ready', names: ['Linear'] },
          contextUsage: {
            usedTokens: 71_000,
            windowTokens: 200_000,
            percentage: 36,
            estimated: false,
            rows: []
          },
          pullRequest: 'create',
          messages: [],
          portonRepoPath: null
        }}
      />
    )

    expect(screen.getByText('Linear')).toBeDefined()
    expect(screen.getAllByText('+5').length).toBeGreaterThan(0)
    expect(screen.getAllByText('−3').length).toBeGreaterThan(0)
    expect(screen.getByText('README.md')).toBeDefined()
    expect(screen.getByText('36%')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Create PR' })).toBeDefined()
  })
})
