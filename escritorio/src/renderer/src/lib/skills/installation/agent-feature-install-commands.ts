// COMPAT(wsl-bridge): removed when WSL runs as a dolphind host.
import { buildAgentFeatureSkillInstallCommand as buildPinnedSkillInstallCommand } from '../../../../../shared/agent-feature-install-commands'
import {
  DOLPHIN_CLI_SKILL_NAME,
  DOLPHIN_LINEAR_SKILL_NAME,
  ORCHESTRATION_SKILL_NAMES
} from './agent-feature-skill-names'

/**
 * Dolphin: la carpeta con sus skills propias, que main le pasa a la ventana (null en el cliente web
 * y en los tests, que siguen viendo el comando de siempre).
 */
// Why se pregunta por el TIPO y no alcanza con `?? null`: en el cliente web, un namespace del
// preload que no tiene implementación contesta con un Proxy que responde a cualquier propiedad y
// no es ni null ni undefined, así que pasaba el `??` y llegaba hasta `source.trim().replace`, que
// lo rompía. Con eso, la app web entera no montaba.
const skillsDirCrudo: unknown =
  typeof window === 'undefined' ? null : window.api?.dolphin?.skillsDir
const DOLPHIN_SKILLS_DIR: string | null = typeof skillsDirCrudo === 'string' ? skillsDirCrudo : null

function buildCommit(): string {
  return typeof DOLPHIN_BUILD_COMMIT === 'string' ? DOLPHIN_BUILD_COMMIT : '0'.repeat(40)
}

/** The interactive install, pinned to this build; also the update, since `add` re-copies. */
export function buildAgentFeatureSkillInstallCommand(skillNames: readonly string[]): string {
  return buildPinnedSkillInstallCommand(skillNames, {
    sourceCommit: buildCommit(),
    source: DOLPHIN_SKILLS_DIR
  })
}

export const ORCHESTRATION_SKILL_INSTALL_COMMAND =
  buildAgentFeatureSkillInstallCommand(ORCHESTRATION_SKILL_NAMES)

export const DOLPHIN_CLI_ORCHESTRATION_SKILL_INSTALL_COMMAND = buildAgentFeatureSkillInstallCommand(
  [DOLPHIN_CLI_SKILL_NAME, ...ORCHESTRATION_SKILL_NAMES]
)

export const DOLPHIN_LINEAR_SKILL_INSTALL_COMMAND = buildAgentFeatureSkillInstallCommand([
  DOLPHIN_LINEAR_SKILL_NAME
])
