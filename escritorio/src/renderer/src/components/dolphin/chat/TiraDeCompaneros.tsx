import { useMemo } from 'react'
import { X } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { AgentStateDot } from '@/components/AgentStateDot'
import { Button } from '@/components/ui/button'
import { AgentIcon } from '@/components/agent/icons/AgentIcon'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { AgentType } from '../../../../../shared/agent-status/contracts/agent-status-types'
import { isTuiAgent } from '../../../../../shared/agent-launch/catalog/tui-agent-config'
import { irAlTrabajo } from './delegar-en-trabajos'
import { estadosDeLosTrabajos } from './estados-de-los-trabajos'
import { olvidarTrabajos, useTrabajosDelegados } from './trabajos-delegados'

/**
 * La tira de compañeros: arriba de la conversación, una pastilla por cada compañero que la
 * delegación abrió en este proyecto, con en qué anda, y se entra tocándola.
 *
 * Por qué existe, además de la ventana que los propone: los compañeros se abren **sin activarse**
 * —delegar no te saca del chat que estabas leyendo— y la ventana que los ofreció se descarta. Sin
 * esta tira quedaban tres agentes trabajando sin un lugar donde verlos ni con qué cambiar a ellos:
 * son pestañas, pero de otro tipo de vista que la que estás mirando.
 *
 * No es una barra de pestañas nueva. Las pestañas de verdad son las de la app y siguen ahí; esto es
 * el acceso al equipo desde donde se lo dirige, que es el chat del líder.
 */
export function TiraDeCompaneros({
  worktreeId,
  agente
}: {
  readonly worktreeId: string | null
  /** El motor con el que se delegó: todos los compañeros de un plan escriben con el mismo. */
  readonly agente: AgentType
}): React.JSX.Element | null {
  const trabajos = useTrabajosDelegados(worktreeId)
  const tabIds = useMemo(() => trabajos.map((trabajo) => trabajo.tabId), [trabajos])
  const estados = useAppStore(
    useShallow((state) => estadosDeLosTrabajos(state.agentStatusByPaneKey, tabIds))
  )

  // El mismo guardia que la ventana: a un motor que no es de terminal no se le delega, así que no
  // puede tener compañeros. Y es lo que deja a `agente` como un agente que el catálogo sabe dibujar.
  if (worktreeId === null || trabajos.length === 0 || !isTuiAgent(agente)) {
    return null
  }

  return (
    <div
      role="group"
      aria-label={translate('components.dolphin.chat.companeros.titulo', 'Teammates on this plan')}
      className="flex shrink-0 items-center gap-1 bg-foreground/[0.035] px-2 py-1.5"
    >
      <ul className="scrollbar-sleek flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {trabajos.map((trabajo) => (
          <li key={trabajo.tabId} className="shrink-0">
            <button
              type="button"
              onClick={() => irAlTrabajo(worktreeId, trabajo.tabId)}
              title={trabajo.titulo}
              className="flex max-w-56 items-center gap-1.5 rounded-full bg-foreground/[0.05] py-1 pl-2 pr-2.5 text-xs transition-colors duration-150 ease-out hover:bg-foreground/[0.1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:bg-foreground/[0.14]"
            >
              <AgentIcon agent={agente} size={12} />
              <span className="min-w-0 truncate">{trabajo.titulo}</span>
              {/* Un compañero recién abierto todavía no reportó: sin estado no se dibuja nada,
                  porque un punto gris afirmaría que está quieto. */}
              {estados[trabajo.tabId] ? (
                <AgentStateDot state={estados[trabajo.tabId]!} className="-mr-0.5" />
              ) : null}
            </button>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="shrink-0"
        aria-label={translate('components.dolphin.chat.companeros.esconder', 'Hide the teammates')}
        title={translate(
          'components.dolphin.chat.companeros.esconderAyuda',
          'Hides the strip. The teammates stay open as tabs.'
        )}
        onClick={() => olvidarTrabajos(worktreeId)}
      >
        <X aria-hidden="true" />
      </Button>
    </div>
  )
}
