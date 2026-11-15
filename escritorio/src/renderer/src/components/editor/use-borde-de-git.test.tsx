// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { estado, refrescar, leer } = vi.hoisted(() => ({
  estado: {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: el store y el editor de mentira tienen sólo lo que el hook lee.
    gitStatusHeadByWorktree: { 'repo::/repo': 'abc' } as Record<string, string>,
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: el store y el editor de mentira tienen sólo lo que el hook lee.
    gitStatusByWorktree: {} as Record<string, unknown[]>
  },
  refrescar: vi.fn(),
  leer: vi.fn()
}))

vi.mock('@/store', async () => {
  const { useSyncExternalStore } = await import('react')
  const oyentes = new Set<() => void>()
  const useAppStore = (selector: (s: typeof estado) => unknown) => {
    return useSyncExternalStore(
      (oyente) => {
        oyentes.add(oyente)
        return () => oyentes.delete(oyente)
      },
      () => selector(estado)
    )
  }
  useAppStore.avisar = () => oyentes.forEach((oyente) => oyente())
  return { useAppStore }
})
vi.mock('@/lib/editor/monaco/monaco-setup', () => ({ monaco: {} }))
vi.mock('./revertir-trozo-monaco', () => ({ instalarRevertirTrozo: () => ({ dispose: () => {} }) }))
vi.mock('./bordes-de-git-en-monaco', () => ({
  instalarBordeDeGit: () => ({
    refrescar,
    hunkEn: () => null,
    hunks: () => [],
    revertir: () => {},
    dispose: () => {}
  })
}))

import { useAppStore } from '@/store'
import { useBordeDeGit } from './use-borde-de-git'

afterEach(() => vi.clearAllMocks())

describe('useBordeDeGit', () => {
  it('cuando el agente commitea, vuelve a leer la base y repinta', async () => {
    leer.mockResolvedValue({ content: 'base', exists: true, isBinary: false, failed: false })
    Object.assign(window, { api: { git: { fileBaseForGutter: leer } } })
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: el store y el editor de mentira tienen sólo lo que el hook lee.
    const editor = {} as Parameters<typeof useBordeDeGit>[0]['editor']
    renderHook(() => useBordeDeGit({ editor, rutaRelativa: 'src/a.ts', worktreeId: 'repo::/repo' }))
    await waitFor(() => expect(leer).toHaveBeenCalledTimes(1))

    leer.mockResolvedValue({ content: 'base nueva', exists: true, isBinary: false, failed: false })
    act(() => {
      estado.gitStatusHeadByWorktree = { 'repo::/repo': 'def' }
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: el store y el editor de mentira tienen sólo lo que el hook lee.
      ;(useAppStore as unknown as { avisar: () => void }).avisar()
    })

    await waitFor(() => expect(refrescar).toHaveBeenCalledWith('base nueva'))
    expect(leer).toHaveBeenCalledTimes(2)
  })
})
