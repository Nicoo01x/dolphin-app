import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslate } from '@/i18n/use-translate'
import { AgentIcon } from '@/components/agent/icons/AgentIcon'
import { isTuiAgent } from '../../../../shared/agent-launch/catalog/tui-agent-config'
import type { NativeChatEditFile } from '../../../../shared/native-chat/tools/native-chat-edit-model'
import { NativeChatMarkdown } from '../native-chat/markdown/NativeChatMarkdown'
import { NativeChatWorkingStatus } from '../native-chat/conversation/turns/NativeChatWorkingStatus'
import { DiffIncrustado } from '../dolphin/lo-que-hizo/DiffIncrustado'
import { CodigoDeLaRespuesta } from './CodigoDeLaRespuesta'
import type { AgenteQueResponde } from './edicion-en-el-lugar-estado'

/**
 * Lo que el cuadrito de Cmd+K muestra debajo del campo: quién contesta, la respuesta o el cambio, y
 * qué se puede hacer con eso.
 *
 * Es React —el campo y el cuadrito no— porque la respuesta se lee con el mismo markdown del chat y
 * el cambio con el mismo diff de «Lo que hizo», y los dos son componentes. El cuadrito lo monta en
 * un nodo propio que Monaco mueve entero, así que el árbol no se pelea con el editor.
 */

export type VistaDelCuadrito =
  | { fase: 'cerrado' }
  | { fase: 'escribiendo' }
  | { fase: 'esperando'; desde: number }
  | { fase: 'respuesta'; pedido: string; texto: string; agente?: AgenteQueResponde }
  | { fase: 'propuesta'; pedido: string; diff: NativeChatEditFile; agente?: AgenteQueResponde }
  | { fase: 'fallo'; motivo: string }

export type AccionesDelCuerpo = {
  aceptar: () => void
  cerrar: () => void
  reintentar: () => void
}

const ES_MAC = typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac')

/** La tecla al lado del botón, como en el menú: dice cómo hacerlo sin el mouse. */
function Tecla({ children }: { children: string }): React.JSX.Element {
  return (
    <kbd className="dolphin-cmdk-tecla" aria-hidden="true">
      {children}
    </kbd>
  )
}

function Quien({
  agente,
  pedido
}: {
  agente?: AgenteQueResponde
  pedido: string
}): React.JSX.Element {
  const t = useTranslate()
  const id = agente?.id
  return (
    <div className="dolphin-cmdk-quien">
      {id && isTuiAgent(id) ? <AgentIcon agent={id} size={14} className="shrink-0" /> : null}
      <span className="dolphin-cmdk-nombre">
        {agente?.nombre ?? t('editor.inlineEdit.agent', 'AI')}
      </span>
      <span className="dolphin-cmdk-pedido" title={pedido}>
        {pedido}
      </span>
    </div>
  )
}

export function CuerpoDelCuadrito({
  vista,
  acciones
}: {
  vista: VistaDelCuadrito
  acciones: AccionesDelCuerpo
}): React.JSX.Element | null {
  const t = useTranslate()
  const cerrar = t('editor.inlineEdit.close', 'Close')
  if (vista.fase === 'cerrado' || vista.fase === 'escribiendo') {
    return null
  }
  if (vista.fase === 'esperando') {
    return (
      <div className="dolphin-cmdk-quien" aria-busy="true">
        <NativeChatWorkingStatus startedAt={vista.desde} />
      </div>
    )
  }
  if (vista.fase === 'fallo') {
    return (
      <>
        <p className="dolphin-cmdk-falla" role="alert">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
          <span>{vista.motivo}</span>
        </p>
        <div className="dolphin-cmdk-barra">
          <Button type="button" size="xs" variant="ghost" onClick={acciones.cerrar}>
            {cerrar}
            <Tecla>Esc</Tecla>
          </Button>
          <Button type="button" size="xs" variant="secondary" onClick={acciones.reintentar}>
            {t('editor.inlineEdit.tryAgain', 'Try again')}
          </Button>
        </div>
      </>
    )
  }
  if (vista.fase === 'respuesta') {
    return (
      <>
        <Quien agente={vista.agente} pedido={vista.pedido} />
        <div className="dolphin-cmdk-lectura scrollbar-sleek" tabIndex={0}>
          <NativeChatMarkdown
            content={vista.texto}
            variant="document"
            className="text-sm"
            renderCodeBlock={CodigoDeLaRespuesta}
          />
        </div>
        <div className="dolphin-cmdk-barra">
          <span className="dolphin-cmdk-pista">
            {t('editor.inlineEdit.followUpHint', 'Type above to keep asking')}
          </span>
          <Button type="button" size="xs" variant="secondary" onClick={acciones.cerrar}>
            {cerrar}
            <Tecla>Esc</Tecla>
          </Button>
        </div>
      </>
    )
  }
  return (
    <>
      <Quien agente={vista.agente} pedido={vista.pedido} />
      <div className="dolphin-cmdk-lectura dolphin-cmdk-lectura-diff scrollbar-sleek">
        <DiffIncrustado
          archivo={vista.diff}
          lineasMaximas={Number.POSITIVE_INFINITY}
          className="dolphin-cmdk-diff rounded-lg"
        />
      </div>
      <div className="dolphin-cmdk-barra">
        <Button type="button" size="xs" variant="ghost" onClick={acciones.cerrar}>
          {t('editor.inlineEdit.discard', 'Discard')}
          <Tecla>Esc</Tecla>
        </Button>
        <Button type="button" size="xs" variant="default" onClick={acciones.aceptar}>
          {t('editor.inlineEdit.accept', 'Accept')}
          <Tecla>{ES_MAC ? '⌘↵' : 'Ctrl ↵'}</Tecla>
        </Button>
      </div>
    </>
  )
}
