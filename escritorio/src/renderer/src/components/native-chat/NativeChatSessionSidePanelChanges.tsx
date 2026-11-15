import type { CommentMarkdownLinkClickHandler } from '@/components/sidebar/CommentMarkdown'
import { translate } from '@/i18n/i18n'
import { uiNumberFormat } from '@/i18n/ui-intl-formatters'
import { cn } from '@/lib/class-names'
import { NativeChatSessionPullRequestStatus } from './NativeChatSessionPullRequestStatus'
import type {
  NativeChatSessionSidePanelAgentFile,
  NativeChatSessionSidePanelFile,
  NativeChatSessionSidePanelModel
} from './native-chat-session-side-panel-model'

// Constante de módulo porque los formateadores de la UI se cachean por identidad de las opciones.
const CUENTA_DE_LINEAS: Intl.NumberFormatOptions = {}

/** Las líneas sumadas o sacadas, con los separadores del idioma de la app y no los del sistema. */
function lineas(cuantas: number): string {
  return uiNumberFormat(CUENTA_DE_LINEAS).format(cuantas)
}

function SkeletonLine({ className }: { className?: string }): React.JSX.Element {
  return (
    <span className={cn('block h-3 animate-pulse rounded-full bg-foreground/[0.08]', className)} />
  )
}

