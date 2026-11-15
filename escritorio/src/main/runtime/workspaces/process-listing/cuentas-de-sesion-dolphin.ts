import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { StructuredAgentSessionRuntimeDeps } from '../../agent-session/installation/structured-agent-session-runtime-contract'
import { managedAccountIdAt } from '../managed-account-id'

type CuentasDeSesion = Pick<
  StructuredAgentSessionRuntimeDeps,
  'resolveCodexAccountId' | 'resolveClaudeAccountId' | 'onUsageLimit'
>

/**
 * Lo que Dolphin le suma al host de sesiones estructuradas: con qué cuenta corrió cada sesión y a
 * quién avisarle cuando esa cuenta toca su límite de uso, que es lo que mueve la rotación de cuentas.
 *
 * Why el aviso entra como función y no como valor: es el enganche del host (`onUsageLimitFn`), y se
 * lee al avisar. Este módulo viaja dentro de dolphind, que arranca en Node pelado: ir a buscar la
 * rotación del escritorio a `mainProcessState` metía `electron` en el bundle del server, y en
 * dolphind leía un lugar que ahí nadie llena.
 */
export function cuentasDeSesionDolphin(
  leerSettings: () => Partial<
    Pick<GlobalSettings, 'codexManagedAccounts' | 'claudeManagedAccounts'>
  >,
  avisoDeLimite: () => StructuredAgentSessionRuntimeDeps['onUsageLimit'] | null
): CuentasDeSesion {
  return {
    resolveCodexAccountId: (home) =>
      managedAccountIdAt(leerSettings().codexManagedAccounts, (a) => a.managedHomePath, home),
    resolveClaudeAccountId: (configDir) =>
      managedAccountIdAt(leerSettings().claudeManagedAccounts, (a) => a.managedAuthPath, configDir),
    onUsageLimit: (provider, resetsAt, accountId) =>
      avisoDeLimite()?.(provider, resetsAt, accountId)
  }
}
