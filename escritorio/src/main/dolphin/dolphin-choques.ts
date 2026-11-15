import { basename } from 'node:path'
import type { Repo } from '../../shared/repo-types'
import type { GitWorktreeInfo } from '../../shared/worktree/types'
import type {
  DolphinChoque,
  DolphinChoquesRepo,
  DolphinChoquesResult
} from '../../shared/dolphin-choques'
import { listWorktreeGraph } from '../git/worktrees/catalog/worktree-scan-cache'
import { gitExecFileAsync } from '../git/runner'

export const CHOQUES_INTERVAL_MS = 120_000
export const CHOQUES_MAX_PARES = 64
export const CHOQUES_MAX_TIEMPO_MS = 12_000
const GIT_MERGE_TREE_MIN_VERSION = [2, 38, 0] as const
const GIT_COMMAND_TIMEOUT_MS = 3_000

let oldGitWarningShown = false

type ScanOptions = {
  baseRef?: string
  maxPairs?: number
  timeoutMs?: number
  versionOutput?: string
}

type Target = {
  name: string
  revision: string
}

function outputFromError(error: unknown): string {
  if (!error || typeof error !== 'object' || !('stdout' in error)) {
    return ''
  }
  const stdout = error.stdout
  return typeof stdout === 'string' ? stdout : ''
}

function gitVersionParts(output: string): [number, number, number] | null {
  const match = /git version (\d+)\.(\d+)(?:\.(\d+))?/.exec(output)
  if (!match) {
    return null
  }
  return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)]
}

export function supportsDolphinChoques(output: string): boolean {
  const version = gitVersionParts(output)
  return version
    ? version[0] > GIT_MERGE_TREE_MIN_VERSION[0] ||
        (version[0] === GIT_MERGE_TREE_MIN_VERSION[0] &&
          (version[1] > GIT_MERGE_TREE_MIN_VERSION[1] ||
            (version[1] === GIT_MERGE_TREE_MIN_VERSION[1] &&
              version[2] >= GIT_MERGE_TREE_MIN_VERSION[2])))
    : false
}

function warnOldGitOnce(): void {
  if (oldGitWarningShown) {
    return
  }
  oldGitWarningShown = true
  console.warn('[dolphin/choques] Git 2.38 or newer is required; conflict checks are disabled.')
}

function worktreeName(worktree: GitWorktreeInfo): string {
  const branch = worktree.branch?.replace(/^refs\/heads\//, '')
  return branch || basename(worktree.path)
}

function conflictFiles(output: string): string[] {
  return [
    ...new Set(
      output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !/^[0-9a-f]{40}$/.test(line))
    )
  ]
}

async function gitRead(args: string[], cwd: string, deadline: number): Promise<{ stdout: string }> {
  const remaining = Math.min(GIT_COMMAND_TIMEOUT_MS, deadline - Date.now())
  if (remaining <= 0) {
    throw new Error('Dolphin conflict scan timed out.')
  }
  return gitExecFileAsync(args, { cwd, timeout: remaining })
}

async function mergeTree(
  repoPath: string,
  a: string,
  b: string,
  deadline: number
): Promise<string[]> {
  try {
    const result = await gitRead(
      ['merge-tree', '--write-tree', '--name-only', '--no-messages', a, b],
      repoPath,
      deadline
    )
    return conflictFiles(result.stdout)
  } catch (error) {
    return conflictFiles(outputFromError(error))
  }
}

