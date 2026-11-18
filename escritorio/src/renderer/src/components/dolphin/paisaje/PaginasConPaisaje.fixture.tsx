import { useState, type ReactNode } from 'react'
import { defineFixture } from '../../../component-fixtures/component-fixture'
import { enCastellano } from '../../../component-fixtures/en-castellano'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { GlobalSettings } from '../../../../../shared/global-settings-types'
import type { GitHubWorkItem } from '../../../../../shared/github/work-item-types'
import { FondoDelChatSection } from '../../settings/FondoDelChatSection'
import { SettingsHeader } from '../../settings/navigation/SettingsHeader'
import { AutomationDetail } from '../../automations/details/AutomationDetail'
import { makeAutomation, makeRun, makeRunUsage } from '../../automations/automations-page-fixtures'
import GitHubItemDialog from '../../GitHubItemDialog'
import { EscenaConPaisaje, esperarEscena } from './escena-con-paisaje'
import { MARCA_DE_PAGINA } from './marca-de-pagina'

/**
 * Las páginas que no son un espacio de trabajo, sobre el óleo y con la marca que les pone
 * `AppWorkspaceShell` (`MARCA_DE_PAGINA`). El contenido es el de verdad: la sección «Fondo del
 * chat» de Ajustes, el detalle de una automatización y el de un issue de GitHub.
 * `pnpm fixtures:shot "dolphin/paisaje/PaginasConPaisaje:*" --theme both`.
 */

const NOOP = (): void => undefined

function Pagina({ opaco, children }: { opaco: boolean; children: ReactNode }): React.JSX.Element {
  return (
    <TooltipProvider>
      <EscenaConPaisaje alto={720} opaco={opaco}>
        <div className="titlebar px-3 text-[13px] text-foreground">Dolphin</div>
        <div className="flex min-h-0 flex-1">
          <aside data-dolphin-panel="lateral" className="w-52 shrink-0 bg-worktree-sidebar p-3">
            <p className="text-sm font-medium text-foreground">tienda-web</p>
          </aside>
          <div {...MARCA_DE_PAGINA} className="flex min-h-0 min-w-0 flex-1 flex-col">
            {children}
          </div>
        </div>
      </EscenaConPaisaje>
    </TooltipProvider>
  )
}

const SECCIONES = ['General', 'Apariencia', 'Chat', 'Terminal', 'Atajos']

function Ajustes(): React.JSX.Element {
  const [ajustes, setAjustes] = useState<Partial<GlobalSettings>>({})
  return (
    <div className="settings-view-shell flex min-h-0 flex-1 overflow-hidden bg-background">
      <nav className="flex w-[220px] shrink-0 flex-col gap-0.5 border-r border-worktree-sidebar-border bg-worktree-sidebar px-3 py-4">
        {SECCIONES.map((seccion) => (
          <span
            key={seccion}
            className={
              seccion === 'Apariencia'
                ? 'rounded-lg bg-worktree-sidebar-accent px-2.5 py-2 text-[13px] font-medium text-worktree-sidebar-accent-foreground'
                : 'rounded-lg px-2.5 py-2 text-[13px] text-worktree-sidebar-foreground/60'
            }
          >
            {seccion}
          </span>
        ))}
      </nav>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <SettingsHeader title="Apariencia" onGeneral={NOOP} onClose={NOOP} />
        <div className="min-h-0 flex-1 overflow-y-auto px-8 pt-6 scrollbar-sleek">
          <FondoDelChatSection
            // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: la sección sólo lee `fondoDelChat` y cae a lo de fábrica sin él.
            settings={ajustes as GlobalSettings}
            updateSettings={(cambios) => setAjustes((antes) => ({ ...antes, ...cambios }))}
            forceVisiblePrimary
          />
        </div>
      </div>
    </div>
  )
}

const AHORA = Date.UTC(2026, 10, 9, 15, 0)
const HORA = 60 * 60 * 1000

const PROMPT = [
  'Mirá los issues y PRs con la etiqueta i18n.',
  '',
  'Para cada uno:',
  '1. Fijate si faltan las cadenas.',
  '2. Si es sólo traducir, abrí un PR con las claves que faltan.',
  '3. Si no, dejá un comentario corto con lo que falta.',
  '',
  'No cierres issues y no toques lo que tiene una persona asignada.',
  'Al final, dejá en la salida de la corrida un resumen de lo que cambiaste y de lo que quedó.'
].join('\n')

