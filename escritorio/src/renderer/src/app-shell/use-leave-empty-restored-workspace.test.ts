import { describe, expect, it, vi } from 'vitest'

vi.mock('@/store', () => ({ useAppStore: Object.assign(() => false, { getState: () => ({}) }) }))

import { shouldLeaveRestoredWorkspace } from './use-leave-empty-restored-workspace'

describe('shouldLeaveRestoredWorkspace', () => {
  it('suelta el espacio restaurado que no tiene ninguna pestaña', () => {
    expect(
      shouldLeaveRestoredWorkspace({ restored: true, activeWorktreeId: 'w', renderableTabCount: 0 })
    ).toBe(true)
  })

  it('no toca un espacio que tiene algo que mostrar', () => {
    expect(
      shouldLeaveRestoredWorkspace({ restored: true, activeWorktreeId: 'w', renderableTabCount: 2 })
    ).toBe(false)
  })

  it('no decide nada antes de que termine la restauración', () => {
    expect(
      shouldLeaveRestoredWorkspace({
        restored: false,
        activeWorktreeId: 'w',
        renderableTabCount: 0
      })
    ).toBe(false)
  })

  it('sin espacio activo no hay nada que soltar', () => {
    expect(
      shouldLeaveRestoredWorkspace({
        restored: true,
        activeWorktreeId: null,
        renderableTabCount: 0
      })
    ).toBe(false)
  })
})
