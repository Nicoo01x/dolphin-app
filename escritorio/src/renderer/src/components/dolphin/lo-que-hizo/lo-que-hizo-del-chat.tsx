import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { ListChecks } from 'lucide-react'
import type { AgentType } from '../../../../../shared/agent-status/contracts/agent-status-types'
import type { NativeChatMessage } from '../../../../../shared/native-chat/native-chat-types'
import {
  nativeChatTurnOpenedPullRequests,
  type NativeChatOpenedPullRequest
} from '../../../../../shared/native-chat/tools/native-chat-opened-pull-requests'
import { nativeChatTranscriptSettledTurns } from '../../../../../shared/native-chat/native-chat-terminal-turn'
import { translate } from '@/i18n/i18n'
import { loQueHizo } from './pasos'
import { VentanaLoQueHizo, type DatosDeLoQueHizo } from './TarjetaLoQueHizo'

/**
 * El enganche de la tarjeta «Lo que hizo» con el chat. El marco de Dolphin alrededor de cada chat
 * (`chat-dolphin.tsx`) tiene los mensajes de la sesión; acá se parten en turnos, con su tiempo y el
 * PR que abrió cada uno, y el botón «Ver lo que hizo» del pie de la respuesta final los pide por el
 * id de su mensaje.
 *
 * Why un contexto: la fila de la respuesta es de la base y no sabe de turnos; pasarle el turno por
 * props tocaba cinco componentes de la base, que además están en su tope de líneas.
 */

export type TurnosDelChat = {
  readonly agente: AgentType
  readonly mensajes: readonly NativeChatMessage[]
  readonly turnKeys: readonly (string | undefined)[]
  readonly tiempos: Readonly<
    Record<string, { startedAt: number | null; workedSeconds: number | null }>
  >
  readonly prs: ReadonlyMap<string, readonly NativeChatOpenedPullRequest[]>
}

type Buscar = (mensajeId: string) => DatosDeLoQueHizo | null

const LoQueHizoContext = createContext<Buscar>(() => null)

/** Lo que hizo el turno de ese mensaje, o null si el mensaje no es de un turno con pasos. */
export function datosDelTurno(turnos: TurnosDelChat, mensajeId: string): DatosDeLoQueHizo | null {
  const indice = turnos.mensajes.findIndex((mensaje) => mensaje.id === mensajeId)
  const turno = indice === -1 ? undefined : turnos.turnKeys[indice]
  if (!turno) {
    return null
  }
  const delTurno = turnos.mensajes.filter((_, i) => turnos.turnKeys[i] === turno)
  const tiempo = turnos.tiempos[turno]
  const resumen = loQueHizo(delTurno, {
    inicio: tiempo?.startedAt ?? null,
    segundosTrabajados: tiempo?.workedSeconds ?? null
  })
  if (resumen.pasos.length === 0) {
    return null
  }
  const abierto = turnos.prs.get(turno)?.at(-1)
  return {
    agente: turnos.agente,
    resumen,
    pr: abierto ? { numero: abierto.number, url: abierto.url } : null
  }
}

/**
 * Qué mensaje abre un turno: uno de la persona con algo escrito. En el transcript de Claude el
 * resultado de cada herramienta también llega como mensaje de la persona, y ése no abre nada.
 */
export function abreTurno(mensaje: NativeChatMessage): boolean {
  return mensaje.role === 'user' && mensaje.blocks.some((bloque) => bloque.type !== 'tool-result')
}

export function turnosDe(agente: AgentType, mensajes: readonly NativeChatMessage[]): TurnosDelChat {
  let actual: string | undefined
  const turnKeys = mensajes.map((mensaje) => {
    actual = abreTurno(mensaje) ? mensaje.id : actual
    return actual
  })
  const tiempos: Record<string, { startedAt: number | null; workedSeconds: number | null }> = {}
  for (const [turno, tiempo] of nativeChatTranscriptSettledTurns(mensajes)) {
    if (tiempo) {
      tiempos[turno] = { startedAt: tiempo.startedAt, workedSeconds: tiempo.workedSeconds }
    }
  }
  const prs = nativeChatTurnOpenedPullRequests(mensajes, turnKeys).byTurn
  return { agente, mensajes, turnKeys, tiempos, prs }
}

export function LoQueHizoProvider({
  agente,
  mensajes,
  children
}: {
  agente: AgentType
  mensajes: readonly NativeChatMessage[]
  children: React.ReactNode
}): React.JSX.Element {
  const turnos = useMemo(() => turnosDe(agente, mensajes), [agente, mensajes])
  // Why una función y no el mapa entero: los pasos de un turno se arman recién cuando alguien los
  // pide (el botón de su respuesta), no en cada render de la conversación.
  const buscar = useCallback<Buscar>((mensajeId) => datosDelTurno(turnos, mensajeId), [turnos])
  return <LoQueHizoContext.Provider value={buscar}>{children}</LoQueHizoContext.Provider>
}

/** El botón del pie de la respuesta final de un turno. Sin pasos que mostrar, no aparece. */
export function BotonVerLoQueHizo({ mensajeId }: { mensajeId: string }): React.JSX.Element | null {
  const buscar = useContext(LoQueHizoContext)
  const datos = useMemo(() => buscar(mensajeId), [buscar, mensajeId])
  const boton = useRef<HTMLButtonElement>(null)
  const [abierta, setAbierta] = useState<{ nace: DOMRect | null } | null>(null)
  if (!datos) {
    return null
  }
  return (
    <>
      <button
        ref={boton}
        type="button"
        aria-expanded={abierta !== null}
        onClick={() => setAbierta({ nace: boton.current?.getBoundingClientRect() ?? null })}
        className="flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-xs text-chat-foreground-faint transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
      >
        <ListChecks className="size-3.5" aria-hidden="true" />
        {translate('auto.components.dolphin.loQueHizo.ver', 'See what it did')}
      </button>
      {abierta ? (
        <VentanaLoQueHizo datos={datos} nace={abierta.nace} onCerrar={() => setAbierta(null)} />
      ) : null}
    </>
  )
}
