import { BookmarkPlus } from 'lucide-react'
import { toast } from 'sonner'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'

/** El mismo tope que guarda main: más largo ya no es una regla, es un pedazo de charla. */
const REMEMBER_MAX_CHARS = 500

/**
 * Qué se recuerda: lo seleccionado si hay, si no el mensaje entero cuando es corto. Un mensaje largo
 * sin selección no se guarda entero: la memoria se lee como reglas, y adivinar cuál oración es la
 * regla sería inventar.
 */
export function rememberCandidateText(selection: string, messageText: string | null): string | null {
  const chosen = (selection.trim() ? selection : (messageText ?? '')).replace(/\s+/g, ' ').trim()
  return chosen ? chosen : null
}

async function remember(worktreeId: string, text: string): Promise<void> {
  const result = await window.api.dolphin
    .recordarEnMemoria({
      worktreeId,
      text,
      porQue: translate(
        'components.native-chat.remember.porQue',
        'You marked it in the chat'
      )
    })
    .catch(() => ({ ok: false as const, reason: 'write-failed' as const }))
  if (!result.ok) {
    toast.error(
      result.reason === 'no-project'
        ? translate(
            'components.native-chat.remember.noProject',
            'Only a local project with git keeps memory'
          )
        : translate(
            'components.native-chat.remember.failed',
            "Couldn't save it to the project's memory. Try again."
          )
    )
    return
  }
  if (result.alreadyKnown) {
    toast(translate('components.native-chat.remember.alreadyKnown', 'Dolphin already knew that'))
    return
  }
  toast.success(
    translate('components.native-chat.remember.saved', "I'll remember it in this project"),
    {
      description: text.length > 120 ? `${text.slice(0, 119)}…` : text,
      action: {
        label: translate('components.native-chat.remember.undo', 'Undo'),
        onClick: () => {
          void window.api.dolphin.olvidarDeMemoria({ worktreeId, id: result.id }).catch(() => {})
        }
      }
    }
  )
}

/**
 * «Recordar esto»: lo marcado entra a la memoria del proyecto, activo y como tuyo, y los agentes lo
 * reciben en la próxima sesión (o en el próximo mensaje, si tiene que ver).
 */
export function NativeChatRememberMenuItem({
  worktreeId,
  selection,
  messageText
}: {
  worktreeId: string | undefined
  selection: string
  messageText: string | null
}): React.JSX.Element | null {
  const text = rememberCandidateText(selection, messageText)
  if (!worktreeId || !text) {
    return null
  }
  const tooLong = text.length > REMEMBER_MAX_CHARS
  return (
    <DropdownMenuItem disabled={tooLong} onSelect={() => void remember(worktreeId, text)}>
      <BookmarkPlus />
      {tooLong
        ? translate(
            'components.native-chat.remember.selectFirst',
            'Select what to remember'
          )
        : translate('components.native-chat.remember.action', 'Remember this')}
    </DropdownMenuItem>
  )
}
