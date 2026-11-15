import { useAppStore } from '@/store'
import { useRepos } from '@/store/repos/use-repository-catalog'
import { translate } from '@/i18n/i18n'
import { findKnownWorktreeById } from '@/store/slices/worktrees/listing/detected-worktree-meta'
import { useNativeChatTabOwnerWorktreeId } from '../../native-chat/pane/ownership/use-native-chat-tab-owner'
import { usePaisajeActivo } from './paisaje-activo'
import { NativeChatEmptyState } from '../../native-chat/host-access/NativeChatEmptyState'
import { NativeChatEmptyPane } from '../../native-chat/host-access/NativeChatEmptyPane'
import type { AgentType } from '../../../../../shared/agent-status/contracts/agent-status-types'

/**
 * El chat vacío sobre la pintura (la primera referencia de `docs/reforma/chat-con-paisaje.md`):
 * una sola pregunta, alineada con el borde izquierdo del compositor que va justo abajo. Nada más.
 *
 * La pregunta sola; el compositor, la carpeta y la rama son los del chat de siempre, que
 * `paisaje.css` sube al medio de la pantalla. La marca `data-dolphin-chat-vacio` es lo que esa
 * hoja busca.
 */
export function PreguntaDelChatVacio({ proyecto }: { proyecto: string | null }): React.JSX.Element {
  return (
    <div data-dolphin-chat-vacio="" className="flex h-full w-full flex-col justify-end">
      <div className="mx-auto w-full max-w-(--chat-content-max-width) px-4 pb-1 sm:px-5">
        <h2 className="font-display text-[17px] leading-snug font-medium tracking-tight text-foreground">
          {proyecto
            ? translate(
                'auto.components.dolphin.paisaje.preguntaConProyecto',
                'What should we work on in {{value0}}?',
                {
                  value0: proyecto
                }
              )
            : translate('auto.components.dolphin.paisaje.pregunta', 'What should we work on?')}
        </h2>
      </div>
    </div>
  )
}

/** El nombre del proyecto del chat de esa pestaña, o null si la pestaña no es de un proyecto. */
export function useNombreDelProyecto(tabId: string): string | null {
  const worktreeId = useNativeChatTabOwnerWorktreeId(tabId)
  const repoId = useAppStore((s) =>
    worktreeId ? (findKnownWorktreeById(s, worktreeId)?.repoId ?? null) : null
  )
  const repos = useRepos()
  return repos.find((repo) => repo.id === repoId)?.displayName ?? null
}

/**
 * El vacío del chat de Dolphin: con pintura, la pregunta; sin pintura, el de la base (`base`).
 */
export function ChatVacioConPaisaje({
  tabId,
  base,
  soloBase = false
}: {
  tabId: string
  base: React.ReactNode
  /** Cuando el vacío de la base dice algo que hay que hacer (instalar el CLI), se queda ese. */
  soloBase?: boolean
}): React.JSX.Element {
  const proyecto = useNombreDelProyecto(tabId)
  const hayPaisaje = usePaisajeActivo((s) => s.activo)
  return hayPaisaje && !soloBase ? <PreguntaDelChatVacio proyecto={proyecto} /> : <>{base}</>
}

/** El vacío del chat sobre el CLI: el de la base es `NativeChatEmptyState`. */
export function VacioDelChatDeTerminal({
  tabId,
  agent
}: {
  tabId: string
  agent: AgentType
}): React.JSX.Element {
  return (
    <ChatVacioConPaisaje tabId={tabId} base={<NativeChatEmptyState kind="empty" agent={agent} />} />
  )
}

/** El vacío del chat estructurado: si lo que falta es instalar el CLI, se queda el de la base. */
export function VacioDelChatEstructurado({
  tabId,
  slot,
  agent
}: {
  tabId: string
  slot: React.ComponentProps<typeof NativeChatEmptyPane>['slot']
  agent: AgentType
}): React.JSX.Element {
  return (
    <ChatVacioConPaisaje
      tabId={tabId}
      base={<NativeChatEmptyPane slot={slot} agent={agent} />}
      soloBase={slot.kind === 'install'}
    />
  )
}
