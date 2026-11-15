import type {
  ClaudeAcquisitionAttempt,
  ClaudeStructuredSessionAdapterDeps
} from './claude-structured-session-state'

type CuentaDelIntento = {
  onUsageLimit: NonNullable<ClaudeStructuredSessionAdapterDeps['onUsageLimit']>
  accountId: string | undefined
}

const cuentasPorIntento = new WeakMap<ClaudeAcquisitionAttempt, CuentaDelIntento>()

/**
 * Anota con qué cuenta arranca este intento, para que un límite de uso rote la cuenta que lo tocó.
 *
 * Why por intento y no por sesión: el traductor nace antes de resolver el lanzamiento, y el intento
 * es lo único que los dos ya comparten.
 */
export function anotarCuentaDelIntentoClaude(
  attempt: ClaudeAcquisitionAttempt,
  deps: ClaudeStructuredSessionAdapterDeps,
  claudeConfigDir: string
): void {
  if (!deps.onUsageLimit) {
    return
  }
  cuentasPorIntento.set(attempt, {
    onUsageLimit: deps.onUsageLimit,
    accountId: deps.resolveAccountId?.(claudeConfigDir)
  })
}

/** Lo que llama el traductor; antes de anotar la cuenta no hay proceso que pueda toparse con un límite. */
export function avisoDeLimiteDeUsoClaude(
  attempt: ClaudeAcquisitionAttempt
): (resetsAt?: number) => void {
  return (resetsAt) => {
    const cuenta = cuentasPorIntento.get(attempt)
    cuenta?.onUsageLimit('claude', resetsAt, cuenta.accountId)
  }
}
