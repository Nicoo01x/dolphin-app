import type { DolphinCloudSignInProgress } from '../../../shared/dolphin-profiles'

type ProgressListener = (progress: DolphinCloudSignInProgress | null) => void

// Only the newest attempt owns progress; late updates from older attempts are ignored.
let current: { attempt: number; link: string | null; cancel: () => void } | null = null
const listeners = new Set<ProgressListener>()

function snapshot(): DolphinCloudSignInProgress | null {
  return current ? { link: current.link } : null
}

function update(next: typeof current): void {
  current = next
  const progress = snapshot()
  for (const listener of listeners) {
    try {
      listener(progress)
    } catch (error) {
      console.warn('[dolphin-profiles] Sign-in progress listener failed:', error)
    }
  }
}

export function getDolphinCloudSignInProgress(): DolphinCloudSignInProgress | null {
  return snapshot()
}

export function onDolphinCloudSignInProgressChanged(listener: ProgressListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function startDolphinCloudSignInProgress(attempt: number, cancel: () => void): void {
  update({ attempt, link: null, cancel })
}

export function setDolphinCloudSignInLink(attempt: number, link: string | null): void {
  if (current?.attempt === attempt && current.link !== link) {
    update({ ...current, link })
  }
}

export function endDolphinCloudSignInProgress(attempt?: number): void {
  if (current && (attempt === undefined || current.attempt === attempt)) {
    update(null)
  }
}

export function cancelDolphinCloudSignIn(): void {
  current?.cancel()
}
