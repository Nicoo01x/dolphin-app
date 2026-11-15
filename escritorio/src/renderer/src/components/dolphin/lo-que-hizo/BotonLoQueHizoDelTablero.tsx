import { useRef, useState } from 'react'
import { ListChecks } from 'lucide-react'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { translate } from '@/i18n/i18n'
import type { NativeChatMessage } from '../../../../../shared/native-chat/native-chat-types'
import { nativeChatTurnOpenedPullRequests } from '../../../../../shared/native-chat/tools/native-chat-opened-pull-requests'
import type { AgentType } from '../../../../../shared/agent-status/contracts/agent-status-types'
import { loQueHizo } from './pasos'
import { VentanaLoQueHizo, type DatosDeLoQueHizo } from './TarjetaLoQueHizo'
import { abreTurno } from './lo-que-hizo-del-chat'

/**
 * «Ver lo que hizo» desde una tarjeta del tablero. La tarjeta sólo sabe su rama; el tablero la
 * cruza con el espacio de trabajo, y de ahí sale la última sesión de agente de ese espacio. Se lee
 * su transcript (el mismo lector que usa el chat sobre el CLI) y se muestra su último turno.
 */

const MENSAJES_A_LEER = 400

type Sesion = { agente: AgentType; id: string; transcript?: string }

/** La sesión de agente más reciente de ese espacio, o null si nunca corrió un agente ahí. */
export function ultimaSesionDe(
  state: Pick<AppState, 'agentStatusByPaneKey'>,
  worktreeId: string
): Sesion | null {
  let mejor: { sesion: Sesion; cuando: number } | null = null
  for (const entrada of Object.values(state.agentStatusByPaneKey)) {
    const sesion = entrada.providerSession
    if (entrada.worktreeId !== worktreeId || !entrada.agentType || !sesion?.id) {
      continue
    }
    if (!mejor || entrada.stateStartedAt > mejor.cuando) {
      mejor = {
        cuando: entrada.stateStartedAt,
        sesion: {
          agente: entrada.agentType,
          id: sesion.id,
          ...(sesion.transcriptPath ? { transcript: sesion.transcriptPath } : {})
        }
      }
    }
  }
  return mejor?.sesion ?? null
}

/** El último turno: desde el último pedido de la persona (no un resultado de herramienta) al final. */
export function ultimoTurno(mensajes: readonly NativeChatMessage[]): NativeChatMessage[] {
  const desde = mensajes.findLastIndex(abreTurno)
  return desde === -1 ? [] : mensajes.slice(desde)
}

export function datosDelUltimoTurno(
  agente: AgentType,
  mensajes: readonly NativeChatMessage[]
): DatosDeLoQueHizo | null {
  const turno = ultimoTurno(mensajes)
  const resumen = loQueHizo(turno)
  if (resumen.pasos.length === 0) {
    return null
  }
  const abierto = nativeChatTurnOpenedPullRequests(
    turno,
    turno.map(() => 'turno')
  )
    .byTurn.get('turno')
    ?.at(-1)
  return { agente, resumen, pr: abierto ? { numero: abierto.number, url: abierto.url } : null }
}

export function BotonLoQueHizoDelTablero({
  worktreeId
}: {
  worktreeId: string
}): React.JSX.Element | null {
  const haySesion = useAppStore((s) => ultimaSesionDe(s, worktreeId) !== null)
  const boton = useRef<HTMLButtonElement>(null)
  const [abierta, setAbierta] = useState<{ datos: DatosDeLoQueHizo; nace: DOMRect | null } | null>(
    null
  )
  const [aviso, setAviso] = useState<string | null>(null)
  if (!haySesion) {
    return null
  }
  const abrir = async (): Promise<void> => {
    const sesion = ultimaSesionDe(useAppStore.getState(), worktreeId)
    const leer = window.api?.nativeChat?.readSession
    if (!sesion || !leer) {
      return
    }
    const leido = await leer(sesion.agente, sesion.id, MENSAJES_A_LEER, sesion.transcript).catch(
      () => null
    )
    const datos =
      leido && 'messages' in leido ? datosDelUltimoTurno(sesion.agente, leido.messages) : null
    if (!datos) {
      setAviso(
        translate(
          'auto.components.dolphin.loQueHizo.sinPasos',
          'Nothing to show from the last turn yet.'
        )
      )
      return
    }
    setAviso(null)
    setAbierta({ datos, nace: boton.current?.getBoundingClientRect() ?? null })
  }
  return (
    <div className="flex items-center gap-2 px-2.5 pb-1">
      <button
        ref={boton}
        type="button"
        aria-expanded={abierta !== null}
        onClick={() => void abrir()}
        className="flex h-6 items-center gap-1 rounded-full px-2 text-xs text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
      >
        <ListChecks className="size-3.5" aria-hidden="true" />
        {translate('auto.components.dolphin.loQueHizo.ver', 'See what it did')}
      </button>
      {aviso ? (
        <span role="status" className="truncate text-xs text-muted-foreground">
          {aviso}
        </span>
      ) : null}
      {abierta ? (
        <VentanaLoQueHizo
          datos={abierta.datos}
          nace={abierta.nace}
          onCerrar={() => setAbierta(null)}
        />
      ) : null}
    </div>
  )
}
