import { translate } from '@/i18n/i18n'
import { formatNativeChatDuration } from '../../../../shared/native-chat/transcript/native-chat-turn-status'
import { useNativeChatElapsedSeconds } from './conversation/turns/use-native-chat-elapsed-seconds'

/**
 * El compactado mientras pasa, en el mismo lugar y con la misma forma que la marca que va a dejar
 * cuando termine: el separador de dos rayitas con su texto en el medio.
 *
 * Why la misma forma y no un cartel propio: así se lee como un solo objeto en dos estados —«esto
 * está pasando» y después «esto pasó»— en vez de como dos avisos distintos sobre lo mismo. Las
 * rayitas llevan una luz que las recorre (`chat-compactando-rayita`), que es lo único que se mueve.
 *
 * Y why el reloj: compactar una conversación larga puede llevar más de un minuto. Sin el número, un
 * aviso quieto durante 40 segundos se lee como colgado, que es exactamente lo que esto viene a
 * arreglar.
 */
export function NativeChatCompactandoRow({ desde }: { desde: number }): React.JSX.Element {
  const segundos = useNativeChatElapsedSeconds(desde, true)
  const etiqueta = translate(
    'components.native-chat.notices.compacting',
    'Compacting the conversation…'
  )
  return (
    <div
      role="status"
      aria-label={etiqueta}
      className="flex items-center gap-3 py-2 text-xs text-chat-foreground-faint"
    >
      <span className="chat-compactando-rayita h-px flex-1 bg-border" />
      <span className="whitespace-nowrap">
        {etiqueta}
        {segundos > 0 ? ` ${formatNativeChatDuration(segundos)}` : ''}
      </span>
      <span className="chat-compactando-rayita h-px flex-1 bg-border" />
    </div>
  )
}
