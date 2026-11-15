import { formatSkillsSourceForCommand } from './dolphin-skills-command'

// COMPAT(wsl-bridge): removed when WSL runs as a dolphind host.
export const DOLPHIN_SKILLS_REPOSITORY_URL = 'https://github.com/stablyai/orca'

// Pin one CLI across install rails: 1.5.x lacks commit fetch and bare npx may reuse stale/wrong binaries (#18687).
export const SKILLS_CLI_VERSION = '1.7.2'

export type AgentFeatureSkillCommandOptions = {
  /** Full commit the running build was made from. */
  sourceCommit: string
  /**
   * Dolphin: la carpeta con sus skills propias. Con ella se instala de ahí y no del repo de Dolphin
   * (ver shared/dolphin-skills-source.ts); sin ella queda el repo pinneado al commit, como antes.
   */
  source?: string | null
  global?: boolean
}

export function buildAgentFeatureSkillInstallArgs(
  skillNames: readonly string[],
  options: AgentFeatureSkillCommandOptions
): string[] {
  if (skillNames.length === 0) {
    throw new Error('At least one skill name is required.')
  }
  const global = options.global ?? true
  // One flag per skill works with both single-value and variadic parsers.
  const skillArgs = skillNames.flatMap((name) => ['--skill', name])
  return [
    `skills@${SKILLS_CLI_VERSION}`,
    'add',
    // Use the build commit for manifest freshness on every channel, including untagged hourly builds; add re-copies for updates.
    options.source || `${DOLPHIN_SKILLS_REPOSITORY_URL}/tree/${options.sourceCommit}`,
    ...skillArgs,
    ...(global ? ['--global'] : [])
  ]
}

export function buildAgentFeatureSkillInstallCommand(
  skillNames: readonly string[],
  options: AgentFeatureSkillCommandOptions
): string {
  // Why: la fuente (el tercero: `skills@…`, `add`, fuente) puede ser la carpeta propia de Dolphin,
  // una ruta con espacios o «\»; cómo se escribe para cada terminal vive en dolphin-skills-command.
  const args = buildAgentFeatureSkillInstallArgs(skillNames, options).map((arg, index) =>
    index === 2 ? formatSkillsSourceForCommand(arg) : arg
  )
  return `npx ${args.join(' ')}`
}
