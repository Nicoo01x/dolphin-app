import { toast } from 'sonner'
import { useAppStore } from '@/store/index'
import { translate } from '@/i18n/i18n'
import type { Repo } from '../../../../../shared/repo-types'
import {
  buildVpsSetupAgentPrompt,
  type VpsSetupAgentContext
} from '../../../../../shared/vps-setup-agent-prompt'
import { launchPromptedAgentInRepo } from './environment-setup-agent-launch'

/**
 * A project on this computer for the agent to start in: the active one, else the first.
 *
 * Why only local ones: the agent fixes the connection to a remote host from here, with this
 * computer's ssh and Dolphin CLI. Started on the broken host itself it could not even run.
 */
export function pickLocalRepoForHostSetup(
  repos: readonly Repo[],
  activeRepoId: string | null
): Repo | null {
  const local = repos.filter(
    (repo) => !repo.connectionId && (!repo.executionHostId || repo.executionHostId === 'local')
  )
  return local.find((repo) => repo.id === activeRepoId) ?? local[0] ?? null
}

/** Start the default agent with the VPS skill, the host's doctor loop and the last error. */
export async function launchVpsSetupAgent(context: VpsSetupAgentContext): Promise<boolean> {
  const state = useAppStore.getState()
  const repo = pickLocalRepoForHostSetup(state.repos, state.activeRepoId)
  if (!repo) {
    toast.error(
      translate(
        'auto.lib.vpsSetupAgentLaunch.noLocalProject',
        'Open a project on this computer first, then try again. The agent works from there.'
      )
    )
    return false
  }
  const launched = await launchPromptedAgentInRepo(repo.id, buildVpsSetupAgentPrompt(context))
  if (launched) {
    state.recordFeatureInteraction('ssh')
  }
  return launched
}
