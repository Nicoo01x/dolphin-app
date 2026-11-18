import { useState } from 'react'
import { defineFixture } from '../../component-fixtures/component-fixture'
import { enCastellano } from '../../component-fixtures/en-castellano'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { Repo } from '../../../../shared/repo-types'
import type { GitHubWorkItem } from '../../../../shared/github/work-item-types'
import { parseTaskQuery } from '../../../../shared/work-items/task-query'
import { EscenaConPaisaje, esperarEscena } from '../dolphin/paisaje/escena-con-paisaje'
import { MARCA_DE_PAGINA } from '../dolphin/paisaje/marca-de-pagina'
import { getTaskSourceContextSummary } from '../task-source-context-summary'
import { getGitHubModeButtons, getSourceOptions } from './task-page-localized-options'
import { GITHUB_TASK_GRID_CLASS } from './task-page-source-context'
import { TaskPageSurface } from './Surface'
import type { TaskPageComposerActionsModel } from './use-task-page-composer-actions'

/**
 * La página de GitHub (Issues · PRs · Proyectos) sobre el óleo, con la barra lateral al lado para
 * comparar el vidrio. `pnpm fixtures:shot "task-page/TareasConPaisaje:*" --theme both`.
 */

const BUSQUEDA = 'is:issue is:open'
const HACE = (horas: number): string => new Date(Date.now() - horas * 3_600_000).toISOString()

// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: el selector y la fila sólo leen el id, el nombre y el color del proyecto.
const BOLETERIA = { id: 'boleteria', displayName: 'boleteria', badgeColor: '#a3a3a3' } as Repo
// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: ídem.
const WEB = { id: 'web', displayName: 'tienda-web', badgeColor: '#737373' } as Repo

const TITULOS = [
  'El QR de la entrada no se lee con poca luz',
  'Reintentar el cobro cuando Mercado Pago devuelve 502',
  'Exportar la lista de asistentes a CSV',
  'La fecha del evento sale en UTC en el correo',
  'Agregar el código de descuento en el checkout',
  'El mapa de ubicaciones tarda en cargar en el celular',
  'Avisar por correo cuando se agota una función'
]

const ISSUES: GitHubWorkItem[] = TITULOS.map((title, indice) => ({
  id: `issue-${indice}`,
  type: 'issue',
  number: 214 - indice * 3,
  title,
  state: 'open',
  url: `https://github.com/ana-dev/boleteria/issues/${214 - indice * 3}`,
  labels: indice % 3 === 0 ? ['bug'] : [],
  updatedAt: HACE(indice * 5 + 1),
  author: 'ana-dev',
  assignees:
    indice % 2 === 0 ? [{ login: 'ana-dev', name: 'Ana', avatarUrl: '' }] : ([] as never[]),
  repoId: BOLETERIA.id
}))

const NOOP = (): undefined => undefined

function modelo(): TaskPageComposerActionsModel {
  const sourceOptions = getSourceOptions()
  const campos: Record<string, unknown> = {
    visibleSourceOptions: sourceOptions,
    taskSource: 'github',
    taskSourceAvailabilityNoticeByProvider: {},
    taskSourceContextSummary: getTaskSourceContextSummary({
      provider: 'github',
      providerLabel: 'GitHub',
      repoContexts: [],
      repoIdentities: [{ provider: 'github', owner: 'ana-dev', repo: 'boleteria' }],
      selectedRepoCount: 1
    }),
    githubMode: 'items',
    githubModeButtons: getGitHubModeButtons(),
    projectModeVisible: true,
    activeGithubTaskKind: 'issues',
    repoSelection: new Set([BOLETERIA.id]),
    eligibleRepos: [BOLETERIA, WEB],
    taskPickerRepos: [BOLETERIA, WEB],
    taskPickerGroups: [
      { projectKey: BOLETERIA.id, repo: BOLETERIA, sources: [BOLETERIA] },
      { projectKey: WEB.id, repo: WEB, sources: [WEB] }
    ],
    selectedGitHubRepoExternalLink: null,
    repos: [BOLETERIA, WEB],
    allWorktrees: [],
    selectedRepos: [BOLETERIA],
    taskSearchInput: BUSQUEDA,
    appliedTaskSearch: BUSQUEDA,
    appliedTaskQuery: parseTaskQuery(BUSQUEDA),
    perRepoSourceState: [],
    githubSourceDisplayState: [],
    unresolvedSourceRepos: [],
    retryingSourceKeys: new Set(),
    loadedGitHubAuthorLogins: [],
    primaryGithubFilterSlug: null,
    githubTasksBusy: false,
    filteredWorkItems: ISSUES,
    softHiddenVisibleCount: 0,
    showGitHubTaskSkeletons: false,
    showPRManagementColumns: false,
    githubTaskGridClass: GITHUB_TASK_GRID_CLASS,
    githubEmptyState: { title: '', description: '' },
    githubListPending: false,
    tasksError: null,
    failedCount: 0,
    githubUnavailable: false,
    pages: [ISSUES, null, null],
    currentPage: 0,
    totalPages: 3,
    loadingTargetPage: null,
    githubWorkItemMutation: { isIntentPending: () => false, run: NOOP },
    dialogWorkItem: null,
    gitlabDialogItem: null,
    newIssueOpen: false,
    availableJiraIssueTypes: [],
    availableTeams: [],
    filteredNewJiraIssueProjects: [],
    jiraSites: [],
    sortedAvailableJiraProjects: [],
    visibleJiraCreateFields: [],
    newIssueRepoLabels: { data: [], loading: false, error: null },
    newIssueRepoAssignees: { data: [], loading: false, error: null },
    linearConnected: false,
    jiraConnected: false
  }
  // Lo que no está arriba son acciones y refs que una captura quieta nunca dispara. Se guardan al
  // pedirlas: un ref o una función nuevos en cada lectura harían correr los efectos sin fin.
  const modeloFalso = new Proxy(campos, {
    get: (objetivo, clave) => {
      if (typeof clave === 'string' && !(clave in objetivo)) {
        objetivo[clave] = clave.endsWith('Ref')
          ? { current: null }
          : /^(set|handle|open|close|ensure|apply|get|update|on)[A-Z]/.test(clave)
            ? NOOP
            : undefined
      }
      return Reflect.get(objetivo, clave)
    }
  })
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: ver el Proxy de arriba.
  return modeloFalso as unknown as TaskPageComposerActionsModel
}

function Pantalla({ opaco = false }: { opaco?: boolean }): React.JSX.Element {
  const [model] = useState(modelo)
  return (
    <TooltipProvider>
      <EscenaConPaisaje alto={640} opaco={opaco}>
        <div className="titlebar px-3 text-[13px] text-foreground">Tareas</div>
        <div className="flex min-h-0 flex-1">
          <aside data-dolphin-panel="lateral" className="w-56 shrink-0 bg-worktree-sidebar p-3">
            <p className="text-sm font-medium text-foreground">boleteria</p>
            <p className="mt-1 text-xs text-muted-foreground">main · hace 4 min</p>
          </aside>
          <div {...MARCA_DE_PAGINA} className="flex min-h-0 min-w-0 flex-1 flex-col">
            <TaskPageSurface model={model} />
          </div>
        </div>
      </EscenaConPaisaje>
    </TooltipProvider>
  )
}

export const issues = defineFixture(
  enCastellano({ width: 1280, interact: esperarEscena, render: () => <Pantalla /> })
)
/** «Paneles opacos»: la página tapa la pintura entera, como el resto. */
export const panelesOpacos = defineFixture(
  enCastellano({ width: 1280, interact: esperarEscena, render: () => <Pantalla opaco /> })
)
