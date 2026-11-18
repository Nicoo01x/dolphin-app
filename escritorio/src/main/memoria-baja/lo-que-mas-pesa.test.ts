import { describe, expect, it } from 'vitest'
import { ORPHAN_WORKTREE_ID } from '../../shared/constants'
import type { WorktreeMemory } from '../../shared/process-stats-types'
import { loQueMasPesa, MINIMO_PARA_NOMBRAR } from './lo-que-mas-pesa'

const MB = 1024 ** 2

function espacio(worktreeId: string, memory: number): WorktreeMemory {
  return {
    worktreeId,
    worktreeName: `nombre-${worktreeId}`,
    repoId: `repo-${worktreeId}`,
    repoName: 'proyecto',
    cpu: 0,
    memory,
    sessions: [],
    history: []
  }
}

describe('loQueMasPesa', () => {
  it('nombra el espacio que más memoria usa', () => {
    const resultado = loQueMasPesa({
      worktrees: [espacio('a', 400 * MB), espacio('b', 1800 * MB), espacio('c', 900 * MB)],
      totalMemory: 4000 * MB
    })
    expect(resultado).toEqual({
      tipo: 'espacio',
      worktreeId: 'b',
      nombre: 'nombre-b',
      repoId: 'repo-b',
      repoNombre: 'proyecto',
      bytes: 1800 * MB
    })
  })

  it('no nombra los terminales sueltos, que no son de ningún espacio', () => {
    const resultado = loQueMasPesa({
      worktrees: [espacio(ORPHAN_WORKTREE_ID, 3000 * MB), espacio('a', 500 * MB)],
      totalMemory: 4000 * MB
    })
    expect(resultado).toMatchObject({ tipo: 'espacio', worktreeId: 'a' })
  })

  it('si nada pasa el mínimo, habla de Dolphin entero', () => {
    const resultado = loQueMasPesa({
      worktrees: [espacio('a', MINIMO_PARA_NOMBRAR - 1)],
      totalMemory: 1200 * MB
    })
    expect(resultado).toEqual({ tipo: 'dolphin', bytes: 1200 * MB })
  })

  it('sin espacios abiertos también es Dolphin entero', () => {
    expect(loQueMasPesa({ worktrees: [], totalMemory: 700 * MB })).toEqual({
      tipo: 'dolphin',
      bytes: 700 * MB
    })
  })
})
