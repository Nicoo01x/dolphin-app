import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CHOQUES_INTERVAL_MS,
  DolphinChoquesService,
  detectarChoquesEnRepo,
  resetDolphinChoquesWarningsForTests,
  supportsDolphinChoques
} from './dolphin-choques'

const tempPaths: string[] = []

function git(repoPath: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: repoPath, encoding: 'utf8' })
}

function makeRepo(): string {
  const repoPath = mkdtempSync(join(tmpdir(), 'dolphin-choques-'))
  tempPaths.push(repoPath)
  git(repoPath, 'init', '--quiet', '-b', 'main')
  git(repoPath, 'config', 'user.name', 'Dolphin Test')
  git(repoPath, 'config', 'user.email', 'dolphin@example.test')
  git(repoPath, 'config', 'core.hooksPath', '.git/no-hooks')
  writeFileSync(join(repoPath, 'shared.txt'), 'base\n')
  writeFileSync(join(repoPath, 'other.txt'), 'base\n')
  git(repoPath, 'add', '.')
  git(repoPath, 'commit', '--quiet', '-m', 'base')
  return repoPath
}

function addWorktree(repoPath: string, name: string): string {
  const worktreePath = join(repoPath, '..', `${name}-${Date.now()}-${Math.random()}`)
  git(repoPath, 'worktree', 'add', '--quiet', '-b', name, worktreePath, 'main')
  tempPaths.push(worktreePath)
  return worktreePath
}

afterEach(() => {
  resetDolphinChoquesWarningsForTests()
  for (const path of tempPaths.splice(0)) {
    rmSync(path, { recursive: true, force: true })
  }
})

describe('choques entre worktrees', () => {
  it('encuentra un choque cuando dos ramas modifican la misma línea', async () => {
    const repoPath = makeRepo()
    const a = addWorktree(repoPath, 'worktree-a')
    const b = addWorktree(repoPath, 'worktree-b')
    writeFileSync(join(a, 'shared.txt'), 'from a\n')
    git(a, 'commit', '--quiet', '-am', 'a')
    writeFileSync(join(b, 'shared.txt'), 'from b\n')
    git(b, 'commit', '--quiet', '-am', 'b')

    await expect(detectarChoquesEnRepo(repoPath, { baseRef: 'main' })).resolves.toEqual([
      { a: 'worktree-a', b: 'worktree-b', archivos: ['shared.txt'] }
    ])
  })

  it('no informa ramas que modifican archivos distintos', async () => {
    const repoPath = makeRepo()
    const a = addWorktree(repoPath, 'worktree-a')
    const b = addWorktree(repoPath, 'worktree-b')
    writeFileSync(join(a, 'shared.txt'), 'from a\n')
    git(a, 'commit', '--quiet', '-am', 'a')
    writeFileSync(join(b, 'other.txt'), 'from b\n')
    git(b, 'commit', '--quiet', '-am', 'b')

    await expect(detectarChoquesEnRepo(repoPath, { baseRef: 'main' })).resolves.toEqual([])
  })

  it('incluye un cambio sin commit sin modificar el worktree', async () => {
    const repoPath = makeRepo()
    const a = addWorktree(repoPath, 'worktree-a')
    const b = addWorktree(repoPath, 'worktree-b')
    writeFileSync(join(a, 'shared.txt'), 'from a\n')
    writeFileSync(join(b, 'shared.txt'), 'from b\n')
    const before = git(a, 'diff')

    await expect(detectarChoquesEnRepo(repoPath, { baseRef: 'main' })).resolves.toEqual([
      { a: 'worktree-a', b: 'worktree-b', archivos: ['shared.txt'] }
    ])
    expect(git(a, 'diff')).toBe(before)
  })

  it('no rompe con Git viejo y avisa una sola vez', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const repoPath = makeRepo()
    await expect(
      detectarChoquesEnRepo(repoPath, { versionOutput: 'git version 2.37.9' })
    ).resolves.toEqual([])
    await expect(
      detectarChoquesEnRepo(repoPath, { versionOutput: 'git version 2.37.9' })
    ).resolves.toEqual([])
    expect(warn).toHaveBeenCalledOnce()
    expect(supportsDolphinChoques('git version 2.38.0')).toBe(true)
    expect(supportsDolphinChoques('git version 2.37.9')).toBe(false)
    warn.mockRestore()
  })
})

describe('servicio de choques', () => {
  it('recalcula sólo cuando alguien lee y el último cálculo ya venció', async () => {
    let ahora = 1_000
    const getRepos = vi.fn(() => [])
    const servicio = new DolphinChoquesService(getRepos, () => ahora)

    servicio.start()
    // Se suma al cálculo que arrancó start y espera a que termine.
    await servicio.refresh()
    expect(getRepos).toHaveBeenCalledTimes(1)

    ahora += CHOQUES_INTERVAL_MS - 1
    servicio.get()
    expect(getRepos).toHaveBeenCalledTimes(1)

    ahora += 1
    servicio.get()
    expect(getRepos).toHaveBeenCalledTimes(2)
    await servicio.refresh()
  })

  it('después de stop una lectura no dispara un cálculo', () => {
    let ahora = 1_000
    const getRepos = vi.fn(() => [])
    const servicio = new DolphinChoquesService(getRepos, () => ahora)

    servicio.start()
    servicio.stop()
    getRepos.mockClear()
    ahora += CHOQUES_INTERVAL_MS * 2
    servicio.get()

    expect(getRepos).not.toHaveBeenCalled()
  })
})
