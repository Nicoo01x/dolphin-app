import { FilePenLine, FilePlus2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { translate } from '@/i18n/i18n'
import { AgentIcon } from '@/components/agent/icons/AgentIcon'
import { getAgentLabel } from '@/lib/agent-catalog/agent-catalog'
import { isTuiAgent } from '../../../../../shared/agent-launch/catalog/tui-agent-config'
import type { DashboardCard } from '../../../../../shared/dashboard-snapshot'
import type { EstudioDeIsla } from '../../../../../shared/dolphin-isla-types'
import { splitStudioPath } from '../studio/studio-summary'
import { AvisoDeIsla, irAlAgente } from './isla-piezas'

const ACTUALIZACION_MINIMA_MS = 1_000

export function IslaEstudio({
  cards,
  tablero,
  onIr
}: {
  cards: readonly DashboardCard[]
  tablero: number
  onIr: () => void
}): React.JSX.Element {
  const [estudio, setEstudio] = useState<EstudioDeIsla | null>(null)
  const pedidoAnterior = useRef(0)
  useEffect(() => {
    let vigente = true
    const pedir = (): void => {
      void Promise.resolve(window.api.dolphin.estudioDeIsla?.() ?? { disponible: false, agentes: [] })
        .catch(() => ({ disponible: false, agentes: [] }))
        .then((resultado) => {
          if (vigente) {
            setEstudio(resultado)
          }
        })
    }
    const espera = Math.max(0, ACTUALIZACION_MINIMA_MS - (Date.now() - pedidoAnterior.current))
    const siguiente = setTimeout(() => {
      pedidoAnterior.current = Date.now()
      pedir()
    }, espera)
    return () => {
      vigente = false
      clearTimeout(siguiente)
    }
  }, [tablero])

  if (estudio && !estudio.disponible) {
    return (
      <AvisoDeIsla>
        {translate(
          'auto.components.dolphin.isla.studioUnavailable',
          'There is no studio data right now.'
        )}
      </AvisoDeIsla>
    )
  }
  if (!estudio || estudio.agentes.length === 0) {
    return (
      <AvisoDeIsla>
        {translate(
          'auto.components.dolphin.isla.studioEmpty',
          'When an agent touches files, they show up here.'
        )}
      </AvisoDeIsla>
    )
  }
  const porPane = new Map(cards.map((card) => [card.paneKey, card]))
  return (
    <div className="space-y-1">
      {estudio.agentes.map((agente) => {
        const card = porPane.get(agente.paneKey)
        if (!card) {
          return null
        }
        const nombreAgente = isTuiAgent(card.agentType)
          ? getAgentLabel(card.agentType)
          : card.agentType
        return (
          <section key={agente.paneKey} className="rounded-2xl px-3 py-2">
            <button
              type="button"
              className="mb-1 block max-w-full truncate text-left text-[13px] font-medium focus-visible:outline-2 focus-visible:outline-white/60"
              onClick={() => {
                irAlAgente(card)
                onIr()
              }}
            >
              <span className="inline-flex max-w-full items-center gap-1.5">
                <AgentIcon agent={isTuiAgent(card.agentType) ? card.agentType : null} size={13} />
                <span className="truncate">{nombreAgente}</span>
                <span className="truncate font-normal text-white/50">· {card.worktreeName}</span>
              </span>
            </button>
            <ul className="space-y-0.5">
              {agente.archivos.map((archivo) => {
                const nombre = splitStudioPath(archivo.ruta).name
                const Icon = archivo.accion === 'creado' ? FilePlus2 : FilePenLine
                return (
                  <li key={archivo.ruta}>
                    <button
                      type="button"
                      title={archivo.ruta}
                      className="flex w-full items-center gap-2 rounded-xl px-1.5 py-1 text-left text-xs text-white/70 hover:bg-white/[0.07] hover:text-white focus-visible:outline-2 focus-visible:outline-white/60"
                      onClick={() => {
                        irAlAgente(card)
                        onIr()
                      }}
                    >
                      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">{nombre}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
