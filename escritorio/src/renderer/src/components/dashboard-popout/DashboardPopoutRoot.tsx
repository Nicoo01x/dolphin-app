import { useAppMenuPaste } from '@/hooks/clipboard/menu/useAppMenuPaste'
import { useAppMenuSelectionActions } from '@/hooks/app-commands/useAppMenuSelectionActions'
import { AgentKanbanBoard } from './AgentKanbanBoard'
import { useDashboardSnapshot } from './useDashboardSnapshot'
import { useAgentDashboardTelemetry } from './use-agent-dashboard-telemetry'
import { DolphinIsla } from '../dolphin/isla/DolphinIsla'

/** Dolphin: main abre esta misma ventana en modo isla con `?isla=1` (ver main/dolphin/dolphin-isla.ts). */
const ES_ISLA = new URLSearchParams(window.location.search).has('isla')

export function DashboardPopoutRoot(): React.JSX.Element {
  // The pop-out has no App shell to translate Edit-menu IPC into terminal ownership events.
  useAppMenuPaste()
  useAppMenuSelectionActions()
  useAgentDashboardTelemetry('popout')
  const snapshot = useDashboardSnapshot()
  if (ES_ISLA) {
    return <DolphinIsla snapshot={snapshot} />
  }
  return <AgentKanbanBoard snapshot={snapshot} />
}
