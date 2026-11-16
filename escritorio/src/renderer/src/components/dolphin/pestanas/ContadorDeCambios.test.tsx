// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({
  gitBranchLineTotalByWorktree: {} as Record<string, unknown>,
  gitBranchCompareSummaryByWorktree: {} as Record<string, unknown>
}))
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: typeof estado) => unknown) => selector(estado)
}))
vi.mock('@/i18n/use-translate', () => ({
  useTranslate: () => (_key: string, fallback: string) => fallback,
  useIntlLocale: () => 'es-AR'
}))

import { ContadorDeCambios } from './ContadorDeCambios'

afterEach(() => {
  cleanup()
  estado.gitBranchLineTotalByWorktree = {}
  estado.gitBranchCompareSummaryByWorktree = {}
})

describe('el contador de cambios de las pestañas', () => {
  it('muestra el mismo total de la rama que el panel de cambios', () => {
    estado.gitBranchLineTotalByWorktree = { wt: { added: 1185, removed: 24, mergeBase: 'abc' } }
    estado.gitBranchCompareSummaryByWorktree = { wt: { mergeBase: 'abc' } }
    const { container } = render(<ContadorDeCambios worktreeId="wt" />)
    expect(container.textContent).toBe('+1.185−24')
  })

  // Un total medido contra otro punto de bifurcación es viejo: el panel lo descarta y acá también.
  it('no muestra un total medido contra un punto de bifurcación viejo', () => {
    estado.gitBranchLineTotalByWorktree = { wt: { added: 3, removed: 1, mergeBase: 'viejo' } }
    estado.gitBranchCompareSummaryByWorktree = { wt: { mergeBase: 'nuevo' } }
    const { container } = render(<ContadorDeCambios worktreeId="wt" />)
    expect(container.textContent).toBe('')
  })

  it('sin cambios, o sin espacio de trabajo, no dibuja nada', () => {
    estado.gitBranchLineTotalByWorktree = { wt: { added: 0, removed: 0, mergeBase: 'abc' } }
    estado.gitBranchCompareSummaryByWorktree = { wt: { mergeBase: 'abc' } }
    expect(render(<ContadorDeCambios worktreeId="wt" />).container.textContent).toBe('')
    expect(render(<ContadorDeCambios worktreeId={null} />).container.textContent).toBe('')
  })
})
