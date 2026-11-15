import { NativeChatTextAttachmentScope } from '../media/text/NativeChatTextAttachments'
import { forwardRef } from 'react'
import { NativeChatComposerPane } from './NativeChatComposerPane'
import { conModeloObservado } from '../../dolphin/chat/modelo-observado'
import { ComposerDolphinProvider } from '../../dolphin/chat/composer-dolphin'
import { useComposerConPausaAlDetener } from '../../dolphin/chat/cola/cola-junto-al-composer'
import type {
  NativeChatComposerHandle,
  NativeChatComposerProps
} from './native-chat-composer-types'

// El botón de modelo muestra el que el chat usa de verdad cuando la sesión no dijo cuál.
export const NativeChatComposer = conModeloObservado(
  forwardRef<NativeChatComposerHandle, NativeChatComposerProps>(
    function NativeChatComposer(original, ref): React.JSX.Element {
      // Dolphin: Stop también pausa la cola de mensajes del chat sobre el CLI.
      const props = useComposerConPausaAlDetener(original)
      return (
        <NativeChatTextAttachmentScope
          key={props.paneKey}
          enabled={Boolean(props.structuredTransport)}
        >
          <ComposerDolphinProvider composer={props}>
            <NativeChatComposerPane {...props} ref={ref} />
          </ComposerDolphinProvider>
        </NativeChatTextAttachmentScope>
      )
    }
  )
)
