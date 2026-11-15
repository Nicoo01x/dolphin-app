import type { CodexJournalTranslatorDeps } from './codex-structured-journal-contracts'

export type DependenciasDeLimiteCodex = Pick<
  CodexJournalTranslatorDeps,
  'accountId' | 'onUsageLimit'
>

/**
 * El aviso de límite de uso con la cuenta que lo tocó, que es lo que necesita la rotación de cuentas.
 *
 * Why la cuenta se lee al avisar: el traductor nace antes de saber con qué cuenta arrancó Codex.
 */
export function avisoDeLimiteDeUsoCodex(
  deps: DependenciasDeLimiteCodex
): ((resetsAt?: number) => void) | undefined {
  const { onUsageLimit } = deps
  return onUsageLimit ? (resetsAt) => onUsageLimit(resetsAt, deps.accountId?.()) : undefined
}
