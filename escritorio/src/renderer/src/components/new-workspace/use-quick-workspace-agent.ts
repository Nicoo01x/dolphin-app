import React from 'react'
import type { AgentLaunchSurface } from '@/lib/agent-session/launch/routing/agent-session-launch-plan'
import type { AgentLaunchChoice } from '@/lib/agent-session/launch/routing/agent-menu-selection'
import { useAgentMenuObservation } from '@/components/tab-bar/use-new-tab-agent-menu-rows'
import {
  pickQuickWorkspaceAgent,
  resolveQuickWorkspaceAgentSelection
} from '@/lib/workspace/creation/quick-workspace-agent-selection'
import { useAppStore } from '@/store'
import type { TuiAgent } from '../../../../shared/agent-launch/catalog/tui-agent'
import type { NewWorkspaceComposerCardProps } from './new-workspace-composer-card-props'

export type QuickWorkspaceAgentState = {
  /** The agent that would start, or null for "create the workspace and start nothing". */
  quickAgent: TuiAgent | null
  /** True once the user has explicitly cleared the selection, which means setup-only. */
  quickSetupOnly: boolean
  /** False while the agent inventory for the target host is still being read. */
  launchReady: boolean
  launchChoice: AgentLaunchChoice | undefined
  agentSurfaceRows: NewWorkspaceComposerCardProps['agentSurfaceRows']
  onQuickAgentChange: (agent: TuiAgent | null, surface?: AgentLaunchSurface) => void
  onQuickSetupOnlySelect: () => void
}

/**
 * Which agent a workspace being created would start, and whether it can.
 *
 * Shared by every surface that creates a workspace and launches in one action — the quick-create
 * modal and the start composer on the landing screen. It is a hook and not props because the
 * answer depends on the agent inventory of the *target host*, which is read asynchronously: a
 * surface that assumed `settings.defaultTuiAgent` would offer Claude on a remote machine that
 * has no CLI installed and only fail at launch.
 *
 * Two pieces of state that look redundant and are not:
 * - `quickAgentOverride` is the user's pick. Once they choose, their choice wins and must not be
 *   overwritten when the derived "preferred" agent changes (detection finishing adds agents to
 *   the set). It is repaired during render rather than in an effect so the child selector never
 *   renders an option that is no longer available.
 * - `quickAgentPick` is keyed by agent so a pick repaired to another agent does not carry the
 *   old one's launch surface (chat vs terminal).
 */
export function useQuickWorkspaceAgent({
  detectedAgentIds,
  agentRows,
  active
}: {
  detectedAgentIds: NewWorkspaceComposerCardProps['detectedAgentIds']
  agentRows: NewWorkspaceComposerCardProps['agentRows']
  /** False while the surface is hidden: it stops the inventory read for a menu nobody sees. */
  active: boolean
}): QuickWorkspaceAgentState {
  const settings = useAppStore((state) => state.settings)
  const [quickAgentOverride, setQuickAgentOverride] = React.useState<TuiAgent | null | undefined>(
    undefined
  )
  const preferredQuickAgent = React.useMemo<TuiAgent | null>(() => {
    return pickQuickWorkspaceAgent(
      settings?.defaultTuiAgent,
      detectedAgentIds,
      settings?.disabledTuiAgents
    )
  }, [detectedAgentIds, settings?.defaultTuiAgent, settings?.disabledTuiAgents])
  const resolved = resolveQuickWorkspaceAgentSelection({
    quickAgentOverride,
    preferredQuickAgent,
    detectedAgentIds,
    disabledTuiAgents: settings?.disabledTuiAgents
  })
  if (resolved.quickAgentOverride !== quickAgentOverride) {
    setQuickAgentOverride(resolved.quickAgentOverride)
  }
  const quickAgent = resolved.quickAgent
  const [quickSelectionCleared, setQuickSelectionCleared] = React.useState(false)
  const [quickAgentPick, setQuickAgentPick] = React.useState<{
    agent: TuiAgent | null
    surface?: AgentLaunchSurface
  }>({ agent: null })
  const quickAgentSurface = quickAgentPick.agent === quickAgent ? quickAgentPick.surface : undefined

  const observation = useAgentMenuObservation(
    agentRows?.target ?? null,
    active && Boolean(agentRows),
    agentRows?.detectionTarget
  )
  const launchSelection = observation.selectionFor(quickAgent, quickAgentSurface)

  const onQuickAgentChange = React.useCallback(
    (agent: TuiAgent | null, surface?: AgentLaunchSurface): void => {
      setQuickAgentOverride(agent)
      setQuickAgentPick({ agent, surface })
      setQuickSelectionCleared(false)
    },
    []
  )
  const onQuickSetupOnlySelect = React.useCallback((): void => {
    setQuickAgentOverride(null)
    setQuickSelectionCleared(true)
  }, [])

  return {
    quickAgent,
    quickSetupOnly: quickAgent === null && quickSelectionCleared,
    launchReady: launchSelection.ready,
    launchChoice: launchSelection.choice,
    agentSurfaceRows: agentRows
      ? {
          model: observation.model,
          selection: launchSelection,
          surface: quickAgentSurface,
          contextKey: observation.contextKey,
          onPick: onQuickAgentChange
        }
      : undefined,
    onQuickAgentChange,
    onQuickSetupOnlySelect
  }
}
