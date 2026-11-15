// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CheckRowTime } from './CheckRowTime'
import type { PRCheckDetail } from '../../../../../shared/github/check-types'

const AHORA = Date.parse('2026-11-10T12:00:00Z')

function dibujar(check: Partial<PRCheckDetail>): void {
  render(
    <TooltipProvider>
      <CheckRowTime
        check={{ name: 'build', status: 'completed', conclusion: 'success', url: null, ...check }}
      />
    </TooltipProvider>
  )
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(AHORA)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('el tiempo de un check en su fila', () => {
  it('dice cuánto tardó y hace cuánto terminó', () => {
    dibujar({ startedAt: '2026-11-10T11:50:00Z', completedAt: '2026-11-10T11:53:12Z' })

    expect(screen.getByText('3m 12s')).toBeInTheDocument()
    expect(screen.getByText('6 min. ago')).toBeInTheDocument()
  })

  it('mientras corre dice sólo cuánto lleva', () => {
    dibujar({ status: 'in_progress', conclusion: null, startedAt: '2026-11-10T11:48:00Z' })

    expect(screen.getByText('12m')).toBeInTheDocument()
    expect(screen.queryByText(/ago/)).not.toBeInTheDocument()
  })

  it('sin tiempos no dibuja nada, ni un hueco', () => {
    // Why: las filas de aprobación y los hosts que no dan fechas tienen que verse igual que antes.
    const { container } = render(
      <TooltipProvider>
        <CheckRowTime
          check={{
            name: 'approval',
            status: 'completed',
            conclusion: 'action_required',
            url: null
          }}
        />
      </TooltipProvider>
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('al pasar el puntero muestra las horas exactas', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    dibujar({ startedAt: '2026-11-10T11:50:00Z', completedAt: '2026-11-10T11:53:12Z' })

    await usuario.hover(screen.getByText('3m 12s'))
    const tooltip = await screen.findByRole('tooltip')

    expect(tooltip).toHaveTextContent('Started')
    expect(tooltip).toHaveTextContent('Finished')
  })

  it('la edad se pone al día sola, sin que nadie vuelva a dibujar la lista', () => {
    // Why: la lista sólo se redibuja cuando cambian los checks, y «9m ago» tiene que pasar a
    // «10m ago» mirando la pantalla.
    dibujar({ startedAt: '2026-11-10T11:50:00Z', completedAt: '2026-11-10T11:51:00Z' })
    expect(screen.getByText('9 min. ago')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(60_000)
    })

    expect(screen.getByText('10 min. ago')).toBeInTheDocument()
  })
})