function EmptyState({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <p className="px-3 pb-3 text-xs text-chat-foreground-faint">{children}</p>
}

function ChangeFileRow({
  file,
  onOpen
}: {
  file: NativeChatSessionSidePanelFile
  onOpen?: (path: string) => void
}): React.JSX.Element {
  const { nombre, carpeta } = partirRuta(file.path)
  return (
    <button
      type="button"
      className="flex w-full items-baseline gap-2 rounded-xl px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      title={file.path}
      // La ruta entera, aunque en pantalla se parta en nombre y carpeta.
      aria-label={file.path}
      onClick={() => onOpen?.(file.path)}
    >
      <span className="min-w-0 flex-1 truncate">
        <span className="text-chat-foreground-strong">{nombre}</span>
        {carpeta ? (
          <span className="ml-1.5 inline-block max-w-[9rem] truncate align-bottom text-2xs text-chat-foreground-faint [direction:rtl]">
            {carpeta}
          </span>
        ) : null}
      </span>
      <span className="shrink-0 tabular-nums">
        <span className="text-[color:var(--git-decoration-added)]">+{lineas(file.added)}</span>{' '}
        <span className="text-[color:var(--git-decoration-deleted)]">−{lineas(file.removed)}</span>
      </span>
    </button>
  )
}

/**
 * El nombre del archivo y, aparte, la carpeta donde vive.
 *
 * Una ruta entera cortada con `truncate` se come el final, que es justo el nombre: diez filas que
 * decían «D:\Proyectos\Dolphi…» y nada más. Ahora el nombre va entero y la
 * carpeta se corta por la izquierda, que es la parte que se puede perder.
 */
export function partirRuta(path: string): { nombre: string; carpeta: string } {
  const corte = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return corte < 0
    ? { nombre: path, carpeta: '' }
    : { nombre: path.slice(corte + 1), carpeta: path.slice(0, corte) }
}

function AgentFileRow({
  file,
  onOpen
}: {
  file: NativeChatSessionSidePanelAgentFile
  onOpen?: CommentMarkdownLinkClickHandler
}): React.JSX.Element {
  const { nombre, carpeta } = partirRuta(file.path)
  return (
    <button
      type="button"
      className="flex w-full items-baseline gap-2 rounded-xl px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      title={file.path}
      aria-label={file.path}
      onClick={(event) => onOpen?.(event, file.path)}
    >
      <span className="min-w-0 flex-1 truncate font-mono">
        <span className="text-chat-foreground-strong">{nombre}</span>
        {carpeta ? (
          // `direction: rtl` corta por la izquierda: de una carpeta importa el final, no «D:\Proyec…».
          <span className="ml-1.5 inline-block max-w-[9rem] truncate align-bottom text-2xs text-chat-foreground-faint [direction:rtl]">
            {carpeta}
          </span>
        ) : null}
      </span>
      <span className="shrink-0 text-chat-foreground-faint">
        {file.action === 'creado'
          ? translate('components.nativeChat.sessionSidePanel.agentFileCreated', 'created')
          : translate('components.nativeChat.sessionSidePanel.agentFileEdited', 'edited')}
      </span>
    </button>
  )
}

function AgentTouchedFiles({
  files,
  onOpen
}: {
  files: readonly NativeChatSessionSidePanelAgentFile[]
  onOpen?: CommentMarkdownLinkClickHandler
}): React.JSX.Element | null {
  if (files.length === 0) {
    return null
  }
  return (
    <div className="space-y-1.5">
      <p className="px-1 text-xs font-medium text-chat-foreground-strong">
        {translate(
          'components.nativeChat.sessionSidePanel.agentTouchedFiles',
          'What the agent touched'
        )}
      </p>
      <div className="space-y-0.5 rounded-xl bg-foreground/[0.04] p-1">
        {files.map((file) => (
          <AgentFileRow key={file.path} file={file} onOpen={onOpen} />
        ))}
      </div>
    </div>
  )
}

export function ChangesCard({
  model,
  onCreatePullRequest,
  onViewPullRequest,
  onOpenFile,
  onOpenSessionFile,
  pullRequestActions
}: {
  model: NativeChatSessionSidePanelModel['changes']
  onCreatePullRequest?: () => void
  onViewPullRequest?: () => void
  onOpenFile?: (path: string) => void
  onOpenSessionFile?: CommentMarkdownLinkClickHandler
  pullRequestActions?: React.ReactNode
}): React.JSX.Element {
  if (model.status === 'loading') {
    return (
      <div className="space-y-3 px-3 pb-3">
        <AgentTouchedFiles files={model.agentFiles} onOpen={onOpenSessionFile} />
        <SkeletonLine className="w-36" />
        <SkeletonLine className="w-full" />
      </div>
    )
  }
  if (model.status === 'error') {
    return (
      <div className="space-y-2">
        <AgentTouchedFiles files={model.agentFiles} onOpen={onOpenSessionFile} />
        <EmptyState>
          {translate(
            'components.nativeChat.sessionSidePanel.changesError',
            'Changes could not be loaded'
          )}
        </EmptyState>
      </div>
    )
  }
  if (model.status === 'empty') {
    // Con archivos tocados arriba, «Sin cambios» se leía como que se contradice: lo que no tiene
    // cambios es git, no el agente (lo que tocó puede estar ya commiteado o en otra carpeta).
    return (
      <div className="space-y-2">
        <AgentTouchedFiles files={model.agentFiles} onOpen={onOpenSessionFile} />
        <EmptyState>
          {model.agentFiles.length > 0
            ? translate(
                'components.nativeChat.sessionSidePanel.noGitChanges',
                'Git sees nothing uncommitted in this folder'
              )
            : translate('components.nativeChat.sessionSidePanel.noChanges', 'No changes')}
        </EmptyState>
      </div>
    )
  }
  return (
    <div className="space-y-2 px-3 pb-3">
      <AgentTouchedFiles files={model.agentFiles} onOpen={onOpenSessionFile} />
      <div className="flex items-center gap-2 text-xs tabular-nums">
        <span className="text-[color:var(--git-decoration-added)]">+{lineas(model.added)}</span>
        <span className="text-[color:var(--git-decoration-deleted)]">−{lineas(model.removed)}</span>
      </div>
      <div className="space-y-0.5 rounded-xl bg-foreground/[0.04] p-1">
        {model.files.map((file) => (
          <ChangeFileRow key={file.path} file={file} onOpen={onOpenFile} />
        ))}
      </div>
      {model.pullRequest === 'view' && model.pullRequestDetails ? (
        <NativeChatSessionPullRequestStatus details={model.pullRequestDetails} />
      ) : null}
      {pullRequestActions}
      {model.pullRequest !== 'none' ? (
        <button
          type="button"
          className="flex h-7 items-center gap-1.5 rounded-full bg-foreground/[0.08] px-3 text-xs font-medium text-chat-foreground-strong transition-colors hover:bg-foreground/[0.13] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={model.pullRequest === 'view' ? onViewPullRequest : onCreatePullRequest}
        >
          {model.pullRequest === 'view'
            ? translate('components.nativeChat.sessionSidePanel.viewPr', 'View PR')
            : translate('components.nativeChat.sessionSidePanel.createPr', 'Create PR')}
        </button>
      ) : null}
    </div>
  )
}