function baseName(ref: string): string {
  return ref.replace(/^refs\/(heads|remotes)\//, '')
}

export async function detectarChoquesEnRepo(
  repoPath: string,
  options: ScanOptions = {}
): Promise<DolphinChoque[]> {
  const deadline = Date.now() + (options.timeoutMs ?? CHOQUES_MAX_TIEMPO_MS)
  let version: { stdout: string }
  try {
    version = options.versionOutput
      ? { stdout: options.versionOutput }
      : await gitRead(['version'], repoPath, deadline)
  } catch {
    warnOldGitOnce()
    return []
  }
  if (!supportsDolphinChoques(version.stdout)) {
    warnOldGitOnce()
    return []
  }

  let worktrees: GitWorktreeInfo[]
  try {
    worktrees = await listWorktreeGraph(repoPath, {
      timeout: Math.min(GIT_COMMAND_TIMEOUT_MS, Math.max(1, deadline - Date.now()))
    })
  } catch {
    return []
  }
  const base = options.baseRef ?? worktrees.find((worktree) => worktree.isMainWorktree)?.branch
  if (!base || Date.now() >= deadline) {
    return []
  }

  let baseRevision: string
  try {
    baseRevision = (
      await gitRead(['rev-parse', '--verify', `${base}^{commit}`], repoPath, deadline)
    ).stdout.trim()
  } catch {
    return []
  }

  const targets: Target[] = []
  for (const worktree of worktrees) {
    if (worktree.isBare || !worktree.head) {
      continue
    }
    let revision = worktree.head
    try {
      const stash = (
        await gitRead(['stash', 'create', '--include-untracked'], worktree.path, deadline)
      ).stdout.trim()
      if (stash) {
        revision = stash
      }
    } catch {
      // A worktree can disappear while the app is refreshing; its committed HEAD is still safe.
    }
    if (revision !== baseRevision) {
      targets.push({ name: worktreeName(worktree), revision })
    }
  }

  const pairs: (readonly [Target, Target])[] = []
  const maxPairs = options.maxPairs ?? CHOQUES_MAX_PARES
  const addPair = (a: Target, b: Target): boolean => {
    if (pairs.length >= maxPairs) {
      return false
    }
    pairs.push([a, b])
    return true
  }
  const baseTarget = { name: baseName(base), revision: baseRevision }
  for (const target of targets) {
    if (!addPair(baseTarget, target)) {
      break
    }
  }
  if (pairs.length < maxPairs) {
    for (let index = 0; index < targets.length - 1 && pairs.length < maxPairs; index += 1) {
      for (const target of targets.slice(index + 1)) {
        if (!addPair(targets[index], target)) {
          break
        }
      }
    }
  }
  const choques: DolphinChoque[] = []
  for (const [a, b] of pairs) {
    const archivos = await mergeTree(repoPath, a.revision, b.revision, deadline)
    if (archivos.length > 0) {
      choques.push({ a: a.name, b: b.name, archivos })
    }
    if (Date.now() >= deadline) {
      break
    }
  }
  return choques.sort((a, b) => `${a.a}\0${a.b}`.localeCompare(`${b.a}\0${b.b}`))
}

export function resetDolphinChoquesWarningsForTests(): void {
  oldGitWarningShown = false
}

/**
 * Why sin reloj propio: recalcular corre `git merge-tree` por cada par de worktrees, y con un
 * intervalo fijo lo hacía aunque nadie mirara. Se recalcula cuando alguien lee (la isla o el
 * tablero, que ya se pausan con su ventana oculta) y el último cálculo tiene más de
 * CHOQUES_INTERVAL_MS; esa lectura devuelve lo último y la siguiente trae lo nuevo.
 */
export class DolphinChoquesService {
  private result: DolphinChoquesResult = { disponible: true, repos: [] }
  private refreshInFlight: Promise<void> | null = null
  private activo = false
  private calculadoEn = Number.NEGATIVE_INFINITY

  constructor(
    private readonly getRepos: () => readonly Repo[],
    private readonly now: () => number = Date.now
  ) {}

  start(): void {
    if (this.activo) {
      return
    }
    this.activo = true
    this.refrescarEnFondo()
  }

  stop(): void {
    this.activo = false
  }

  get(): DolphinChoquesResult {
    if (this.activo && this.now() - this.calculadoEn >= CHOQUES_INTERVAL_MS) {
      this.refrescarEnFondo()
    }
    return this.result
  }

  private refrescarEnFondo(): void {
    this.refresh().catch((error: unknown) => {
      console.warn('[dolphin/choques] Conflict scan failed.', error)
    })
  }

  async refresh(): Promise<void> {
    if (this.refreshInFlight) {
      return this.refreshInFlight
    }
    this.refreshInFlight = (async () => {
      const repos = this.getRepos().filter((repo) => repo.kind !== 'folder')
      const results = await Promise.all(
        repos.map(async (repo): Promise<DolphinChoquesRepo> => ({
          repoPath: repo.path,
          repoName: repo.displayName,
          choques: await detectarChoquesEnRepo(repo.path, { baseRef: repo.worktreeBaseRef })
        }))
      )
      this.result = { disponible: true, repos: results.filter((repo) => repo.choques.length > 0) }
    })().finally(() => {
      // Un cálculo fallido también cuenta: si no, cada lectura lo reintentaría al instante.
      this.calculadoEn = this.now()
      this.refreshInFlight = null
    })
    return this.refreshInFlight
  }
}
