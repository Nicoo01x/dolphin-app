// @vitest-environment happy-dom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./delegar-en-trabajos', () => ({
  delegarEnTrabajos: vi.fn(() => [{ tareaId: 't1', titulo: 'la tabla', tabId: 'tab-1' }])
}))

import { delegarEnTrabajos } from './delegar-en-trabajos'
import { useDelegacionAutomatica } from './use-delegacion-automatica'
import type { PropuestaDeDelegacion } from './propuesta-de-delegacion'

function propuesta(titulos: readonly string[]): PropuestaDeDelegacion {
  return {
    tareas: titulos.map((titulo, i) => ({
      id: `t${i + 1}`,
      titulo,
      pedido: `hacé ${titulo}`
    }))
  } as PropuestaDeDelegacion
}

const BASE = {
  prendida: true,
  agente: 'claude' as const,
  worktreeId: 'repo::/wt',
  alDelegar: () => {}
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('delegación automática', () => {
  it('apagada no abre a nadie', () => {
    renderHook(() =>
      useDelegacionAutomatica({ ...BASE, prendida: false, propuesta: propuesta(['la tabla']) })
    )
    expect(delegarEnTrabajos).not.toHaveBeenCalled()
  })

  it('prendida abre el plan entero sin preguntar', () => {
    const alDelegar = vi.fn()
    renderHook(() =>
      useDelegacionAutomatica({
        ...BASE,
        alDelegar,
        propuesta: propuesta(['la tabla', 'el filtro'])
      })
    )
    expect(delegarEnTrabajos).toHaveBeenCalledTimes(1)
    expect(vi.mocked(delegarEnTrabajos).mock.calls[0]?.[0].tareas).toHaveLength(2)
    expect(alDelegar).toHaveBeenCalledTimes(1)
  })

  // Abrir compañeros gasta: un segundo disparo del mismo plan no es una molestia, es una cuenta.
  it('el mismo plan no abre un segundo equipo aunque vuelva a renderizarse', () => {
    const mismo = propuesta(['la tabla'])
    const inicial: { propuesta: PropuestaDeDelegacion | null } = { propuesta: mismo }
    const { rerender } = renderHook(
      (props: { propuesta: PropuestaDeDelegacion | null }) =>
        useDelegacionAutomatica({ ...BASE, propuesta: props.propuesta }),
      { initialProps: inicial }
    )
    rerender({ propuesta: null })
    rerender({ propuesta: mismo })
    rerender({ propuesta: propuesta(['la tabla']) })
    expect(delegarEnTrabajos).toHaveBeenCalledTimes(1)
  })

  it('un plan distinto sí abre su propio equipo', () => {
    const { rerender } = renderHook(
      (props: { propuesta: PropuestaDeDelegacion | null }) =>
        useDelegacionAutomatica({ ...BASE, propuesta: props.propuesta }),
      { initialProps: { propuesta: propuesta(['la tabla']) } }
    )
    rerender({ propuesta: propuesta(['el filtro']) })
    expect(delegarEnTrabajos).toHaveBeenCalledTimes(2)
  })

  it('sin espacio de trabajo no abre nada', () => {
    renderHook(() =>
      useDelegacionAutomatica({ ...BASE, worktreeId: null, propuesta: propuesta(['la tabla']) })
    )
    expect(delegarEnTrabajos).not.toHaveBeenCalled()
  })
})
