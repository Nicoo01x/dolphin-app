import { useState } from 'react'
import { ChevronDown, GitBranch, Laptop, Plug } from 'lucide-react'
import type { RefObject } from 'react'
import { Progress } from '@/components/ui/progress'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'
import type { CommentMarkdownLinkClickHandler } from '@/components/sidebar/CommentMarkdown'
import { StudioPorton } from '../dolphin/studio/StudioPorton'
import { LineaDeTiempoCard } from '../dolphin/chat/LineaDeTiempoCard'
import { ChangesCard } from './NativeChatSessionSidePanelChanges'
import {
  formatContextTokenCount,
  type NativeChatContextUsageSummary
} from '../../../../shared/native-chat/native-chat-context-usage-summary'
import {
  buildNativeChatSessionSidePanelModel,
  type NativeChatSessionSidePanelInput,
  type NativeChatSessionSidePanelModel
} from './native-chat-session-side-panel-model'

type PanelCardId = 'environment' | 'connectors' | 'timeline' | 'changes' | 'porton' | 'context'

type NativeChatSessionSidePanelProps = {
  data: NativeChatSessionSidePanelModel
  onCreatePullRequest?: () => void
  onViewPullRequest?: () => void
  onOpenFile?: (path: string) => void
  onOpenSessionFile?: CommentMarkdownLinkClickHandler
  rootRef?: RefObject<HTMLElement | null>
  pullRequestActions?: React.ReactNode
}

/**
 * El nombre de una sección es un RÓTULO, no un título.
 *
 * Estaba en `font-semibold text-chat-foreground-strong`: las seis cabeceras eran lo más brillante
 * de la columna y competían entre ellas, mientras el único dato de verdad —«hola · 11:26»— salía
 * más chico y más apagado que el nombre de su propia sección. Acá el rótulo se corre al fondo y lo
 * que se lee es el contenido.
 */
function CardHeader({
  id,
  title,
  expanded,
  onToggle
}: {
  id: PanelCardId
  title: string
  expanded: boolean
  onToggle: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      className="native-chat-session-side-panel-card-title flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-2xs font-medium text-chat-foreground-faint transition-colors hover:bg-foreground/[0.035] hover:text-chat-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-controls={`native-chat-session-side-panel-${id}`}
      aria-expanded={expanded}
      onClick={onToggle}
    >
      <span>{title}</span>
      <ChevronDown
        aria-hidden="true"
        className={cn(
          'size-3 shrink-0 opacity-0 transition-[transform,opacity] group-hover/seccion:opacity-100',
          expanded && 'rotate-180'
        )}
      />
    </button>
  )
}

/**
 * Una sección sin nada: una sola fila, no una tarjeta con un cartel adentro.
 *
 * El panel tenía seis cajas y cuatro decían «Sin entorno», «Sin conectores», «Sin cambios»: dos
 * tercios de la columna ocupados en avisar que no hay nada, con tres redacciones distintas para lo
 * mismo. Una fila con el rótulo y un guión dice lo mismo en una línea, y deja la columna para lo
 * que sí pasó.
 */
function SeccionVacia({ title }: { title: string }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 px-2 py-1.5 text-2xs text-chat-foreground-faint">
      <span>{title}</span>
      <span aria-hidden="true">—</span>
    </div>
  )
}

function SkeletonLine({ className }: { className?: string }): React.JSX.Element {
  return (
    <span className={cn('block h-3 animate-pulse rounded-full bg-foreground/[0.08]', className)} />
  )
}

