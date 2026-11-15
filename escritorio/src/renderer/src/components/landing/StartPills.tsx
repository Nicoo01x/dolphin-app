import React from 'react'
import { Check, ChevronDown, Folder, FolderPlus, Plug, Terminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { AgentIcon } from '@/components/agent/icons/AgentIcon'
import type { AgentCatalogEntry } from '@/lib/agent-catalog/agent-catalog'
import {
  getProjectHostSetupSelectionKey,
  type NeedsSetupProjectHostOption
} from '@/lib/workspace/creation/project-host-setup-options'
import { HostRowIcon } from '@/components/new-workspace/RunTargetComboboxRow'
import type { ComposerCardProps } from '@/hooks/useComposerState'
import type { TuiAgent } from '../../../../shared/agent-launch/catalog/tui-agent'

/**
 * The pills under the start composer's text box.
 *
 * They are built here instead of reusing the workspace composer's comboboxes because those are
 * form fields — a bordered box with a search input and a second line of detail — and this box is
 * the chat composer: one line of quiet ghost pills under the text, same as the pickers beside a
 * live conversation. Same decisions, same data, the shape the rest of the app already uses when
 * you are about to send something.
 */
function StartPill({
  icon,
  label,
  title,
  children
}: {
  icon: React.ReactNode
  label: string
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              aria-label={`${title}: ${label}`}
              // `shrink` beats the button's shrink-0 so a narrow window truncates the name
              // instead of pushing the send button off the row.
              className="min-w-0 max-w-44 shrink"
            >
              {icon}
              <span className="truncate">{label}</span>
              <ChevronDown className="size-3" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          {title}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" side="top" collisionPadding={8} className="w-72">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Row({
  checked,
  icon,
  label,
  detail,
  onSelect
}: {
  checked?: boolean
  icon?: React.ReactNode
  label: string
  detail?: string | null
  onSelect: () => void
}): React.JSX.Element {
  return (
    <DropdownMenuItem onSelect={onSelect} className="items-start">
      <span className="mt-0.5 flex size-3.5 shrink-0 items-center justify-center">
        {checked ? <Check className="size-3.5" /> : icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate">{label}</div>
        {detail ? (
          <div className="truncate text-xs font-normal text-muted-foreground">{detail}</div>
        ) : null}
      </div>
    </DropdownMenuItem>
  )
}

export function StartProjectPill({
  options,
  value,
  onChange,
  onAddProject
}: {
  options: ComposerCardProps['projectOptions']
  value: string | null
  onChange: (projectId: string) => void
  onAddProject: () => void
}): React.JSX.Element {
  const selected = options.find((option) => option.id === value)
  const title = translate('auto.components.NewWorkspaceComposerCard.969a8bff66', 'Project')
  return (
    <StartPill
      icon={<Folder className="size-3.5 shrink-0" aria-hidden />}
      label={
        selected?.displayName ??
        translate('auto.components.NewWorkspaceComposerCard.dccd26d4e4', 'Choose project')
      }
      title={title}
    >
      <DropdownMenuLabel>{title}</DropdownMenuLabel>
      {options.map((option) => (
        <Row
          key={option.id}
          checked={option.id === value}
          label={option.displayName}
          onSelect={() => onChange(option.id)}
        />
      ))}
      <DropdownMenuSeparator />
      <Row
        icon={<FolderPlus className="size-3.5" />}
        label={translate('auto.components.Landing.f9eaa9e12d', 'Add project')}
        onSelect={onAddProject}
      />
    </StartPill>
  )
}

/**
 * Where the work runs. Hosts that still need a connection or a project location are listed too,
 * and selecting one runs that step: hiding them would make a machine the user already configured
 * look like it was never added.
 */
export function StartRunTargetPill({
  options,
  value,
  executionHostId,
  onChange,
  onConnect,
  onAddMachine
}: {
  options: ComposerCardProps['projectHostSetupOptions']
  value: string | null
  /** Which machine the project resolves to; two setups can share an id across machines. */
  executionHostId?: string | null
  onChange: (setupId: string) => void
  onConnect: (option: NeedsSetupProjectHostOption) => void
  onAddMachine: () => void
}): React.JSX.Element {
  const all = options ?? []
  // The same rule the full picker uses: the id commits, the execution host disambiguates, and a
  // selection made on a merged machine's other id still belongs to that machine's row. Falling
  // back to the first ready host is what makes the pill say "Local" instead of "Choose target"
  // before anything has been picked — the composer runs there anyway.
  const esElegida = (candidate: { id: string; hostId: string }): boolean =>
    candidate.id === value && (!executionHostId || candidate.hostId === executionHostId)
  const listas = all.filter((option) => option.kind === 'ready')
  const selected =
    listas.find(esElegida) ??
    listas.find((option) => option.aliasSetups?.some(esElegida)) ??
    listas[0] ??
    null
  const title = translate('auto.components.NewWorkspaceComposerCard.runOn', 'Run on')
  return (
    <StartPill
      icon={
        selected ? (
          <HostRowIcon hostId={selected.hostId} />
        ) : (
          <Plug className="size-3.5 shrink-0" aria-hidden />
        )
      }
      label={
        selected?.label ??
        translate('auto.components.NewWorkspaceComposerCard.chooseRunTarget', 'Choose target')
      }
      title={title}
    >
      <DropdownMenuLabel>{title}</DropdownMenuLabel>
      {all.map((option) => (
        <Row
          key={getProjectHostSetupSelectionKey(option)}
          checked={option === selected}
          icon={<HostRowIcon hostId={option.hostId} />}
          label={option.label}
          detail={option.detail}
          onSelect={() => {
            if (option.kind === 'needs-setup') {
              onConnect(option)
              return
            }
            onChange(option.id)
          }}
        />
      ))}
      <DropdownMenuSeparator />
      <Row
        icon={<Plug className="size-3.5" />}
        label={translate('components.landing.start.addMachine', 'Connect a machine…')}
        detail={translate(
          'components.landing.start.addMachineDetail',
          'A server of yours over SSH, or another computer running Dolphin'
        )}
        onSelect={onAddMachine}
      />
    </StartPill>
  )
}

export function StartAgentPill({
  agents,
  value,
  setupOnly,
  onChange,
  onSetupOnly
}: {
  agents: readonly AgentCatalogEntry[]
  value: TuiAgent | null
  setupOnly: boolean
  onChange: (agent: TuiAgent) => void
  onSetupOnly: () => void
}): React.JSX.Element {
  const selected = agents.find((agent) => agent.id === value)
  const title = translate('components.newWorkspace.agentOptional', 'Agent [Optional]')
  const blank = translate('components.landing.start.noAgent', 'No agent')
  return (
    <StartPill
      icon={
        selected ? (
          <AgentIcon agent={selected.id} size={14} />
        ) : (
          <Terminal className="size-3.5 shrink-0" aria-hidden />
        )
      }
      label={selected?.label ?? blank}
      title={title}
    >
      <DropdownMenuLabel>{title}</DropdownMenuLabel>
      {agents.map((agent) => (
        <Row
          key={agent.id}
          checked={agent.id === value && !setupOnly}
          icon={<AgentIcon agent={agent.id} size={14} />}
          label={agent.label}
          onSelect={() => onChange(agent.id)}
        />
      ))}
      <DropdownMenuSeparator />
      <Row
        checked={setupOnly}
        icon={<Terminal className="size-3.5" />}
        label={blank}
        detail={translate(
          'components.landing.start.noAgentDetail',
          'Create the workspace and leave it to you'
        )}
        onSelect={onSetupOnly}
      />
    </StartPill>
  )
}
