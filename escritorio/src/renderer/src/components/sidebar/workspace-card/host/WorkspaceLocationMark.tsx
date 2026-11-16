import React from 'react'
import { Cloud, Laptop } from 'lucide-react'

import { useWslHostDistro } from '@/components/wsl-host-mark/WslHostMark'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTranslate, type Translate } from '@/i18n/use-translate'
import {
  getSettingsFocusedExecutionHostId,
  getWorktreeExecutionHostId,
  parseExecutionHostId
} from '../../../../../../shared/execution-host'
import type { WorktreeCardController } from '../controller/use-worktree-card-controller'
import { resolveWorkspaceLocation, type WorkspaceLocation } from './workspace-location'

type LocationCard = Pick<
  WorktreeCardController,
  'worktree' | 'repo' | 'settings' | 'sshTargetLabel' | 'runtimeHostLabel'
>

function locationLabel(location: WorkspaceLocation, t: Translate): string {
  if (location.kind === 'local') {
    return t('sidebar.workspaceLocation.local', 'On your computer')
  }
  return location.hostLabel
    ? t('sidebar.workspaceLocation.serverNamed', 'On {{hostName}}', {
        hostName: location.hostLabel
      })
    : t('sidebar.workspaceLocation.server', 'On a server')
}

/** Laptop or cloud ahead of the row's status: where this workspace's agents run. */
export function WorkspaceLocationMark({ card }: { card: LocationCard }): React.JSX.Element | null {
  const t = useTranslate()
  // Repos without an explicit owner belong to the focused host, as the list groups them.
  const executionHostId = getWorktreeExecutionHostId(
    card.worktree,
    card.repo,
    getSettingsFocusedExecutionHostId(card.settings)
  )
  const wslDistro = useWslHostDistro(executionHostId)
  const hostKind = parseExecutionHostId(executionHostId)?.kind
  const location = resolveWorkspaceLocation({
    executionHostId,
    wslDistro,
    hostLabel:
      hostKind === 'ssh'
        ? card.sshTargetLabel
        : hostKind === 'runtime'
          ? card.runtimeHostLabel
          : null
  })
  if (!location) {
    return null
  }
  const label = locationLabel(location, t)
  const Icon = location.kind === 'local' ? Laptop : Cloud
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* h-5 matches the title's line box, so the glyph sits on the first line in tall cards. */}
        <span
          role="img"
          aria-label={label}
          data-workspace-location={location.kind}
          className="inline-flex h-5 shrink-0 items-center text-muted-foreground"
        >
          <Icon className="size-3.5" aria-hidden="true" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
