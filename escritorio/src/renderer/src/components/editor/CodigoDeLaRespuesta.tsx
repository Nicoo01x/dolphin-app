import React from 'react'
import { useTranslate } from '@/i18n/use-translate'
import { NativeChatHighlightedCode } from '../native-chat/markdown/code/NativeChatHighlightedCode'
import { getCodeFenceLanguageLabel } from '../native-chat/markdown/code/code-fence-language-label'
import { NativeChatCopyButton } from '../native-chat/messages/actions/NativeChatCopyButton'

/**
 * Un bloque de código adentro de una respuesta de Cmd+K: el mismo resaltado y el mismo botón de
 * copiar que en el chat.
 *
 * No es `NativeChatCodeBlock` porque ese trae «Aplicar en el archivo abierto», y acá el archivo
 * abierto es justo el que tiene la selección: un ejemplo de una respuesta aplicado por error es la
 * misma prosa-en-el-código que este cuadrito existe para evitar. Si la persona quiere el cambio, lo
 * pide en el mismo campo y vuelve como reemplazo, con su diff y su Aceptar.
 */
export function CodigoDeLaRespuesta({
  children,
  language
}: {
  children?: React.ReactNode
  language?: string
  sourceLine?: number
}): React.JSX.Element {
  const t = useTranslate()
  const codigo = textoDe(children).replace(/\n$/, '')
  return (
    <div className="dolphin-cmdk-bloque group/code">
      <div className="dolphin-cmdk-bloque-cabeza">
        <span className="min-w-0 truncate">
          {language ? getCodeFenceLanguageLabel(language) : null}
        </span>
        {codigo ? (
          <NativeChatCopyButton
            text={codigo}
            label={t('components.native-chat.copyCode', 'Copy code')}
          />
        ) : null}
      </div>
      <pre className="dolphin-cmdk-bloque-codigo scrollbar-sleek">
        {language && codigo ? (
          <code>
            <NativeChatHighlightedCode code={codigo} language={language} />
          </code>
        ) : (
          children
        )}
      </pre>
    </div>
  )
}

function textoDe(nodo: React.ReactNode): string {
  if (typeof nodo === 'string' || typeof nodo === 'number') {
    return String(nodo)
  }
  if (Array.isArray(nodo)) {
    return nodo.map(textoDe).join('')
  }
  if (React.isValidElement<{ children?: React.ReactNode }>(nodo)) {
    return textoDe(nodo.props.children)
  }
  return ''
}
