import { useEffect, useMemo, useRef, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AgentIcon } from '@/components/agent/icons/AgentIcon'
import { getAgentLabel } from '@/lib/agent-catalog/agent-catalog'
import { cn } from '@/lib/class-names'
import { translate } from '@/i18n/i18n'
import type { AgentType } from '../../../../../shared/agent-status/contracts/agent-status-types'
import type { NativeChatMessage } from '../../../../../shared/native-chat/native-chat-types'
import { isTuiAgent } from '../../../../../shared/agent-launch/catalog/tui-agent-config'
import { DolphinMark } from '../DolphinMark'
import { registrarEstudio } from '../studio/studio-estudio'
import { summarizeStudioSession } from '../studio/studio-summary'
import {
  abrirAlCostado,
  escrituraNueva,
  escriturasDe,
  type ContextoDelChat
} from './seguir-archivos'
import { nombreDelModelo, usoDelChat } from './uso-del-chat'

const CLAVE_SEGUIR = 'dolphin.seguir-archivos'

function leerSeguir(): boolean {
  try {
    return window.localStorage.getItem(CLAVE_SEGUIR) !== '0'
  } catch {
    return true
  }
}

function guardarSeguir(seguir: boolean): void {
  try {
    window.localStorage.setItem(CLAVE_SEGUIR, seguir ? '1' : '0')
  } catch {
    // Sin almacenamiento vale para esta ventana.
  }
}

/**
 * La barra de Dolphin arriba del chat de un agente: quién es, en qué anda, qué archivos tocó y si
 * se los va mostrando al costado. Con «seguir» prendido, cada archivo que el agente cambia se abre
 * en un editor al lado del chat, en modo cambios, como en VS Code; lo que ya había tocado antes de
 * abrir el chat no se abre solo.
 */
export function DolphinChatBar({
  paneKey,
  agent,
  sessionId,
  messages,
  ready,
  context,
  working,
  awaitingInput
}: {
  /** Para que la isla vea los archivos de este agente aunque su estudio no esté abierto. */
  paneKey: string
  agent: AgentType
  sessionId: string | null
  messages: readonly NativeChatMessage[]
  ready: boolean
  context: ContextoDelChat | null
  working: boolean
  /** Si el agente espera una respuesta (con la tarjeta a la vista o no). */
  awaitingInput: 'shown' | 'unshown' | null
}): React.JSX.Element {
  const [seguir, setSeguir] = useState(leerSeguir)
  const escrituras = useMemo(() => escriturasDe(messages), [messages])
  const resumen = useMemo(() => summarizeStudioSession(messages), [messages])
  useEffect(() => {
    registrarEstudio(paneKey, resumen)
  }, [paneKey, resumen])
  const uso = useMemo(() => usoDelChat(messages), [messages])
  const vistaRef = useRef<{ sessionId: string | null; vistas: Set<string> } | null>(null)
  useEffect(() => {
    if (!ready || !context) {
      return
    }
    const vista = vistaRef.current
    // La primera mirada de cada sesión solo anota: lo que ya había hecho antes no se abre de golpe.
    if (!vista || vista.sessionId !== sessionId) {
      vistaRef.current = { sessionId, vistas: new Set(escrituras.map((e) => e.clave)) }
      return
    }
    const nueva = escrituraNueva(vista.vistas, escrituras)
    for (const escritura of escrituras) {
      vista.vistas.add(escritura.clave)
    }
    if (seguir && nueva) {
      abrirAlCostado(context, nueva.path)
    }
  }, [context, escrituras, ready, seguir, sessionId])

  const nombre = isTuiAgent(agent) ? getAgentLabel(agent) : agent
  const estado = working
    ? translate('auto.components.dolphin.chatBar.working', 'Working')
    : awaitingInput
      ? translate('auto.components.dolphin.chatBar.waiting', 'Waiting for you')
      : translate('auto.components.dolphin.chatBar.ready', 'Ready')
  const seguirLabel = translate(
    'auto.components.dolphin.chatBar.follow',
    'Open each file it changes beside the chat'
  )

  return (
    // Why pr-24: los controles del panel (pasar a otro agente, terminal, dividir, cerrar) flotan
    // sobre la esquina de arriba a la derecha.
    <header className="@container flex h-10 shrink-0 items-center gap-2 pr-24 pl-4 text-foreground">
      <DolphinMark className="h-3.5 w-4 shrink-0" />
      <span className="inline-flex shrink-0 items-center gap-1.5 text-[13px] font-semibold">
        <AgentIcon agent={isTuiAgent(agent) ? agent : null} size={13} />
        {nombre}
      </span>
      {uso.model ? (
        <span
          className="shrink-0 text-xs text-muted-foreground"
          title={`${translate('auto.components.dolphin.chatBar.model', 'Model')}: ${uso.model}`}
        >
          {nombreDelModelo(uso.model)}
        </span>
      ) : null}
      <span
        className={cn(
          'inline-flex shrink-0 items-center gap-1.5 text-xs',
          working ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'size-1.5 rounded-full',
            working
              ? 'animate-pulse bg-foreground motion-reduce:animate-none'
              : awaitingInput
                ? 'bg-status-warning'
                : 'bg-muted-foreground/50'
          )}
        />
        {estado}
      </span>
      {/* Why sólo controles: hasta el 08/11/2026 acá iban también el costo de la sesión, el
          porcentaje del plan, el contexto leído y los archivos tocados. Nico los sacó: son
          cifras que se miran una vez y después ocupan la barra entera en un panel angosto.
          Lo que queda se toca, no se lee. */}
      <div className="ml-auto flex min-w-0 items-center gap-2">
        {/* Why acá no está «Orquestación inteligente»: hasta el 10/11/2026 iba junto al ojo, después
            pasó al compositor y el 17/11/2026 Nico lo sacó del todo. Repartir se pide en el chat
            («delegá las tareas», skill dolphin-delegar); el ajuste sigue en Ajustes › Experimental. */}
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="shrink-0"
          aria-label={seguirLabel}
          aria-pressed={seguir}
          title={seguirLabel}
          onClick={() => {
            setSeguir((previo) => {
              guardarSeguir(!previo)
              return !previo
            })
          }}
        >
          {seguir ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
        </Button>
      </div>
    </header>
  )
}
