import { useEffect } from 'react'
import { Bot, GitBranch, LayoutGrid, PanelTop, ScanEye } from 'lucide-react'
import { useAppStore } from '@/store'
import { cn } from '@/lib/class-names'
import { translate } from '@/i18n/i18n'
import { DolphinMark } from '../dolphin/DolphinMark'
import { dolphinRunsHere } from '../dolphin/dolphin-available'
import { useXrayBridge } from '../dolphin/xray/use-xray-bridge'

/**
 * La entrada «Dolphin» de la barra: abre la consola de Dolphin del proyecto activo.
 *
 * Es UNA sola (Nico, 31/10: «veo muchas opciones y no queda cómodo, tiene que ser algo más
 * centralizado»). Antes había siete, una por vista, que eran exactamente las mismas pestañas que la
 * consola ya tiene adentro: se navegaba lo mismo por dos lados. Ahora la barra dice dónde estás y
 * las vistas se eligen en la barra de arriba de la consola, que por eso dejó de esconderse.
 *
 * Al lado van las cosas que no viven adentro de la consola: la isla (Ctrl+Alt+D), X-ray
 * (Ctrl+Alt+X), y Delfines y Orquestación, que son pantallas de la app.
 */
export function DolphinSidebarEntry(): React.JSX.Element | null {
  const openDolphinPage = useAppStore((s) => s.openDolphinPage)
  const active = useAppStore((s) => s.activeView === 'dolphin')
  const openOrchestrationPage = useAppStore((s) => s.openOrchestrationPage)
  const openDelfinesPage = useAppStore((s) => s.openDelfinesPage)
  const enDelfines = useAppStore((s) => s.activeView === 'delfines')
  const setActiveView = useAppStore((s) => s.setActiveView)
  useXrayBridge(true)
  // Why opcional: la web y los tests no tienen el puente de Dolphin; ahí la isla no existe.
  useEffect(
    () => window.api?.dolphin?.onAbrirOrquestacion?.(openOrchestrationPage),
    [openOrchestrationPage]
  )
  if (!dolphinRunsHere()) {
    return null
  }
  const islaLabel = translate('auto.components.dolphin.isla.open', 'Show the island (Ctrl+Alt+D)')
  const xrayLabel = translate(
    'auto.components.dolphin.xray.open',
    'X-ray: point at any control on screen for the agent (Ctrl+Alt+X)'
  )
  const orquestacionLabel = translate(
    'auto.components.sidebar.SidebarNav.orchestration',
    'Orchestration'
  )
  const delfinesLabel = translate(
    'auto.components.sidebar.DolphinSidebarEntry.delfines',
    'Dolphins: your bots, their routines and your server'
  )
  const lienzoLabel = translate(
    'auto.components.sidebar.DolphinSidebarEntry.lienzo',
    'The canvas: your windows on a plane that pans and zooms'
  )
  const botonChico =
    'mr-1 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-worktree-sidebar-foreground/40 transition-colors duration-150 ease-out hover:bg-worktree-sidebar-foreground/10 hover:text-worktree-sidebar-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring'
  return (
    <div
      className={cn(
        'flex w-full items-center rounded-md transition-colors',
        active
          ? 'bg-worktree-sidebar-accent text-worktree-sidebar-accent-foreground'
          : 'text-worktree-sidebar-foreground/60 hover:bg-worktree-sidebar-foreground/8'
      )}
    >
      <button
        type="button"
        // Why la flecha: sin ella el evento del clic llegaba como «el worktree a mostrar».
        onClick={() => openDolphinPage('tareas')}
        aria-current={active ? 'page' : undefined}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] font-medium tracking-tight"
      >
        <DolphinMark
          className={cn('size-4 shrink-0', !active && 'text-worktree-sidebar-foreground/30')}
        />
        <span className="flex-1">
          {translate('auto.components.sidebar.DolphinSidebarEntry.dolphin', 'Dolphin')}
        </span>
      </button>
      <button
        type="button"
        aria-label={lienzoLabel}
        title={lienzoLabel}
        onClick={() => setActiveView('lienzo')}
        className={botonChico}
      >
        <LayoutGrid aria-hidden="true" className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label={delfinesLabel}
        title={delfinesLabel}
        onClick={openDelfinesPage}
        aria-current={enDelfines ? 'page' : undefined}
        className={cn(
          botonChico,
          enDelfines && 'bg-worktree-sidebar-foreground/10 text-worktree-sidebar-foreground'
        )}
      >
        <Bot aria-hidden="true" className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label={orquestacionLabel}
        title={orquestacionLabel}
        onClick={openOrchestrationPage}
        className={botonChico}
      >
        <GitBranch aria-hidden="true" className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label={islaLabel}
        title={islaLabel}
        onClick={() => void window.api.dolphin.alternarIsla?.()}
        className={botonChico}
      >
        <PanelTop aria-hidden="true" className="size-3.5" />
      </button>
      {window.api?.dolphin?.alternarXray ? (
        <button
          type="button"
          aria-label={xrayLabel}
          title={xrayLabel}
          onClick={() => void window.api.dolphin.alternarXray?.()}
          className={cn(botonChico, 'active:scale-95')}
        >
          <ScanEye aria-hidden="true" className="size-3.5" />
        </button>
      ) : null}
    </div>
  )
}
