// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { AgentStatusEntry } from '../../../../../shared/agent-status/contracts/agent-status-types'

const estado: {
  tabsByWorktree: Record<string, { id: string }[]>
  agentStatusByPaneKey: Record<string, AgentStatusEntry>
} = { tabsByWorktree: {}, agentStatusByPaneKey: {} }

vi.mock('@/store', () => ({
  useAppStore: (selector: (s: typeof estado) => unknown) => selector(estado)
}))

const irAlTrabajo = vi.fn()
vi.mock('./delegar-en-trabajos', () => ({
  irAlTrabajo: (...args: unknown[]) => irAlTrabajo(...args)
}))

import { TiraDeCompaneros } from './TiraDeCompaneros'
import { recordarTrabajos, vaciarTrabajosRecordados } from './trabajos-delegados'

const WT = 'repo::/wt'

function entrada(state: AgentStatusEntry['state']): AgentStatusEntry {
  return { state, prompt: '', updatedAt: 1 } as AgentStatusEntry
}

function dibujar(): void {
  render(
    <TooltipProvider>
      <TiraDeCompaneros worktreeId={WT} agente="claude" />
    </TooltipProvider>
  )
}

beforeEach(() => {
  vaciarTrabajosRecordados()
  estado.tabsByWorktree = {}
  estado.agentStatusByPaneKey = {}
  irAlTrabajo.mockClear()
})

afterEach(cleanup)

describe('tira de compañeros', () => {
  it('nombra a cada compañero abierto', () => {
    recordarTrabajos(WT, [
      { tareaId: 't1', titulo: 'la tabla', tabId: 'tab-1' },
      { tareaId: 't2', titulo: 'el filtro', tabId: 'tab-2' }
    ])
    estado.tabsByWorktree = { [WT]: [{ id: 'tab-1' }, { id: 'tab-2' }] }
    dibujar()
    expect(screen.getByRole('button', { name: /la tabla/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /el filtro/ })).toBeTruthy()
  })

  // Es para lo que existe: el acceso que la ventana de delegación se llevaba al cerrarse.
  it('tocar un compañero lleva a su pestaña', async () => {
    recordarTrabajos(WT, [{ tareaId: 't1', titulo: 'la tabla', tabId: 'tab-1' }])
    estado.tabsByWorktree = { [WT]: [{ id: 'tab-1' }] }
    dibujar()
    await userEvent.click(screen.getByRole('button', { name: /la tabla/ }))
    expect(irAlTrabajo).toHaveBeenCalledWith(WT, 'tab-1')
  })

  it('dice en qué anda cada uno', () => {
    recordarTrabajos(WT, [{ tareaId: 't1', titulo: 'la tabla', tabId: 'tab-1' }])
    estado.tabsByWorktree = { [WT]: [{ id: 'tab-1' }] }
    estado.agentStatusByPaneKey = { 'tab-1:hoja': entrada('working') }
    dibujar()
    expect(screen.getByLabelText('Working')).toBeTruthy()
  })

  // Un compañero recién abierto todavía no reportó: un punto gris afirmaría que está quieto.
  it('un compañero sin estado no muestra ninguno', () => {
    recordarTrabajos(WT, [{ tareaId: 't1', titulo: 'la tabla', tabId: 'tab-1' }])
    estado.tabsByWorktree = { [WT]: [{ id: 'tab-1' }] }
    dibujar()
    expect(screen.queryByLabelText('Working')).toBeNull()
    expect(screen.queryByLabelText('Idle')).toBeNull()
  })

  it('un compañero cuya pestaña se cerró deja de ofrecerse', () => {
    recordarTrabajos(WT, [
      { tareaId: 't1', titulo: 'la tabla', tabId: 'tab-1' },
      { tareaId: 't2', titulo: 'el filtro', tabId: 'tab-2' }
    ])
    estado.tabsByWorktree = { [WT]: [{ id: 'tab-1' }] }
    dibujar()
    expect(screen.getByRole('button', { name: /la tabla/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /el filtro/ })).toBeNull()
  })

  // Sin compañeros no ocupa ni un pixel: una tira vacía sobre el chat es ruido.
  it('sin compañeros no dibuja nada', () => {
    const { container } = render(
      <TooltipProvider>
        <TiraDeCompaneros worktreeId={WT} agente="claude" />
      </TooltipProvider>
    )
    expect(container.querySelector('[role="group"]')).toBeNull()
  })

  it('sin proyecto no dibuja nada', () => {
    recordarTrabajos(WT, [{ tareaId: 't1', titulo: 'la tabla', tabId: 'tab-1' }])
    const { container } = render(
      <TooltipProvider>
        <TiraDeCompaneros worktreeId={null} agente="claude" />
      </TooltipProvider>
    )
    expect(container.querySelector('[role="group"]')).toBeNull()
  })

  // A un motor que no es de terminal no se le delega, así que no puede tener compañeros.
  it('con un motor que no es de terminal no dibuja nada', () => {
    recordarTrabajos(WT, [{ tareaId: 't1', titulo: 'la tabla', tabId: 'tab-1' }])
    estado.tabsByWorktree = { [WT]: [{ id: 'tab-1' }] }
    const { container } = render(
      <TooltipProvider>
        <TiraDeCompaneros worktreeId={WT} agente="unknown" />
      </TooltipProvider>
    )
    expect(container.querySelector('[role="group"]')).toBeNull()
  })

  it('esconder la tira saca las pastillas sin cerrar a nadie', async () => {
    recordarTrabajos(WT, [{ tareaId: 't1', titulo: 'la tabla', tabId: 'tab-1' }])
    estado.tabsByWorktree = { [WT]: [{ id: 'tab-1' }] }
    dibujar()
    await userEvent.click(screen.getByRole('button', { name: /hide the teammates/i }))
    expect(screen.queryByRole('button', { name: /la tabla/ })).toBeNull()
    // La pestaña sigue abierta: esconder la tira no es cerrar compañeros.
    expect(estado.tabsByWorktree[WT]).toHaveLength(1)
  })
})
