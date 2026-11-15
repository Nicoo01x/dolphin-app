import { createContext, useContext, useMemo } from 'react'
import type React from 'react'
import type { NativeChatComposerProps } from '../../native-chat/composer/native-chat-composer-types'
import type { SugerenciaDeRespuesta } from './sugerencia-de-respuesta'
import { sugerenciaParaElCampo } from './sugerencia-para-el-campo'
import { claveDeCola } from './cola/cola-del-chat-store'
import { ColaJuntoAlComposer, composerConCola } from './cola/cola-junto-al-composer'

type ComposerDolphin = {
  /** La pestaña del chat: identifica sus checkpoints de código. */
  terminalTabId?: string
  /** Lo que conviene contestarle al agente con este borrador, o null si no hay nada que sugerir. */
  sugerir: (borrador: string) => SugerenciaDeRespuesta | null
  /** La cola de Dolphin de este chat sobre el CLI; null en el estructurado y en los lanzadores. */
  cola: { clave: string; trabajando: boolean } | null
}

const SIN_COMPOSER: ComposerDolphin = { sugerir: () => null, cola: null }

const ComposerDolphinContext = createContext<ComposerDolphin>(SIN_COMPOSER)

/**
 * Lo que Dolphin le suma al composer de la base, al alcance de sus piezas: el campo y su teclado.
 *
 * Why un contexto y no props: el composer de la base está en su tope de líneas, y pasar esto por él
 * cuesta una línea por dato. El contexto se pone una vez afuera y cada pieza lo lee donde lo usa.
 */
export function ComposerDolphinProvider({
  composer,
  children
}: {
  composer: NativeChatComposerProps
  children: React.ReactNode
}): React.JSX.Element {
  const { editSession, launchPrompt, recallSource, isWorking = false, terminalTabId } = composer
  const { paneKey, agent } = composer
  const mensajes = recallSource?.messages
  // Al editar un mensaje en cola o en el pedido de lanzamiento el campo no le contesta a nadie.
  const sinSugerencia = Boolean(editSession || launchPrompt)
  const sinCola = !composerConCola(composer)
  const valor = useMemo<ComposerDolphin>(
    () => ({
      terminalTabId,
      sugerir: (borrador) =>
        sinSugerencia ? null : sugerenciaParaElCampo(mensajes, isWorking, borrador),
      cola: sinCola ? null : { clave: claveDeCola(paneKey, agent), trabajando: isWorking }
    }),
    [terminalTabId, sinSugerencia, mensajes, isWorking, sinCola, paneKey, agent]
  )
  return (
    <ComposerDolphinContext.Provider value={valor}>
      <ColaJuntoAlComposer composer={composer} />
      {children}
    </ComposerDolphinContext.Provider>
  )
}

/** Lo que conviene contestarle al agente: se ve en el campo vacío y Tab lo escribe. */
export function useComposerDolphin(borrador: string): {
  terminalTabId?: string
  sugerencia: SugerenciaDeRespuesta | null
} {
  const { terminalTabId, sugerir } = useContext(ComposerDolphinContext)
  const sugerencia = useMemo(() => sugerir(borrador), [sugerir, borrador])
  return terminalTabId ? { terminalTabId, sugerencia } : { sugerencia }
}

/** La cola de este composer, para que el envío al CLI la consulte (`cola/cola-en-el-composer`). */
export function useColaDelComposerDolphin(): ComposerDolphin['cola'] {
  return useContext(ComposerDolphinContext).cola
}
