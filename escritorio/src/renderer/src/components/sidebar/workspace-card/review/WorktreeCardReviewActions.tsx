import type { MouseEvent } from 'react'
import type { WorkspaceAttachment } from '../../../../../../shared/worktree/types'
import type { WorktreeCardPrDisplay } from './worktree-card-pr-display'
import { workspaceAttachmentProviderLabel } from '../metadata/worktree-attachment-editing'
import { MonitorUp } from 'lucide-react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { WorktreeCardRowActionsMenu } from '../surface/WorktreeCardRowActionsMenu'
import { HostedReviewUnlinkMenuItem } from '@/components/HostedReviewUnlinkMenuItem'
import { useTranslate } from '@/i18n/use-translate'

export function WorktreeCardReviewActions({
  label,
  number,
  provider,
  open,
  onOpenChange,
  onOpenInDolphin,
  onUnlink,
  closeHover
}: {
  label: 'PR' | 'MR'
  number: number
  provider: string
  open?: boolean
  onOpenChange: (open: boolean) => void
  onOpenInDolphin?: (event: MouseEvent) => void
  onUnlink?: () => void
  closeHover: () => void
}): React.JSX.Element | null {
  const t = useTranslate()
  if (!onOpenInDolphin && !onUnlink) {
    return null
  }
  return (
    <WorktreeCardRowActionsMenu
      label={t('auto.components.sidebar.WorktreeCardMeta.dbe2d18972', 'More {{value0}} actions', {
        value0: label
      })}
      open={open}
      onOpenChange={onOpenChange}
    >
      {onOpenInDolphin ? (
        <DropdownMenuItem
          onClick={(event) => {
            closeHover()
            onOpenInDolphin(event)
          }}
        >
          <MonitorUp className="size-3.5" />
          {t('auto.components.sidebar.WorktreeCardMeta.2c67730e07', 'Open in Dolphin')}
        </DropdownMenuItem>
      ) : null}
      {onUnlink ? (
        <HostedReviewUnlinkMenuItem
          reviewLabel={label}
          reviewIdentifier={`${label === 'MR' ? '!' : '#'}${number}`}
          providerLabel={provider}
          onSelect={() => {
            closeHover()
            onUnlink()
          }}
        />
      ) : null}
    </WorktreeCardRowActionsMenu>
  )
}

export function WorktreeCardLinkedReviewActions({
  item,
  review,
  onOpenChange,
  onOpenInDolphin,
  onUnlink,
  closeHover
}: {
  item: WorkspaceAttachment
  review: WorktreeCardPrDisplay | null
  onOpenChange: (open: boolean) => void
  onOpenInDolphin?: (event: MouseEvent, review?: WorktreeCardPrDisplay) => void
  onUnlink?: (item?: WorkspaceAttachment) => void
  closeHover: () => void
}): React.JSX.Element {
  const url = item.url ?? review?.url
  const label = item.type === 'mr' ? 'MR' : 'PR'
  return (
    <WorktreeCardReviewActions
      label={label}
      number={item.number}
      provider={workspaceAttachmentProviderLabel(item)}
      onOpenChange={onOpenChange}
      onOpenInDolphin={
        url && item.provider === 'github' && onOpenInDolphin
          ? (event) =>
              onOpenInDolphin(
                event,
                review ?? {
                  provider: 'github',
                  number: item.number,
                  title: item.title ?? '',
                  url
                }
              )
          : undefined
      }
      onUnlink={onUnlink ? () => onUnlink(item) : undefined}
      closeHover={closeHover}
    />
  )
}