function EmptyState({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <p className="px-3 pb-3 text-xs text-chat-foreground-faint">{children}</p>
}

/**
 * Una sección del panel. Sin caja.
 *
 * Tuvo fondo, radio 16 y sombra, y el resultado eran seis tarjetas idénticas apiladas: mismo
 * radio, mismo fondo, misma cabecera, mismo chevron, ninguna jerarquía. Seis cajas iguales no
 * ordenan nada; sólo repiten un marco seis veces.
 *
 * Ahora la columna entera es la superficie y las secciones se separan por espacio, que es lo que
 * hacen las dos referencias medidas: Linear pone borde en el 4,5 % de sus elementos y Perplexity
 * en el 1,4 %; el resto lo resuelven con tono y aire.
 *
 * `vacia` es lo que evita el otro problema: una sección sin contenido no dibuja una caja con un
 * cartel adentro, se encoge a una fila.
 */
function PanelCard({
  id,
  title,
  expanded,
  onToggle,
  vacia = false,
  children
}: {
  id: PanelCardId
  title: string
  expanded: boolean
  onToggle: () => void
  vacia?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  if (vacia) {
    return (
      <section data-testid={`session-side-panel-${id}`}>
        <SeccionVacia title={title} />
      </section>
    )
  }
  return (
    <section className="group/seccion" data-testid={`session-side-panel-${id}`}>
      <CardHeader id={id} title={title} expanded={expanded} onToggle={onToggle} />
      <div id={`native-chat-session-side-panel-${id}`} hidden={!expanded}>
        {children}
      </div>
    </section>
  )
}

function EnvironmentCard({
  model
}: {
  model: NativeChatSessionSidePanelModel['environment']
}): React.JSX.Element {
  if (model.status === 'empty') {
    return (
      <EmptyState>
        {translate('components.nativeChat.sessionSidePanel.noEnvironment', 'No environment')}
      </EmptyState>
    )
  }
  return (
    <div className="space-y-2 px-3 pb-3 text-xs">
      <div className="flex items-center gap-2 text-chat-foreground-strong">
        <Laptop aria-hidden="true" className="size-3.5 shrink-0 text-chat-foreground-faint" />
        <span className="truncate">
          {model.host ??
            translate('components.nativeChat.sessionSidePanel.thisComputer', 'This computer')}
        </span>
      </div>
      {model.repoName ? (
        <div className="min-w-0 rounded-xl bg-foreground/[0.04] px-2.5 py-2">
          <div className="truncate font-medium text-chat-foreground-strong">{model.repoName}</div>
          <div className="truncate font-mono text-2xs text-chat-foreground-faint">
            {model.repoPath}
          </div>
        </div>
      ) : (
        <p className="text-chat-foreground-faint">
          {translate('components.nativeChat.sessionSidePanel.noGit', 'No git')}
        </p>
      )}
      {model.branch ? (
        <div className="flex min-w-0 items-center gap-2 text-chat-foreground-faint">
          <GitBranch aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="truncate">{model.branch}</span>
        </div>
      ) : null}
    </div>
  )
}

function ConnectorsCard({
  model
}: {
  model: NativeChatSessionSidePanelModel['connectors']
}): React.JSX.Element {
  if (model.status === 'loading') {
    return (
      <div className="space-y-2 px-3 pb-3">
        <SkeletonLine className="w-28" />
        <SkeletonLine className="w-44" />
      </div>
    )
  }
  if (model.status === 'error') {
    return (
      <EmptyState>
        {translate(
          'components.nativeChat.sessionSidePanel.connectorsError',
          'Connectors could not be loaded'
        )}
      </EmptyState>
    )
  }
  if (model.names.length === 0) {
    return (
      <EmptyState>
        {translate('components.nativeChat.sessionSidePanel.noConnectors', 'No connectors')}
      </EmptyState>
    )
  }
  return (
    <div className="space-y-2 px-3 pb-3 text-xs">
      <div className="flex items-center gap-2 text-chat-foreground-strong">
        <Plug aria-hidden="true" className="size-3.5 text-chat-foreground-faint" />
        <span>
          {translate('components.nativeChat.sessionSidePanel.connected', '{{count}} connected', {
            count: model.names.length
          })}
        </span>
      </div>
      <ul className="space-y-1 rounded-xl bg-foreground/[0.04] p-2">
        {model.names.map((name) => (
          <li key={name} className="truncate text-chat-foreground-faint">
            {name}
          </li>
        ))}
      </ul>
    </div>
  )
}

function PortonCard({
  model
}: {
  model: NativeChatSessionSidePanelModel['porton']
}): React.JSX.Element {
  return (
    <StudioPorton
      repoPath={model.repoPath}
      isVisible
      revision={model.revision}
      autoReview={{
        enabled: model.crossReviewOnAgentStop,
        agentWorking: model.agentWorking,
        hasChanges: model.hasChanges
      }}
    />
  )
}

function ContextCard({
  model
}: {
  model: NativeChatSessionSidePanelModel['context']
}): React.JSX.Element {
  if (model.status === 'empty') {
    return (
      <EmptyState>
        {translate(
          'components.nativeChat.sessionSidePanel.contextUnavailable',
          'Context unavailable'
        )}
      </EmptyState>
    )
  }
  const label = translate(
    'components.nativeChat.sessionSidePanel.contextUsed',
    '{{percent}}% used',
    { percent: model.percentage }
  )
  return (
    <div className="space-y-2 px-3 pb-3">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="tabular-nums text-chat-foreground-strong">{model.percentage}%</span>
        <span className="tabular-nums text-chat-foreground-faint">
          {translate(
            'components.nativeChat.sessionSidePanel.contextTokens',
            '{{used}} of {{window}}',
            {
              used: formatContextTokenCount(model.usedTokens),
              window: formatContextTokenCount(model.windowTokens)
            }
          )}
        </span>
      </div>
      <Progress
        value={Math.min(Math.max(model.percentage, 0), 100)}
        aria-label={label}
        className="h-1.5 bg-foreground/[0.1]"
      />
    </div>
  )
}

export function NativeChatSessionSidePanel({
  data,
  onCreatePullRequest,
  onViewPullRequest,
  onOpenFile,
  onOpenSessionFile,
  rootRef,
  pullRequestActions
}: NativeChatSessionSidePanelProps): React.JSX.Element {
  const [expanded, setExpanded] = useState<Record<PanelCardId, boolean>>({
    environment: true,
    connectors: true,
    timeline: true,
    changes: true,
    porton: true,
    context: true
  })
  const toggle = (id: PanelCardId): void =>
    setExpanded((current) => ({ ...current, [id]: !current[id] }))
  return (
    <aside
      ref={rootRef}
      className="w-72 shrink-0 overflow-y-auto bg-foreground/[0.018] px-2.5 py-3 scrollbar-sleek"
      aria-label={translate('components.nativeChat.sessionSidePanel.label', 'Session panel')}
    >
      {/* `space-y-1` y no 2: sin la caja de cada sección, lo que separa es el aire, y el rótulo
          ya trae su propio padding. Con el espaciado de antes las secciones quedaban flotando. */}
      <div className="space-y-1">
        <PanelCard
          id="environment"
          title={translate('components.nativeChat.sessionSidePanel.environment', 'Environment')}
          expanded={expanded.environment}
          onToggle={() => toggle('environment')}
          vacia={data.environment.status === 'empty'}
        >
          <EnvironmentCard model={data.environment} />
        </PanelCard>
        <PanelCard
          id="connectors"
          title={translate('components.nativeChat.sessionSidePanel.connectors', 'Connectors')}
          expanded={expanded.connectors}
          onToggle={() => toggle('connectors')}
          vacia={data.connectors.status === 'ready' && data.connectors.names.length === 0}
        >
          <ConnectorsCard model={data.connectors} />
        </PanelCard>
        {/* Antes de Cambios: Cambios dice en qué quedó el repo, y esto cómo se llegó hasta ahí. */}
        <PanelCard
          id="timeline"
          title={translate(
            'components.dolphin.chat.lineaDeTiempo.titulo',
            'What happened along the way'
          )}
          expanded={expanded.timeline}
          onToggle={() => toggle('timeline')}
        >
          <LineaDeTiempoCard model={data.timeline} />
        </PanelCard>
        <PanelCard
          id="changes"
          title={translate('components.nativeChat.sessionSidePanel.changes', 'Changes')}
          expanded={expanded.changes}
          onToggle={() => toggle('changes')}
          // Sin archivos tocados por nadie Y sin PR que mostrar: ahí no hay nada que abrir.
          vacia={
            data.changes.status === 'empty' &&
            data.changes.files.length === 0 &&
            data.changes.agentFiles.length === 0 &&
            data.changes.pullRequest === 'none'
          }
        >
          <ChangesCard
            model={data.changes}
            onCreatePullRequest={onCreatePullRequest}
            onViewPullRequest={onViewPullRequest}
            onOpenFile={onOpenFile}
            onOpenSessionFile={onOpenSessionFile}
            pullRequestActions={pullRequestActions}
          />
        </PanelCard>
        <PanelCard
          id="porton"
          title={translate('components.nativeChat.sessionSidePanel.porton', 'Gate')}
          expanded={expanded.porton}
          onToggle={() => toggle('porton')}
        >
          <PortonCard model={data.porton} />
        </PanelCard>
        <PanelCard
          id="context"
          title={translate('components.nativeChat.sessionSidePanel.context', 'Context')}
          expanded={expanded.context}
          onToggle={() => toggle('context')}
        >
          <ContextCard model={data.context} />
        </PanelCard>
      </div>
    </aside>
  )
}

export function NativeChatSessionSidePanelFromInput({
  input,
  onCreatePullRequest,
  onViewPullRequest,
  onOpenFile,
  onOpenSessionFile,
  pullRequestActions
}: {
  input: NativeChatSessionSidePanelInput
  onCreatePullRequest?: () => void
  onViewPullRequest?: () => void
  onOpenFile?: (path: string) => void
  onOpenSessionFile?: CommentMarkdownLinkClickHandler
  pullRequestActions?: React.ReactNode
}): React.JSX.Element {
  return (
    <NativeChatSessionSidePanel
      data={buildNativeChatSessionSidePanelModel(input)}
      onCreatePullRequest={onCreatePullRequest}
      onViewPullRequest={onViewPullRequest}
      onOpenFile={onOpenFile}
      onOpenSessionFile={onOpenSessionFile}
      pullRequestActions={pullRequestActions}
    />
  )
}

export type { NativeChatContextUsageSummary }
