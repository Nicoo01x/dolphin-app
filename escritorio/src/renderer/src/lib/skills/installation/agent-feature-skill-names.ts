export const DOLPHIN_CLI_SKILL_NAME = 'dolphin-cli'
export const COMPUTER_USE_SKILL_NAME = 'dolphin-computer-use'
export const ORCHESTRATION_SKILL_NAME = 'orchestration'
export const EPHEMERAL_VMS_SKILL_NAME = 'dolphin-per-workspace-env'
export const DOLPHIN_LINEAR_SKILL_NAME = 'dolphin-linear'
export const LINEAR_TICKETS_SKILL_NAME = 'linear-tickets'
// Valor «orca» a propósito (migración): quien instaló la skill de Linear con el nombre de antes del
// cambio de marca la sigue teniendo como instalada.
export const LEGACY_DOLPHIN_LINEAR_SKILL_NAME = 'orca-linear'
export const LINEAR_AGENT_SKILL_NAMES = [
  DOLPHIN_LINEAR_SKILL_NAME,
  LINEAR_TICKETS_SKILL_NAME,
  LEGACY_DOLPHIN_LINEAR_SKILL_NAME
] as const
