// @vitest-environment happy-dom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const pestanasPorWorktree: Record<string, { id: string }[]> = {}

vi.mock('@/store', () => ({
  useAppStore: (selector: (estado: unknown) => unknown) =>
    selector({ tabsByWorktree: pestanasPorWorktree })
}))

import {
  olvidarTrabajos,
  recordarTrabajos,
  trabajosRecordados,
  useTrabajosDelegados,
  vaciarTrabajosRecordados
} from './trabajos-delegados'

const WT = 'repo::/wt'

function trabajo(n: number) {
  return { tareaId: `t${n}`, titulo: `tarea ${n}`, tabId: `tab-${n}` }
}

function abrirPestanas(...ids: string[]): void {
  pestanasPorWorktree[WT] = ids.map((id) => ({ id }))
}

beforeEach(() => {
  vaciarTrabajosRecordados()
  for (const clave of Object.keys(pestanasPorWorktree)) {
    delete pestanasPorWorktree[clave]
  }
})

afterEach(cleanup)

describe('trabajos delegados', () => {
  it('recuerda los compañeros de una delegación', () => {
    recordarTrabajos(WT, [trabajo(1), trabajo(2)])
    expect(trabajosRecordados(WT).map((t) => t.tabId)).toEqual(['tab-1', 'tab-2'])
  })

  // Delegar dos planes seguidos deja los dos equipos trabajando: la tira nombra a los dos.
  it('una segunda delegación suma, no reemplaza', () => {
    recordarTrabajos(WT, [trabajo(1)])
    recordarTrabajos(WT, [trabajo(2)])
    expect(trabajosRecordados(WT).map((t) => t.tabId)).toEqual(['tab-1', 'tab-2'])
  })

  it('el mismo compañero no se anota dos veces', () => {
    recordarTrabajos(WT, [trabajo(1)])
    recordarTrabajos(WT, [trabajo(1)])
    expect(trabajosRecordados(WT)).toHaveLength(1)
  })

  it('cada proyecto tiene su propia tira', () => {
    recordarTrabajos(WT, [trabajo(1)])
    recordarTrabajos('otro::/wt', [trabajo(2)])
    expect(trabajosRecordados(WT).map((t) => t.tabId)).toEqual(['tab-1'])
    expect(trabajosRecordados('otro::/wt').map((t) => t.tabId)).toEqual(['tab-2'])
  })

  it('sin proyecto no hay nada que mostrar', () => {
    expect(trabajosRecordados(null)).toEqual([])
  })

  it('olvidar esconde la tira de ese proyecto y deja la del otro', () => {
    recordarTrabajos(WT, [trabajo(1)])
    recordarTrabajos('otro::/wt', [trabajo(2)])
    olvidarTrabajos(WT)
    expect(trabajosRecordados(WT)).toEqual([])
    expect(trabajosRecordados('otro::/wt')).toHaveLength(1)
  })

  /**
   * La que hace honesta a la tira: una pastilla que lleva a una pestaña cerrada promete un lugar al
   * que ya no se puede ir.
   */
  it('un compañero cuya pestaña se cerró no se muestra', () => {
    recordarTrabajos(WT, [trabajo(1), trabajo(2)])
    abrirPestanas('tab-1')
    const { result } = renderHook(() => useTrabajosDelegados(WT))
    expect(result.current.map((t) => t.tabId)).toEqual(['tab-1'])
  })

  it('con todas las pestañas abiertas los muestra todos', () => {
    recordarTrabajos(WT, [trabajo(1), trabajo(2)])
    abrirPestanas('tab-1', 'tab-2')
    const { result } = renderHook(() => useTrabajosDelegados(WT))
    expect(result.current.map((t) => t.tabId)).toEqual(['tab-1', 'tab-2'])
  })

  it('sin compañeros anotados devuelve la lista vacía', () => {
    abrirPestanas('tab-9')
    const { result } = renderHook(() => useTrabajosDelegados(WT))
    expect(result.current).toEqual([])
  })
})