// Una automatización con dos corridas, como la de `AutomationDetail.fixture` (healthy).
function Automatizacion(): React.JSX.Element {
  const automatizacion = makeAutomation({
    name: 'Revisar los issues de i18n',
    prompt: PROMPT,
    rrule: 'FREQ=DAILY;BYHOUR=9;BYMINUTE=0',
    nextRunAt: AHORA + 18 * HORA,
    lastRunAt: AHORA - 6 * HORA
  })
  const corridas = [6, 30].map((horas, indice) =>
    makeRun({
      id: `corrida-${indice}`,
      createdAt: AHORA - horas * HORA,
      dispatchedAt: AHORA - horas * HORA,
      usage: makeRunUsage({ totalTokens: 120_000, estimatedCostUsd: 0.9 })
    })
  )
  return (
    <div className="bg-background p-5 text-foreground">
      <AutomationDetail
        automation={automatizacion}
        runs={corridas}
        projectName="tienda-web"
        workspaceName="tienda-web"
        projectDefaultBaseRef="main"
        runNowAvailability={{ canRunNow: true, reason: 'available', message: null }}
        now={AHORA}
        onRunNow={NOOP}
        onEdit={NOOP}
        onToggle={NOOP}
        onDelete={NOOP}
      />
    </div>
  )
}

const ISSUE: GitHubWorkItem = {
  id: 'issue-214',
  type: 'issue',
  number: 214,
  title: 'El QR de la entrada no se lee con poca luz',
  state: 'open',
  url: 'https://github.com/ana-dev/boleteria/issues/214',
  labels: ['bug'],
  updatedAt: '2026-11-17T12:00:00Z',
  author: 'ana-dev',
  assignees: [{ login: 'ana-dev', name: 'Ana', avatarUrl: '' }],
  repoId: 'boleteria'
}

const CUERPO =
  'En la puerta del teatro, con la luz baja, el lector tarda o no lee el QR.\n\n' +
  '- Pasa con el brillo de la pantalla al mínimo.\n- En el celular de la boletería lee bien.'

// El detalle lo trae `window.api.gh.workItemDetails`: acá contesta un issue con un comentario.
function conElIssue(): void {
  const gh = window.api.gh as unknown as Record<string, unknown>
  gh.workItemDetails = async () => ({
    item: ISSUE,
    body: CUERPO,
    comments: [
      {
        id: 1,
        author: 'leo-dev',
        authorAvatarUrl: '',
        body: 'Probé subirle el contraste al QR y con eso lee al toque.',
        createdAt: '2026-11-16T18:30:00Z',
        url: `${ISSUE.url}#issuecomment-1`
      }
    ]
  })
}

function DetalleDelIssue(): React.JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col px-5 pt-1.5 pb-4 md:px-8">
      <GitHubItemDialog
        workItem={ISSUE}
        repoPath="/home/ana-dev/boleteria"
        repoId="boleteria"
        backLabel="Lista de GitHub"
        onUse={NOOP}
        onClose={NOOP}
      />
    </div>
  )
}

const ancho = 1280
const variante = (render: () => ReactNode, setup?: () => void) => ({
  vidrio: defineFixture(
    enCastellano({
      width: ancho,
      setup,
      interact: esperarEscena,
      render: () => <Pagina opaco={false}>{render()}</Pagina>
    })
  ),
  opaco: defineFixture(
    enCastellano({
      width: ancho,
      setup,
      interact: esperarEscena,
      render: () => <Pagina opaco>{render()}</Pagina>
    })
  )
})

const ajustes = variante(() => <Ajustes />)
const automatizacion = variante(() => <Automatizacion />)
const issue = variante(() => <DetalleDelIssue />, conElIssue)

export const ajustesSobreElVidrio = ajustes.vidrio
export const ajustesOpacos = ajustes.opaco
export const automatizacionSobreElVidrio = automatizacion.vidrio
export const automatizacionOpaca = automatizacion.opaco
export const issueSobreElVidrio = issue.vidrio
export const issueOpaco = issue.opaco
