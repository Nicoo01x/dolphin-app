import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTranslate } from '@/i18n/use-translate'

/** Copies the chat's Dolphin session ID from the host: `orca_session_id:<root>`, which `/clear` keeps. */
export function NativeChatCopyDolphinSessionIdMenuItem({
  resolveDolphinSessionId
}: {
  resolveDolphinSessionId: () => Promise<string | null>
}): React.JSX.Element {
  const t = useTranslate()
  const copyDolphinSessionId = async (): Promise<void> => {
    try {
      const dolphinSessionId = await resolveDolphinSessionId()
      if (!dolphinSessionId) {
        throw new Error('no Dolphin session ID')
      }
      await window.api.ui.writeClipboardText(dolphinSessionId)
      toast.success(
        t('components.native-chat.contextMenu.dolphinSessionIdCopied', 'Dolphin session ID copied')
      )
    } catch {
      toast.error(
        t(
          'components.native-chat.contextMenu.dolphinSessionIdCopyFailed',
          'Unable to copy Dolphin session ID'
        )
      )
    }
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <DropdownMenuItem onSelect={() => void copyDolphinSessionId()}>
          <Copy />
          {t('components.native-chat.contextMenu.copyDolphinSessionId', 'Copy Dolphin Session ID')}
        </DropdownMenuItem>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8} className="max-w-[220px]">
        {t(
          'components.native-chat.contextMenu.dolphinSessionIdTooltip',
          "Dolphin's ID for this chat, separate from the agent CLI's own session ID. Agents use it to refer to each other through Dolphin."
        )}
      </TooltipContent>
    </Tooltip>
  )
}
