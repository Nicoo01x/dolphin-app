import {
  createContext,
  forwardRef,
  useContext,
  useMemo,
  type ForwardRefExoticComponent,
  type PropsWithoutRef,
  type ReactNode,
  type RefAttributes
} from 'react'
import type { NativeChatMessage } from '../../../../../shared/native-chat/native-chat-types'
import { nombreDelModelo, usoDelChat } from './uso-del-chat'

/**
 * El modelo que el chat está usando de verdad, leído del uso que viaja en la transcripción (lo mismo
 * que muestra la barra de arriba: «Opus 5.5»). El botón de modelo del compositor lo muestra cuando
 * la sesión todavía no dijo cuál eligió, en vez de la palabra «Modelo» (pedido de Nico, 27/10).
 */
const ModeloObservado = createContext<string | null>(null)
const SIN_MENSAJES: readonly NativeChatMessage[] = []

export function useModeloObservado(): string | null {
  return useContext(ModeloObservado)
}

export function ConModeloObservado(props: {
  messages: readonly NativeChatMessage[]
  children: ReactNode
}): React.JSX.Element {
  const { messages } = props
  const modelo = useMemo(() => {
    const id = usoDelChat(messages).model
    return id ? nombreDelModelo(id) : null
  }, [messages])
  return <ModeloObservado.Provider value={modelo}>{props.children}</ModeloObservado.Provider>
}

type ConMensajes = { recallSource?: { messages: readonly NativeChatMessage[] } }

/** Envuelve un compositor: sus mensajes (los de recordar lo enviado) dicen qué modelo se usa. */
export function conModeloObservado<P extends ConMensajes, R>(
  Componente: ForwardRefExoticComponent<PropsWithoutRef<P> & RefAttributes<R>>
): ForwardRefExoticComponent<PropsWithoutRef<P> & RefAttributes<R>> {
  const Envuelto = forwardRef<R, P>(function ConModelo(props, ref) {
    return (
      <ConModeloObservado messages={props.recallSource?.messages ?? SIN_MENSAJES}>
        <Componente {...(props as PropsWithoutRef<P>)} ref={ref} />
      </ConModeloObservado>
    )
  })
  return Envuelto
}
