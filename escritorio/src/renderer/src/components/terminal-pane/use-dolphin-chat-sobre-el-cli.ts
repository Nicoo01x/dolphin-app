import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '../../store'
import { DOLPHIN_CHAT_SOBRE_EL_CLI } from '../../../../shared/dolphin-brand'

const chatOpenedKey = (onceKey: string): string => `dolphin.chat-sobre-el-cli:${onceKey}`

function chatAlreadyOpenedFor(onceKey: string): boolean {
  try {
    return window.localStorage.getItem(chatOpenedKey(onceKey)) === '1'
  } catch {
    return false
  }
}

function rememberChatOpenedFor(onceKey: string): void {
  try {
    window.localStorage.setItem(chatOpenedKey(onceKey), '1')
  } catch {
    // Sin almacenamiento vale para esta ventana: recargar lo vuelve a abrir en chat, nada más.
  }
}

const terminalElegidaKey = (tabId: string): string => `dolphin.terminal-elegida:${tabId}`

/**
 * La persona abrió el agente eligiendo «Terminal» (el CLI pelado): esa pestaña no pasa sola al
 * chat. Se guarda por pestaña para que recargar la ventana no la vuelva a pasar.
 */
export function marcarTerminalElegida(tabId: string): void {
  try {
    window.localStorage.setItem(terminalElegidaKey(tabId), '1')
  } catch {
    // Sin almacenamiento, vale para esta ventana nada más.
  }
}

export function terminalElegida(tabId: string): boolean {
  try {
    return window.localStorage.getItem(terminalElegidaKey(tabId)) === '1'
  } catch {
    return false
  }
}

/**
 * Dolphin: el agente corre como CLI de verdad en la terminal (toda su potencia, que `-p` y el SDK
 * no tienen) y lo que se ve es el chat encima, el puente que lee su sesión y le escribe. Apenas
 * un panel muestra un agente, la pestaña pasa sola a la vista de chat, una vez por sesión del
 * agente: si la persona vuelve a la terminal se respeta, y un agente nuevo vuelve a abrir en chat.
 * Se recuerda por sesión para que recargar la ventana no lo deshaga.
 */
export function useDolphinChatSobreElCli(args: {
  tabId: string
  unifiedTabId: string | null | undefined
  effectiveChatViewMode: boolean
  tabAgentTypeByLeaf: Readonly<Record<string, unknown>>
  isChatEligibleForLeaf: (leafId: string | null) => boolean
  toggleNativeChatForLeaf: (leafId: string) => void
}): void {
  const {
    tabId,
    unifiedTabId,
    effectiveChatViewMode,
    tabAgentTypeByLeaf,
    isChatEligibleForLeaf,
    toggleNativeChatForLeaf
  } = args
  // Why de los estados y no del diseño guardado: una pestaña recién creada todavía no guardó su
  // diseño, y es justo la que tiene que abrir en chat. La clave de un panel es `${tabId}:${leafId}`.
  const agentSessionIdsByLeaf = useAppStore(
    useShallow((store) => {
      const prefix = `${tabId}:`
      const sessions: Record<string, string | null> = {}
      for (const [paneKey, entry] of Object.entries(store.agentStatusByPaneKey)) {
        if (paneKey.startsWith(prefix)) {
          sessions[paneKey.slice(prefix.length)] = entry?.providerSession?.id ?? null
        }
      }
      return sessions
    })
  )
  useEffect(() => {
    if (
      !DOLPHIN_CHAT_SOBRE_EL_CLI ||
      effectiveChatViewMode ||
      !unifiedTabId ||
      terminalElegida(tabId)
    ) {
      return
    }
    // Alcanza con ver el agente en el panel (su proceso en primer plano): el id de sesión puede
    // llegar recién con el primer mensaje, y hasta entonces se vería la terminal.
    const leafId = Object.keys(tabAgentTypeByLeaf).find(
      (candidate) => tabAgentTypeByLeaf[candidate] && isChatEligibleForLeaf(candidate)
    )
    if (!leafId) {
      return
    }
    // Una vez por sesión; mientras la sesión no tiene id, una vez por panel.
    const onceKey = agentSessionIdsByLeaf[leafId] ?? `panel:${tabId}:${leafId}`
    if (chatAlreadyOpenedFor(onceKey)) {
      return
    }
    rememberChatOpenedFor(onceKey)
    toggleNativeChatForLeaf(leafId)
  }, [
    agentSessionIdsByLeaf,
    effectiveChatViewMode,
    isChatEligibleForLeaf,
    tabAgentTypeByLeaf,
    tabId,
    toggleNativeChatForLeaf,
    unifiedTabId
  ])
}
