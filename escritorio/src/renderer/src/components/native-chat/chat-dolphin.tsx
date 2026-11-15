import type React from 'react'
import type { AgentType } from '../../../../shared/agent-status/contracts/agent-status-types'
import type { NativeChatCommandMarker } from './session/terminal/delivery/native-chat-command-marker'
import type { NativeChatMessage } from '../../../../shared/native-chat/native-chat-types'
import { DolphinChatBar } from '../dolphin/chat/DolphinChatBar'
import {
  DolphinChatColumns,
  useDolphinCliChatSidePanel
} from '../dolphin/chat/DolphinCliChatSidePanel'
import { useNativeChatFileLinkContext } from './links/actions/use-native-chat-file-link-context'
import { NativeChatAgentWatermark } from './NativeChatAgentWatermark'
import { NativeChatCompactandoRow } from './NativeChatCompactandoRow'
import { useCompactadoEnCurso } from './use-compactado-en-curso'
import { LoQueHizoProvider } from '../dolphin/lo-que-hizo/lo-que-hizo-del-chat'
export {
  VacioDelChatDeTerminal,
  VacioDelChatEstructurado
} from '../dolphin/paisaje/ChatVacioConPaisaje'

/*
 * Lo que Dolphin le suma a las dos vistas del chat de la base (la de terminal y la estructurada).
 * Why acá: esas vistas viven en su tope de líneas; cada pieza entra con una etiqueta y lo de la base
 * queda adentro sin tocar.
 */

type BarProps = React.ComponentProps<typeof DolphinChatBar>

/**
 * El chat de un agente de terminal con lo de Dolphin alrededor: la barra de arriba y las columnas
 * donde flota la ventana que propone delegar.
 */
export function MarcoDelChatDeTerminal({
  paneKey,
  agent,
  sessionId,
  terminalTabId,
  session,
  turnActive,
  awaitingInput,
  children
}: {
  paneKey: string
  agent: AgentType
  sessionId: BarProps['sessionId']
  terminalTabId: string
  session: {
    readonly messages: readonly NativeChatMessage[]
    readonly readPhase: string
    readonly status: string
  }
  turnActive: boolean
  awaitingInput: BarProps['awaitingInput']
  children: React.ReactNode
}): React.JSX.Element {
  const fileLinkContext = useNativeChatFileLinkContext(terminalTabId)
  const sidePanel = useDolphinCliChatSidePanel(
    terminalTabId,
    session.messages,
    session.status === 'working'
  )
  return (
    <>
      <DolphinChatBar
        paneKey={paneKey}
        agent={agent}
        sessionId={sessionId}
        messages={session.messages}
        ready={session.readPhase === 'ready'}
        context={fileLinkContext}
        working={turnActive}
        awaitingInput={awaitingInput}
      />
      <DolphinChatColumns {...sidePanel.columnas} agent={agent}>
        <LoQueHizoProvider agente={agent} mensajes={session.messages}>
          {children}
        </LoQueHizoProvider>
      </DolphinChatColumns>
    </>
  )
}

/**
 * La marca de agua del motor detrás de la conversación, con la conversación por encima. Con los
 * mensajes, además, la tarjeta «Lo que hizo» de cada turno.
 */
export function LienzoConMarcaDeAgua({
  agent,
  mensajes = SIN_MENSAJES,
  children
}: {
  agent: AgentType
  mensajes?: readonly NativeChatMessage[]
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <>
      <NativeChatAgentWatermark agent={agent} />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <LoQueHizoProvider agente={agent} mensajes={mensajes}>
          {children}
        </LoQueHizoProvider>
      </div>
    </>
  )
}

const SIN_MENSAJES: readonly NativeChatMessage[] = []

/**
 * Mientras un `/compact` no deja su marca, el separador lo anuncia con su reloj en vez de dejar la
 * conversación quieta (`compactado-en-curso.ts`).
 */
export function FilaDeCompactado(props: {
  markers?: readonly NativeChatCommandMarker[]
  messages: readonly NativeChatMessage[]
}): React.JSX.Element | null {
  const compactando = useCompactadoEnCurso(props)
  return compactando ? <NativeChatCompactandoRow desde={compactando.desde} /> : null
}
