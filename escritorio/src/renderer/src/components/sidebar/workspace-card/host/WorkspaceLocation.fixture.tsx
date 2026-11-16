import { getDefaultSettings } from '../../../../../../shared/constants'
import { toSshExecutionHostId } from '../../../../../../shared/execution-host'
import type { Repo } from '../../../../../../shared/repo-types'
import type { SshConnectionState } from '../../../../../../shared/ssh-types'
import type { Tab } from '../../../../../../shared/tab-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import type { AgentStatusEntry } from '../../../../../../shared/agent-status/contracts/agent-status-types'
import { structuredAgentSessionPaneKey } from '../../../../../../shared/agent-session/view/structured-agent-session-projection'
import { defineFixture } from '../../../../component-fixtures/component-fixture'
import WorktreeCard from '../surface/WorktreeCard'

/**
 * La barra con la tienda de ejemplo: «develop» en la compu de Ana y cinco espacios en su VPS.
 * `pnpm fixtures:shot "sidebar/workspace-card/host/WorkspaceLocation:*" --theme both`.
 */
const VPS = 'vps-ana'

const enLaCompu: Repo = {
  id: 'tienda-local',
  path: '/home/ana-dev/tienda-web',
  displayName: 'tienda-web',
  badgeColor: '',
  addedAt: 1
}
const enLaVps: Repo = {
  ...enLaCompu,
  id: 'tienda-vps',
  path: '/srv/tienda-web',
  connectionId: VPS,
  executionHostId: toSshExecutionHostId(VPS)
}

function espacio(repo: Repo, id: string, branch: string): Worktree {
  return {
    id,
    displayName: branch,
    repoId: repo.id,
    path: `${repo.path}/${id}`,
    branch: `refs/heads/${branch}`,
    head: 'abc123',
    isBare: false,
    isMainWorktree: false,
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 1
  }
}

const local = [espacio(enLaCompu, 'develop', 'develop')]
const remotos = [
  espacio(enLaVps, 'precio-safari', 'fix/precio-safari'),
  espacio(enLaVps, 'checkout-mp', 'checkout-mercadopago'),
  espacio(enLaVps, 'carrito', 'carrito-compartido'),
  espacio(enLaVps, 'catalogo', 'catalogo-imagenes'),
  espacio(enLaVps, 'envios', 'envios-gratis')
]

// develop y el checkout tienen a Claude trabajando; el carrito espera una respuesta.
const agentes: [Worktree, AgentStatusEntry['state']][] = [
  [local[0], 'working'],
  [remotos[1], 'working'],
  [remotos[2], 'waiting'],
  [remotos[0], 'done']
]
const tabs: Tab[] = agentes.map(([worktree], index) => ({
  id: `chat-${worktree.id}`,
  entityId: `22222222-2222-4222-8222-22222222222${index}`,
  contentType: 'agent-session',
  agentSessionAgent: 'claude',
  worktreeId: worktree.id,
  groupId: 'preview',
  executionHostId: worktree.repoId === enLaVps.id ? toSshExecutionHostId(VPS) : 'local',
  label: 'Chat',
  customLabel: null,
  color: null,
  sortOrder: index,
  createdAt: Date.now()
}))
const entries: AgentStatusEntry[] = tabs.map((tab, index) => ({
  paneKey: structuredAgentSessionPaneKey(tab.id, tab.entityId),
  worktreeId: tab.worktreeId,
  agentType: 'claude',
  prompt: '',
  state: agentes[index][1],
  updatedAt: Date.now(),
  stateStartedAt: Date.now(),
  stateHistory: []
}))
const conectada: SshConnectionState = {
  targetId: VPS,
  status: 'connected',
  error: null,
  reconnectAttempt: 0
}

function storeCon(nuevo: boolean, espacios: Worktree[]) {
  return {
    settings: {
      ...getDefaultSettings('/home/ana-dev'),
      experimentalNewWorktreeCardStyle: nuevo
    },
    repos: [enLaCompu, enLaVps],
    worktreesByRepo: {
      [enLaCompu.id]: espacios.filter((w) => w.repoId === enLaCompu.id),
      [enLaVps.id]: espacios.filter((w) => w.repoId === enLaVps.id)
    },
    sshConnectionStates: new Map([[VPS, conectada]]),
    sshTargetLabels: new Map([[VPS, VPS]]),
    unifiedTabsByWorktree: Object.fromEntries(tabs.map((tab) => [tab.worktreeId, [tab]])),
    agentStatusByPaneKey: Object.fromEntries(entries.map((entry) => [entry.paneKey, entry])),
    agentStatusEpoch: 1
  }
}

function Barra({ espacios }: { espacios: Worktree[] }) {
  return (
    <div className="flex flex-col gap-1 bg-worktree-sidebar p-2 text-worktree-sidebar-foreground">
      {espacios.map((worktree) => (
        <WorktreeCard
          key={worktree.id}
          worktree={worktree}
          repo={worktree.repoId === enLaVps.id ? enLaVps : enLaCompu}
          isActive={worktree.id === 'develop'}
          nativeDragEnabled={false}
          hideRepoBadge
        />
      ))}
    </div>
  )
}

const mezclados = [...local, ...remotos]

/** Las tarjetas nuevas, como las ve Nico: laptop para develop, nube para la VPS. */
export const mezcladosNuevas = defineFixture({
  width: 300,
  store: storeCon(true, mezclados),
  render: () => <Barra espacios={mezclados} />
})

/** Las tarjetas clásicas, con la línea de la rama debajo del título. */
export const mezcladosClasicas = defineFixture({
  width: 300,
  store: storeCon(false, mezclados),
  render: () => <Barra espacios={mezclados} />
})
