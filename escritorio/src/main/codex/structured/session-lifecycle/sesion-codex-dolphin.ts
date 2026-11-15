/**
 * Lo que Dolphin le suma a las dependencias de una sesión estructurada de Codex.
 *
 * Why aparte: avisar el límite de uso con la cuenta que lo tocó es lo que permite rotar de cuenta,
 * y la base no lo tiene; viviendo acá, el archivo de la base cambia en una sola línea.
 */
export type DependenciasDeSesionCodexDolphin = {
  onUsageLimit?: (provider: 'codex', resetsAt?: number, accountId?: string) => void
  resolveAccountId?: (home: string) => string | undefined
}
