import { useEffect, useRef, useState } from 'react'
import { Trans } from 'react-i18next'
import { Check } from 'lucide-react'
import { FEATURE_TIPS } from '../../../../../shared/feature-tips'
import { i18n } from '@/i18n/i18n'
import { useTranslate } from '@/i18n/use-translate'
import { useMountedRef } from '@/hooks/useMountedRef'
import { useAppStore } from '@/store'
import { ChatSurfacePreview } from '../../agent/launch-settings/AgentDefaultSurfacePreviews'
import { getChatUiHereVariantCopy } from '../../feature-tips/chat-ui-here-copy'
import { FeatureTipSettingsLine } from '../../feature-tips/FeatureTipDialogFrame'
import { trackChatUiFeatureTipAction } from '../../feature-tips/feature-tip-telemetry'
import {
  openChatUiFeatureTipSettings,
  setAgentDefaultSurfaceFromFeatureTip
} from '../../feature-tips/chat-ui-here-actions'
import type { AccionesDelAviso } from './cola-de-avisos'
import { encolarAviso, retirarAviso } from './avisos-store'
import { BotonDeAviso, CuerpoDelAviso } from './PiezasDelAviso'

export const ID_INTERFAZ_DE_CHAT = 'chat-ui-here'

type Etapa = 'pregunta' | 'guardando' | 'cambiada'

/** Ya elegida: la misma ventana confirma el cambio, en vez de abrir otra tarjeta en la esquina. */
function Cambiada({ responder, descartar }: AccionesDelAviso): React.JSX.Element {
  const t = useTranslate()
  return (
    <CuerpoDelAviso
      titulo={t('featureTips.chatUiHere.switchedNoteTitle', 'New agents will open in Chat UI')}
      onAhoraNo={descartar}
      botones={
        <>
          <BotonDeAviso onClick={() => responder(openChatUiFeatureTipSettings)}>
            {t('featureTips.chatUiHere.openSettings', 'Open Settings')}
          </BotonDeAviso>
          <BotonDeAviso principal onClick={() => responder()}>
            <Check className="size-3.5" aria-hidden="true" />
            {t('featureTips.gotIt', 'Got it')}
          </BotonDeAviso>
        </>
      }
    >
      <Trans
        i18n={i18n}
        defaults={t(
          'featureTips.chatUiHere.switchedNoteBody',
          'Prefer the terminal? Switch back anytime: search <term>Chat UI</term> in Settings.'
        )}
        components={{ term: <span className="font-medium text-foreground" /> }}
      />
    </CuerpoDelAviso>
  )
}

function ContenidoDeLaInterfazDeChat({
  acciones,
  alElegirChat
}: {
  readonly acciones: AccionesDelAviso
  readonly alElegirChat: () => void
}): React.JSX.Element | null {
  const t = useTranslate()
  const montada = useMountedRef()
  const [etapa, setEtapa] = useState<Etapa>('pregunta')
  const invertidos = useAppStore(
    (s) =>
      s.settings?.telemetry?.chatUiLaunchTipButtonEmphasis === 'swapped' ||
      s.settings?.telemetry?.chatUiLaunchTipCohort === 'treatment-swapped-buttons'
  )
  if (!FEATURE_TIPS.some((tip) => tip.id === ID_INTERFAZ_DE_CHAT)) {
    return null
  }
  if (etapa === 'cambiada') {
    return <Cambiada {...acciones} />
  }
  const { paragraphs, secondaryLabel, primaryLabel } = getChatUiHereVariantCopy('chat-ui-off', t)
  const [intro = ''] = paragraphs
  const guardando = etapa === 'guardando'

  const usarElChat = async (): Promise<void> => {
    setEtapa('guardando')
    const guardado = await setAgentDefaultSurfaceFromFeatureTip('chat', { confirmWithToast: false })
    if (guardado) {
      alElegirChat()
    }
    if (montada.current) {
      setEtapa(guardado ? 'cambiada' : 'pregunta')
    }
  }

  const seguirEnElTerminal = (
    <BotonDeAviso
      key="terminal"
      principal={invertidos}
      disabled={guardando}
      onClick={() => {
        trackChatUiFeatureTipAction('chat-ui-off', 'stay_in_terminal')
        acciones.responder()
      }}
    >
      {secondaryLabel ?? t('featureTips.chatUiHere.stayInTerminal', 'Stay in terminal')}
    </BotonDeAviso>
  )
  const usarChat = (
    <BotonDeAviso
      key="chat"
      principal={!invertidos}
      disabled={guardando}
      onClick={() => void usarElChat()}
    >
      {primaryLabel}
    </BotonDeAviso>
  )

  return (
    <CuerpoDelAviso
      visual={<ChatSurfacePreview />}
      titulo={t('featureTips.chatUiHere.title', 'Chat UI is here')}
      onAhoraNo={acciones.descartar}
      // El experimento de énfasis cambia cuál es el negro, no el orden: el que acepta va al final.
      botones={[seguirEnElTerminal, usarChat]}
    >
      <span className="block">{intro}</span>
      <span className="mt-2 block">
        <FeatureTipSettingsLine
          text={t(
            'featureTips.chatUiHere.changeInSettings',
            'Change anytime in <link>Settings → Chat UI</link>.'
          )}
          onClick={() => {
            trackChatUiFeatureTipAction('chat-ui-off', 'open_settings')
            acciones.responder(openChatUiFeatureTipSettings)
          }}
        />
      </span>
    </CuerpoDelAviso>
  )
}

/**
 * «Llega la interfaz de chat», para los perfiles que abren los agentes en el terminal. Antes era
 * una tarjeta de 360 px en la pila de la esquina, que con la demo y los botones en castellano no
 * entraba y quedaba cortada contra el borde. Ahora es el primer aviso de la cola: es lo que más
 * cambia cómo se usa la app.
 *
 * Quién decide mostrarla sigue siendo `use-onboarding-and-feature-tips` (`abierto`); esto la pone
 * en la cola y le avisa cuando se cerró.
 */
export function AvisoDeLaInterfazDeChat({
  abierto,
  onCerrar
}: {
  readonly abierto: boolean
  readonly onCerrar: () => void
}): null {
  const cerrar = useRef(onCerrar)
  cerrar.current = onCerrar

  useEffect(() => {
    if (!abierto) {
      return
    }
    let elegida = false
    encolarAviso({
      id: ID_INTERFAZ_DE_CHAT,
      importancia: 'uso',
      titulo: (t) => t('featureTips.chatUiHere.title', 'Chat UI is here'),
      alDescartar: () => {
        // Ya elegido el chat, cerrar la confirmación no es «descartar el aviso».
        if (!elegida) {
          trackChatUiFeatureTipAction('chat-ui-off', 'dismissed')
        }
        cerrar.current()
      },
      contenido: (acciones) => (
        <ContenidoDeLaInterfazDeChat
          acciones={{
            descartar: acciones.descartar,
            responder: (luego) =>
              acciones.responder(() => {
                cerrar.current()
                luego?.()
              })
          }}
          alElegirChat={() => {
            elegida = true
          }}
        />
      )
    })
    return () => retirarAviso(ID_INTERFAZ_DE_CHAT)
  }, [abierto])

  return null
}
