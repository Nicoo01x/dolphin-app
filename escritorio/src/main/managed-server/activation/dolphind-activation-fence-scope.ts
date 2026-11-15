// Resumed stale holders must prove their generation on-host before every step, preventing writes or release under a successor's fence.
import { AsyncLocalStorage } from 'node:async_hooks'
import { quotePosixShell } from '../../../shared/shell/launch/shell-argument-quoting'
import { isSshCommandExitError } from '../../ssh/remote-exec/remote-exec-command'

export const DOLPHIND_FENCE_OWNER_FILENAME = '.dolphin-fence-owner'
export const DOLPHIND_FENCE_LOST_MARKER = '__DOLPHIND_FENCE_LOST__'
/** EX_TEMPFAIL: this superseded generation cannot retry its step. */
export const DOLPHIND_FENCE_LOST_EXIT = 75

export type DolphindFence = { lockDir: string; token: string }

const scope = new AsyncLocalStorage<DolphindFence>()

export function runWithDolphindFence<T>(fence: DolphindFence, run: () => Promise<T>): Promise<T> {
  return scope.run(fence, run)
}

export function currentDolphindFence(): DolphindFence | null {
  return scope.getStore() ?? null
}

export class DolphindFenceLostError extends Error {
  constructor() {
    super(
      "This run's activation fence was taken over by another run, so it stopped before changing the host."
    )
    this.name = 'DolphindFenceLostError'
  }
}

export function posixDolphindFenceOwnedTest(fence: DolphindFence): string {
  const owner = quotePosixShell(
    `${fence.lockDir.replace(/\/+$/u, '')}/${DOLPHIND_FENCE_OWNER_FILENAME}`
  )
  return `[ "$(cat ${owner} 2>/dev/null)" = ${quotePosixShell(fence.token)} ]`
}

export function posixDolphindFenceGuard(fence: DolphindFence): string {
  return `${posixDolphindFenceOwnedTest(fence)} || { echo ${DOLPHIND_FENCE_LOST_MARKER}; exit ${DOLPHIND_FENCE_LOST_EXIT}; };`
}

/** Use exit status and stdout; error messages quote commands containing the marker even when no guard failed. */
export function isDolphindFenceLost(error: unknown): boolean {
  if (!isSshCommandExitError(error)) {
    return false
  }
  // `powershell -Command` reports any nonzero native exit as 1.
  const exited = error.exitCode === DOLPHIND_FENCE_LOST_EXIT || error.exitCode === 1
  return exited && error.stdout.trim().split(/\r?\n/u).at(-1) === DOLPHIND_FENCE_LOST_MARKER
}
