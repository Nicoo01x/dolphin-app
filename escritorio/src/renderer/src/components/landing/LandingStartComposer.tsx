import React from 'react'
import { ArrowUp, FolderPlus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import { cn } from '@/lib/class-names'
import { translate } from '@/i18n/i18n'
import { useComposerState } from '@/hooks/useComposerState'
import { isScreenSubmitShortcut } from '@/lib/keyboard/screen-submit-shortcut'
import {
  AddRemoteHostDialog,
  type AddRemoteHostMode
} from '@/components/sidebar/host-admission/ssh/AddRemoteHostDialog'
import { connectRunTargetHost } from '@/components/new-workspace/connect-run-target-host'
import { useQuickWorkspaceAgent } from '@/components/new-workspace/use-quick-workspace-agent'
import { resolveVisibleQuickAgents } from '@/components/new-workspace/visible-quick-agents'
import { DEFAULT_DISABLED_TUI_AGENTS } from '../../../../shared/agent-launch/catalog/tui-agent-selection'
import { resolveStartGate, startGateIsWaiting } from './landing-start-gate'
import { StartPermissionPill } from './StartPermissionPill'
import { StartAgentPill, StartProjectPill, StartRunTargetPill } from './StartPills'

/** Lo que se siembra en el prompt desde afuera: de qué repo y qué texto. */
export type SiembraDelPrompt = { repoId: string; texto: string }

/**
 * The start composer: type what you want, pick where it runs, and an agent is working on it.
 *
 * This is the landing screen's main surface, and it exists because the first screen of Dolphin
 * used to offer two buttons into a form. Everything it needs was already in the app and
 * unreachable: creating a workspace has always been able to carry a first prompt to the agent
 * (`quickPrompt` + auto-submit), and the run target has always been able to be another machine.
 * What was missing was one place that asks for both at once.
 *
 * It is built as the chat composer and not as a form on purpose — same box, same ghost pills,
 * same round send button — because that is the shape this app already uses for "say what you
 * want and press send". The pills carry the launch parameters a chat only lets you change once
 * it is already running: the project, the machine, the agent, and what it may do without asking.
 *
 * Everything else about a new workspace (name, base branch, setup script, sparse checkout) has a
 * sane default and stays in the full composer: a first screen that asked for a branch name
 * before letting you type would be a form again.
 */
export function LandingStartComposer({
  siembra = null
}: {
  /**
   * Un pedido que viene de afuera (una tarjeta del tablero): se carga en el prompt con su proyecto
   * elegido y el foco va al texto. Nunca se envía solo: la persona lo revisa y manda. Cada toque
   * trae un objeto nuevo, así que tocar dos veces la misma tarjeta vuelve a cargarla.
   */
  siembra?: SiembraDelPrompt | null
} = {}): React.JSX.Element {
  const openModal = useAppStore((state) => state.openModal)
  const disabledTuiAgents = useAppStore(
    (state) => state.settings?.disabledTuiAgents ?? DEFAULT_DISABLED_TUI_AGENTS
  )
  const [addRemoteHostMode, setAddRemoteHostMode] = React.useState<AddRemoteHostMode | null>(null)

  // Why the shared draft: the full composer reads and writes the same one, so a prompt typed
  // here survives opening the create dialog instead of being retyped there.
  const {
    cardProps,
    submitQuick,
    selectAddedProjectRepo,
    createDisabled: formDisabled
  } = useComposerState({ initialPrompt: '', persistDraft: true })
  const agent = useQuickWorkspaceAgent({
    detectedAgentIds: cardProps.detectedAgentIds,
    agentRows: cardProps.agentRows,
    active: true
  })

  const promptRef = React.useRef<HTMLTextAreaElement | null>(null)
  React.useEffect(() => {
    if (!siembra) {
      return
    }
    // El proyecto primero y el texto después: cambiar de proyecto no debe pisar lo que se carga.
    selectAddedProjectRepo(siembra.repoId)
    cardProps.onAgentPromptChange(siembra.texto)
    const cuadro = promptRef.current
    // Un frame después, para que el valor ya esté puesto y el cursor caiga al final del texto.
    const frame = requestAnimationFrame(() => {
      cuadro?.focus()
      cuadro?.setSelectionRange(siembra.texto.length, siembra.texto.length)
    })
    return () => cancelAnimationFrame(frame)
    // Why sólo `siembra`: las funciones del composer cambian en cada render y recargarían el texto
    // pisando lo que la persona esté escribiendo.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [siembra])

  const prompt = cardProps.agentPrompt
  const gate = resolveStartGate({
    projectCount: cardProps.projectOptions.length,
    selectedProjectId: cardProps.selectedProjectId ?? null,
    prompt,
    creating: cardProps.creating,
    launchReady: agent.launchReady,
    formDisabled
  })
  const waiting = startGateIsWaiting(gate)
  const hint = startGateHint(gate, cardProps.projectError ?? null)
  const hasProjects = cardProps.projectOptions.length > 0

  // Why un ref y no `gate.creating`: `creating` llega por estado de React, así que en el MISMO
  // tick dos eventos lo ven todavía en false y arrancan dos veces. Medido: un solo «hola» dejó
  // dos `worktree.create` en el log y dos ramas abiertas, que desde afuera se ve como que la
  // pantalla «hace cualquier cosa». El ref se pone antes de llamar y recién se suelta cuando la
  // promesa termina, así un error tampoco deja la pantalla trabada para siempre.
  const lanzando = React.useRef(false)
  const start = React.useCallback((): void => {
    if (gate.kind !== 'ready' || lanzando.current) {
      return
    }
    lanzando.current = true
    void submitQuick(agent.quickAgent, {
      setupOnly: agent.quickSetupOnly,
      launchChoice: agent.launchChoice
    }).finally(() => {
      lanzando.current = false
    })
  }, [agent.launchChoice, agent.quickAgent, agent.quickSetupOnly, gate.kind, submitQuick])

  const onPromptKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
      // Enter sends and Shift+Enter breaks the line, the same as the chat composer.
      // Cmd/Ctrl+Enter also sends, so the habit from the create dialog keeps working.
      const plainEnter = event.key === 'Enter' && !event.shiftKey && !event.altKey
      if (!plainEnter && !isScreenSubmitShortcut(event.nativeEvent)) {
        return
      }
      // Un Enter que se queda apretado repite el keydown, y cada repetición era otra rama.
      if (event.repeat) {
        event.preventDefault()
        return
      }
      if (event.nativeEvent.isComposing) {
        return
      }
      event.preventDefault()
      start()
    },
    [start]
  )

  const sendButton = (
    <Button
      type="button"
      aria-label={translate('components.landing.start.send', 'Start working')}
      disabled={gate.kind !== 'ready'}
      // A press keeps focus in the text box; a focused button drops it when it disables.
      onMouseDown={(event) => event.preventDefault()}
      onClick={start}
      size="icon"
      // Listo para mandar: el primario (blanco sobre oscuro). Sin pedido o sin poder arrancar, un
      // tono apagado y opaco en vez del blanco al 50 %, que sobre el elevado se leía gris sucio.
      className="size-8 rounded-full pointer-coarse:size-10 disabled:bg-foreground/[0.12] disabled:text-muted-foreground disabled:opacity-100"
    >
      {waiting ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
    </Button>
  )

  return (
    <div className="w-full space-y-1.5">
      <div
        className={cn(
          // La caja protagonista de la piel: radio 20, tono elevado OPACO (el del compositor del chat
          // es un velo y dejaba ver el mar a través del texto), anillo al 6 % y sin sombra.
          // `contain: paint` para que el parpadeo del cursor no vuelva a rasterizar lo de atrás.
          'rounded-2xl border border-chat-composer-border bg-popover p-2',
          '[contain:paint]'
        )}
      >
        <textarea
          ref={promptRef}
          value={prompt}
          onChange={(event) => cardProps.onAgentPromptChange(event.target.value)}
          onKeyDown={onPromptKeyDown}
          disabled={!hasProjects}
          autoFocus
          aria-label={translate(
            'components.landing.start.promptLabel',
            'What should the agent do?'
          )}
          placeholder={
            hasProjects
              ? translate(
                  'components.landing.start.promptPlaceholder',
                  'Describe what you want done. Dolphin opens a workspace and starts an agent on it.'
                )
              : translate(
                  'components.landing.start.promptPlaceholderNoProject',
                  'Add a project and you can start from here.'
                )
          }
          className={cn(
            'min-h-12 w-full resize-none bg-transparent px-2 py-1 text-sm text-chat-foreground-strong outline-none pointer-coarse:min-h-14',
            'max-h-[calc(8lh+0.5rem)] overflow-y-auto scrollbar-sleek [field-sizing:content]',
            'placeholder:text-chat-foreground-faint disabled:cursor-not-allowed disabled:opacity-50'
          )}
        />

        <div className="flex w-full items-center justify-between gap-2 pt-0.5 text-chat-foreground-faint">
          <div className="flex min-w-0 items-center gap-0.5">
            {hasProjects ? (
              <>
                <StartProjectPill
                  options={cardProps.projectOptions}
                  value={cardProps.selectedProjectId ?? null}
                  onChange={cardProps.onProjectChange}
                  onAddProject={() => openModal('add-repo')}
                />
                <StartRunTargetPill
                  options={cardProps.projectHostSetupOptions}
                  value={cardProps.selectedProjectHostSetupId ?? null}
                  executionHostId={cardProps.selectedRepoExecutionHostId}
                  onChange={(setupId) => cardProps.onProjectHostSetupChange?.(setupId)}
                  onConnect={(option) => void connectRunTargetHost(option)}
                  onAddMachine={() => setAddRemoteHostMode('server-ssh')}
                />
                <StartAgentPill
                  agents={resolveVisibleQuickAgents(cardProps.detectedAgentIds, disabledTuiAgents)}
                  value={agent.quickAgent}
                  setupOnly={agent.quickSetupOnly}
                  onChange={(next) => agent.onQuickAgentChange(next)}
                  onSetupOnly={agent.onQuickSetupOnlySelect}
                />
                <StartPermissionPill agent={agent.quickAgent} />
              </>
            ) : (
              <Button type="button" variant="ghost" size="xs" onClick={() => openModal('add-repo')}>
                <FolderPlus className="size-3.5" />
                {translate('auto.components.Landing.f9eaa9e12d', 'Add project')}
              </Button>
            )}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            {hint ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  {/* A disabled button takes no pointer events, so the wrapper carries the hover. */}
                  <span className="inline-flex">{sendButton}</span>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={4}>
                  {hint}
                </TooltipContent>
              </Tooltip>
            ) : (
              sendButton
            )}
          </div>
        </div>
      </div>

      {cardProps.createError ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {typeof cardProps.createError === 'string'
            ? cardProps.createError
            : cardProps.createError.message}
        </div>
      ) : null}

      <p
        role="status"
        aria-live="polite"
        className="min-h-4 px-1 text-center text-[11px] text-muted-foreground"
      >
        {hint ?? ''}
      </p>

      <AddRemoteHostDialog mode={addRemoteHostMode} onOpenChange={setAddRemoteHostMode} />
    </div>
  )
}

/**
 * What to say when the composer cannot start. Nothing for an empty prompt: the placeholder
 * already asks for that, and repeating it under an empty box reads as an error for not having
 * typed yet.
 */
function startGateHint(
  gate: ReturnType<typeof resolveStartGate>,
  projectError: string | null
): string | null {
  if (gate.kind === 'ready' || gate.reason === 'empty-prompt') {
    return null
  }
  if (gate.reason === 'creating') {
    return translate('components.landing.start.creating', 'Creating the workspace…')
  }
  if (gate.reason === 'no-projects') {
    return translate('components.landing.start.noProjects', 'Add a project to start from here.')
  }
  if (gate.reason === 'no-project-selected') {
    return translate('components.landing.start.noProjectSelected', 'Choose a project.')
  }
  if (gate.reason === 'reading-agents') {
    return translate(
      'components.landing.start.readingAgents',
      'Checking which agents this machine has…'
    )
  }
  return (
    projectError ??
    translate(
      'components.landing.start.projectNotReady',
      'This project needs a location or a connection on the chosen machine first.'
    )
  )
}
