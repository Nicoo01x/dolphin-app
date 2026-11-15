import { useAppStore } from '../store'
import { useActivityTerminalPortals } from './activity/activity-terminal-portal'
import type { ActivityTerminalPortalTarget } from './activity/activity-terminal-portal'
import type { TerminalWorkspaceFoundation } from './use-terminal-workspace-foundation'

export function useTerminalWorkspaceStoreBindings(controller: TerminalWorkspaceFoundation) {
  const { activeView, renderedActiveWorktreeId } = controller
  const activeTabId = useAppStore((state) => state.activeTabId)
  const activeTabIdByWorktree = useAppStore((state) => state.activeTabIdByWorktree)
  const createTab = useAppStore((state) => state.createTab)
  const closeTab = useAppStore((state) => state.closeTab)
  const setActiveTab = useAppStore((state) => state.setActiveTab)
  const setActiveWorktree = useAppStore((state) => state.setActiveWorktree)
  const setTabCustomTitle = useAppStore((state) => state.setTabCustomTitle)
  const setTabColor = useAppStore((state) => state.setTabColor)
  const consumeSuppressedPtyExit = useAppStore((state) => state.consumeSuppressedPtyExit)
  const expandedPaneByTabId = useAppStore((state) => state.expandedPaneByTabId)
  const workspaceSessionReady = useAppStore((state) => state.workspaceSessionReady)
  const hydrationSucceeded = useAppStore((state) => state.hydrationSucceeded)
  const terminalStartupRestorationReady = useAppStore(
    (state) => state.terminalStartupRestorationReady
  )
  const startupWorktreeRefreshCompleted = useAppStore(
    (state) => state.startupWorktreeRefreshCompleted
  )
  const openFiles = useAppStore((state) => state.openFiles)
  const activeFileId = useAppStore((state) => state.activeFileId)
  const activeBrowserTabId = useAppStore((state) => state.activeBrowserTabId)
  const activeTabType = useAppStore((state) => state.activeTabType)
  const keybindings = useAppStore((state) => state.keybindings)
  const terminalShortcutPolicy = useAppStore(
    (state) => state.settings?.terminalShortcutPolicy ?? 'dolphin-first'
  )
  const mobileEmulatorEnabled = useAppStore(
    (state) => state.settings?.mobileEmulatorEnabled !== false
  )
  const setActiveTabType = useAppStore((state) => state.setActiveTabType)
  const setActiveFile = useAppStore((state) => state.setActiveFile)
  const closeFile = useAppStore((state) => state.closeFile)
  const makePreviewFilePermanent = useAppStore((state) => state.makePreviewFilePermanent)
  const pinFile = useAppStore((state) => state.pinFile)
  const browserTabsByWorktree = useAppStore((state) => state.browserTabsByWorktree)
  const createBrowserTab = useAppStore((state) => state.createBrowserTab)
  const openNewBrowserTabInActiveWorkspace = useAppStore(
    (state) => state.openNewBrowserTabInActiveWorkspace
  )
  const openNewMarkdownInActiveWorkspace = useAppStore(
    (state) => state.openNewMarkdownInActiveWorkspace
  )
  const openNewPluginFileInActiveWorkspace = useAppStore(
    (state) => state.openNewPluginFileInActiveWorkspace
  )
  const openNewTerminalTabInActiveWorkspace = useAppStore(
    (state) => state.openNewTerminalTabInActiveWorkspace
  )
  const closeBrowserTab = useAppStore((state) => state.closeBrowserTab)
  const setActiveBrowserTab = useAppStore((state) => state.setActiveBrowserTab)
  const groupsByWorktree = useAppStore((state) => state.groupsByWorktree)
  const layoutByWorktree = useAppStore((state) => state.layoutByWorktree)
  const activeGroupIdByWorktree = useAppStore((state) => state.activeGroupIdByWorktree)
  const ensureWorktreeRootGroup = useAppStore((state) => state.ensureWorktreeRootGroup)
  const reconcileWorktreeTabModel = useAppStore((state) => state.reconcileWorktreeTabModel)
  const tabBarOrderByWorktree = useAppStore((state) => state.tabBarOrderByWorktree)
  const tabBarOrder = renderedActiveWorktreeId
    ? tabBarOrderByWorktree[renderedActiveWorktreeId]
    : undefined
  // Why `lienzo` too: the canvas shows terminals in floating windows outside the workspace tree,
  // and it reuses this same portal channel. Mounting a second TerminalPane there would own a
  // second xterm for one PTY; portaling the existing pane is what keeps main's hidden-delivery
  // gate seeing a visible consumer, so the terminal actually paints.
  const activityTerminalPortals: ActivityTerminalPortalTarget[] = useActivityTerminalPortals(
    activeView === 'activity' || activeView === 'lienzo'
  )

  return {
    activeTabId,
    activeTabIdByWorktree,
    createTab,
    closeTab,
    setActiveTab,
    setActiveWorktree,
    setTabCustomTitle,
    setTabColor,
    consumeSuppressedPtyExit,
    expandedPaneByTabId,
    workspaceSessionReady,
    hydrationSucceeded,
    terminalStartupRestorationReady,
    startupWorktreeRefreshCompleted,
    openFiles,
    activeFileId,
    activeBrowserTabId,
    activeTabType,
    keybindings,
    terminalShortcutPolicy,
    mobileEmulatorEnabled,
    setActiveTabType,
    setActiveFile,
    closeFile,
    makePreviewFilePermanent,
    pinFile,
    browserTabsByWorktree,
    createBrowserTab,
    openNewBrowserTabInActiveWorkspace,
    openNewMarkdownInActiveWorkspace,
    openNewPluginFileInActiveWorkspace,
    openNewTerminalTabInActiveWorkspace,
    closeBrowserTab,
    setActiveBrowserTab,
    groupsByWorktree,
    layoutByWorktree,
    activeGroupIdByWorktree,
    ensureWorktreeRootGroup,
    reconcileWorktreeTabModel,
    tabBarOrderByWorktree,
    tabBarOrder,
    activityTerminalPortals
  }
}

export type TerminalWorkspaceStoreController = TerminalWorkspaceFoundation &
  ReturnType<typeof useTerminalWorkspaceStoreBindings>
