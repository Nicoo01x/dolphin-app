import React from 'react'
import { useAppStore } from '@/store'
import { NativeChatPermissionModePicker } from '@/components/native-chat/session/options/controls/NativeChatPermissionModePicker'
import { agentChatPermissionModes } from '../../../../shared/agent-launch/permissions/agent-chat-permission-support'
import {
  newChatPermissionModeForSettings,
  type AgentChatPermissionMode
} from '../../../../shared/agent-launch/permissions/agent-chat-permission-mode'
import { applyAgentPermissionOverrides } from '../../../../shared/agent-launch/permissions/tui-agent-permission-choice'
import type { TuiAgent } from '../../../../shared/agent-launch/catalog/tui-agent'

/**
 * What the agent is allowed to do without asking, chosen before it starts.
 *
 * This is the one launch parameter worth deciding up front: whether the run you are about to
 * start stops at every edit or works through. Inside a chat the same picker already exists, but
 * by then the agent has read the prompt and is waiting — and the answer for an unattended run on
 * another machine is usually not the one you want for a chat you are watching.
 *
 * It writes the agent's own permission (`agentPermissionOverrides`), which is the same value a
 * chat or terminal started any other way reads, so this is the setting and not a copy of it. Agents
 * with no permission modes of their own render nothing rather than a dead control.
 */
export function StartPermissionPill({
  agent
}: {
  agent: TuiAgent | null
}): React.JSX.Element | null {
  const settings = useAppStore((state) => state.settings)
  const updateSettings = useAppStore((state) => state.updateSettings)
  const support = agent ? agentChatPermissionModes(agent) : null
  const current = agent ? newChatPermissionModeForSettings(agent, settings) : null

  const onSelect = React.useCallback(
    (mode: AgentChatPermissionMode): void => {
      if (!agent) {
        return
      }
      void updateSettings(applyAgentPermissionOverrides(settings ?? {}, [agent], mode))
    },
    [agent, settings, updateSettings]
  )

  if (!agent || !support || !current) {
    return null
  }
  return (
    <NativeChatPermissionModePicker
      current={current}
      modes={support.modes}
      agent={agent}
      onSelect={onSelect}
    />
  )
}
