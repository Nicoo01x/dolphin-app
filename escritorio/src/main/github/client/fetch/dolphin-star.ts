import { ghExecFileAsync, acquire, release } from '../../gh-utils'
import { runAsDefaultWslCliUserAct } from '../../../git/command-runner/default-wsl-cli-fallback'
import { DOLPHIN_GITHUB_URL } from '../../../../shared/dolphin-brand'

/**
 * El repo de la estrella y de su chequeo: el de Dolphin, sacado de DOLPHIN_GITHUB_URL.
 *
 * Why: era el repo de la base, que es otra app; preguntarle a GitHub por esa estrella cada vez que se
 * abre el inicio es decirle a Dolphin quién usa Dolphin. Sin repo propio no se pregunta ni se da nada.
 */
export function dolphinStarRepo(url: string | null = DOLPHIN_GITHUB_URL): string | null {
  return url?.match(/^https:\/\/github\.com\/([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/)?.[1] ?? null
}

// Bound optional star prompts more tightly than user work; failures can fall back to the browser.
const STAR_GH_TIMEOUT_MS = 15_000

let inFlightStarCheck: Promise<boolean | null> | null = null

/** null means the star state could not be determined. */
export function checkDolphinStarred(): Promise<boolean | null> {
  const repo = dolphinStarRepo()
  if (!repo) {
    return Promise.resolve(null)
  }
  // Independent UI callers share one probe so optional star prompts cannot exhaust GitHub admission.
  inFlightStarCheck ??= runDolphinStarredCheck(repo).finally(() => {
    inFlightStarCheck = null
  })
  return inFlightStarCheck
}

/** @internal Drop any coalesced check so suites cannot inherit one another's. */
export function __resetDolphinStarCheckForTests(): void {
  inFlightStarCheck = null
}

async function runDolphinStarredCheck(repo: string): Promise<boolean | null> {
  await acquire()
  try {
    const { stdout, stderr } = await ghExecFileAsync(['api', '--include', `user/starred/${repo}`], {
      encoding: 'utf-8',
      timeout: STAR_GH_TIMEOUT_MS
    })
    const response = `${stdout ?? ''}\n${stderr ?? ''}`
    if (/HTTP\/\S+\s+(?:200|204)\b/.test(response)) {
      return true
    }
    return null
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // Only a confirmed 404 establishes that the user has not starred.
    if (message.includes('HTTP 404')) {
      return false
    }
    return null
  } finally {
    release()
  }
}

export async function starDolphin(): Promise<boolean> {
  // Why: en Dolphin esto le daría estrella a Dolphin con la cuenta de quien lo pide (ver dolphin-brand.ts).
  const repo = dolphinStarRepo()
  if (!repo) {
    return false
  }
  await acquire()
  try {
    // Starring is always a click, so it may start the stopped distro its gh lives in (E9).
    await runAsDefaultWslCliUserAct(() =>
      ghExecFileAsync(['api', '-X', 'PUT', `user/starred/${repo}`], {
        encoding: 'utf-8',
        timeout: STAR_GH_TIMEOUT_MS
      })
    )
    return true
  } catch {
    return false
  } finally {
    release()
  }
}
