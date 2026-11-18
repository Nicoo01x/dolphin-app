export const DOLPHIN_CLI_SKILL_NAME = 'dolphin-cli'
export const COMPUTER_USE_SKILL_NAME = 'dolphin-computer-use'
export const ORCHESTRATION_SKILL_NAME = 'orchestration'
// «Delegá las tareas» desde cualquier chat: cada compañero, una pestaña de Dolphin a la vista.
export const DOLPHIN_DELEGAR_SKILL_NAME = 'dolphin-delegar'
/**
 * Lo que instala «Orquestación» (onboarding, Ajustes, la tarjeta). Why las dos juntas: desde el
 * 17/11/2026 no hay botón de orquestación en el compositor; repartir se pide escribiendo, y la que
 * le enseña al agente a hacerlo con pestañas visibles es dolphin-delegar.
 */
export const ORCHESTRATION_SKILL_NAMES = [
  ORCHESTRATION_SKILL_NAME,
  DOLPHIN_DELEGAR_SKILL_NAME
] as const
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
