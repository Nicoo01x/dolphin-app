// Compose the Node-host runtime; paired desktop pages work even without a local browser engine.
import process from 'node:process'
import { getAppEnvironment } from '../../shared/app-environment'
import { resolveUserDataPath } from './dolphind-app-paths'
import { prepareDolphindCliLauncher } from './dolphind-cli-launcher'
import { installDolphindHostAdapters, runDolphindQuitHandlers } from './dolphind-host-adapters'
import { prepareDolphindSecretStoreAndMigrate } from './dolphind-secret-store-startup'
import { describeDolphindBindExposure, resolveDolphindBindHost } from '../../shared/dolphind-bind-address'
import {
  flushDolphindProfileStoreForShutdown,
  startDolphindWithHost,
  stopDolphindStructuredAgentSessions
} from './dolphind-lifecycle'
import { resolveDolphindWebClientRoot } from './dolphind-command-arguments'
import type { DolphindRuntimeCleanup } from './dolphind-runtime-lifetime'
import { bindDolphindStopTerminalAdmission } from './dolphind-stop-terminal-admission'
import type { DolphindHandle, DolphindOptions } from './dolphind-start-contract'
import { beginDolphindIdleExit } from './dolphind-managed-idle-exit-host'
import { dolphindAutomationsKeepHostBusy, startDolphindAutomations } from './dolphind-automations'
import {
  changedAiVaultSearchSettings,
  type AiVaultSearchSettings
} from '../../shared/ai-vault/search/ai-vault-search-settings'
import { stampRuntimeSourceEnv } from '../../shared/runtime-source-env'
import { adoptWslHostLoginEnvironmentLogged } from './dolphind-wsl-host-login-environment'
import { dolphindWsPortOptions } from './dolphind-ws-port-policy'
import { createDolphindStartupTiming } from './dolphind-startup-timing'
import { DOLPHIN_LAYOUT_OWNER_IS_MAIN } from '../../shared/layout-owner-switch'
import { restoreDolphindTerminalAuthority } from './dolphind-restored-terminal-authority'
import { installDolphindFeatureReadiness } from '../runtime/rpc/dolphind-feature-readiness'
import { DOLPHIN_SERVE_SUPERVISED_ENV } from '../../shared/serve-supervised-terminal-durability'
import { startDolphindEventLoopWatchdog } from './dolphind-event-loop-watchdog'
import { isAgentStatusHooksEnabled } from '../../shared/agent-hook-listener/configuration/agent-status-hooks-setting'

let closeDolphindObservability = (): Promise<void> => Promise.resolve()

/** Resolve after transport readiness publishes the desktop-compatible serve payload. */
export async function startDolphind(options: DolphindOptions = {}): Promise<DolphindHandle> {
  installDolphindHostAdapters()
  // Inherited terminal identity must not fence dolphind’s CLI children to the launching desktop.
  stampRuntimeSourceEnv(process.env, null)
  const userDataPath = resolveUserDataPath()
  // Override inherited data roots so CLI-shared Codex homes resolve on this host.
  process.env.DOLPHIN_USER_DATA_PATH = userDataPath
  const { readiness, instance, stop } = await startDolphindWithHost(
    userDataPath,
    (registerCleanup) => startDolphindRuntime(options, registerCleanup),
    async () => {
      try {
        runDolphindQuitHandlers()
      } finally {
        // Close after quit handlers, including failed ones, so their spans reach disk.
        const closing = closeDolphindObservability()
        closeDolphindObservability = () => Promise.resolve()
        await closing
      }
    }
  )
  const version = getAppEnvironment().getVersion()
  return { readiness, managedStop: { version, runtimeId: readiness.runtimeId, instance }, stop }
}

async function startDolphindRuntime(
  options: DolphindOptions,
  registerCleanup: (cleanup: DolphindRuntimeCleanup) => void
): Promise<Pick<DolphindHandle, 'readiness'>> {
  const { time: timed, report: reportStartupTiming } = createDolphindStartupTiming()
  // Read before startDolphindDaemon consumes the supervised flag; only a supervised server exits on a long stall.
  const eventLoopWatchdog = startDolphindEventLoopWatchdog({
    supervised: process.env[DOLPHIN_SERVE_SUPERVISED_ENV] === '1'
  })
  registerCleanup(() => eventLoopWatchdog?.stop())
  // Overlap login-shell probing with imports and store startup.
  const loginEnvironment = adoptWslHostLoginEnvironmentLogged()
  const { startDolphindDaemon, stopDolphindDaemon } = await import('./dolphind-daemon-supervision')
  // The daemon and its PTYs inherit the adopted login env and nothing later startup writes, so it
  // spawns as soon as that lands, alongside imports, stores and hooks. Rejects only when supervised.
  const daemonStartup = loginEnvironment.then(() => timed('daemon', () => startDolphindDaemon()))
  // Observed now: an early abort may never reach the await below.
  void daemonStartup.catch(() => {})
  // Registered first, so it runs last (cleanups run in reverse) and covers an import that throws
  // mid-spawn. It disconnects without killing daemon PTYs that must survive restart, after an
  // in-flight spawn settles; a failed one leaves only the disconnect to do.
  registerCleanup(() => daemonStartup.catch(() => {}).then(() => stopDolphindDaemon()))
  const { DolphinRuntimeService } = await import('../runtime/dolphin-runtime')
  const { DolphinRuntimeRpcServer } = await import('../runtime/rpc/server/runtime-rpc')
  const { registerHeadlessPtyRuntime } = await import('../ipc/pty/register-headless-runtime')
  const { getLocalPtyProvider } = await import('../ipc/pty/provider/registry')
  const { installDolphindObservability } = await import('./dolphind-observability')
  closeDolphindObservability = installDolphindObservability()
  const { ServeReadinessPublisher } = await import('../server/serve-readiness')
  const { servePublishMode } = await import('../server/serve-pairing-readiness')
  const { buildDolphindServeReadiness } = await import('./dolphind-serve-readiness')
  const { createDolphindProfileStateStartup } = await import('./dolphind-profile-state-startup')
  const { daemonOwnsFreshPersistentPtys } =
    await import('../daemon/providers/lifecycle/daemon-provider-state')
  const { resolveDaemonSessionScrollbackRows } =
    await import('../daemon/sessions/daemon-session-scrollback-window')
  const { collectDolphindHealth } = await import('./dolphind-health')
  const { agentHookServer } = await import('../agent-hooks/server/agent-hook-server')
  await import('../agent-hooks/installation/managed-agent-hook-controls')
  const { agentHookRuntimeDeps } = await import('../agent-hooks/runtime/agent-hook-runtime-deps')
  const { installHookStatusSessionTabsRepublish } =
    await import('../agent-hooks/runtime/hook-status-session-tabs-republish')
  const { startDolphindAgentHookServer, startDolphindManagedAgentHooks } =
    await import('./dolphind-managed-agent-hooks')
  const { AgentStatusObservedPaneIdentities, AgentStatusObservedPaneIdentityCapture } =
    await import('../runtime/terminal/identity/agent-status-observed-pane-identity')

  const { disposeWatcherProcessAndWait } =
    await import('../ipc/filesystem/watcher-process/parcel-watcher-process')

  let paneGridsForShutdown: { flushPaneGrids(): Promise<void> | null } | null = null
  let profileStoreForShutdown: Parameters<typeof flushDolphindProfileStoreForShutdown>[0] | undefined
  let uninstallHookStatusRepublish = (): void => {}
  let uninstallObservedStatusIdentity = (): void => {}
  // Cleanups run in reverse: RPC, then recovery and watchers, then the final flush; the daemon
  // disconnect, registered above, runs last.
  registerCleanup(() => agentHookServer.stop())
  registerCleanup(() => uninstallHookStatusRepublish())
  registerCleanup(() => uninstallObservedStatusIdentity())
  registerCleanup(async () => {
    // A SQLite-backed dolphind has no JSON mirror to absorb a debounced write after SIGTERM.
    if (profileStoreForShutdown) {
      await flushDolphindProfileStoreForShutdown(profileStoreForShutdown, paneGridsForShutdown)
    }
  })
  registerCleanup(stopDolphindStructuredAgentSessions)
  registerCleanup(() => disposeWatcherProcessAndWait())
  const { DesktopPushService } = await import('../runtime/push/desktop-push-service')
  const { resolvePushGatewayOrigin } = await import('../runtime/push/push-gateway-origin')

  const runtimeUserDataPath = getAppEnvironment().getPath('userData')
  const { startEventLoopDelayProbe } = await import('../diagnostics/event-loop-delay-probe')
  startEventLoopDelayProbe('dolphind', runtimeUserDataPath)
  await timed('cli-launcher', () => prepareDolphindCliLauncher()).catch((error: unknown) => {
    console.warn('[dolphind] Could not prepare the profile CLI launcher', error)
  })
  const idleExitStartup = beginDolphindIdleExit(runtimeUserDataPath)
  const { applyDolphindSessionScannerIdleTimeout } = await import('./dolphind-session-scanner-idle')
  await applyDolphindSessionScannerIdleTimeout()
  // Initialize sealing before Store load unseals protected settings.
  await timed('secret-store', () => prepareDolphindSecretStoreAndMigrate(runtimeUserDataPath))
  const { store: profileStore, authority: profileStateAuthority } = await timed('profile', () =>
    createDolphindProfileStateStartup(runtimeUserDataPath)
  )
  const observedPaneIdentities = new AgentStatusObservedPaneIdentities()
  const observedStatusCapture = new AgentStatusObservedPaneIdentityCapture(observedPaneIdentities)
  profileStoreForShutdown = profileStore
  uninstallObservedStatusIdentity = agentHookServer.subscribeEnrichedStatus((enriched) =>
    observedStatusCapture.observe(enriched)
  )
  // Subscribe before hooks start so early turns are counted.
  const { startDolphindStats } = await import('./dolphind-stats')
  const stats = startDolphindStats(runtimeUserDataPath, agentHookServer, registerCleanup)
  await startDolphindAgentHookServer(agentHookServer, {
    env: 'production',
    userDataPath: runtimeUserDataPath,
    statusHooksEnabled: isAgentStatusHooksEnabled(profileStore.getSettings())
  })

  // Reconcile, daemon and runtime all consume this environment.
  await timed('login-env-wait', () => loginEnvironment)
  const managedAgentHooks = startDolphindManagedAgentHooks(
    profileStore,
    (enabled) => agentHookServer.setStatusHooksEnabled(enabled),
    registerCleanup
  )

  // Install the daemon provider before PTY handlers can route their first call.
  await daemonStartup

  // Runtime constructor callbacks use this index only after it is installed.
  let sessionSearch: { apply(settings: AiVaultSearchSettings): void; dispose(): void } | null = null

  const { dolphindCodexAccountHomes } = await import('./dolphind-codex-account-homes')
  const codexAccountHomes = dolphindCodexAccountHomes(
    () => profileStore.getSettings(),
    registerCleanup
  )

  // Gates open where each phase finishes today; RPC starts after all of them (no behavior change).
  const featureReadiness = installDolphindFeatureReadiness()
  const { createDolphindAccountServices } = await import('./dolphind-account-services')
  const accountLaunch = createDolphindAccountServices({
    store: profileStore,
    setClaudeStatusLineListener: (listener) =>
      agentHookServer.setClaudeStatusLineListener(listener),
    registerCleanup,
    clientCodexHomes: codexAccountHomes
  })

  const { loadAgentSessionClaimSigner } =
    await import('../runtime/agent-session/ownership/agent-session-claim-identity')
  const { createDolphindPairedEnvironmentOptions } = await import('./dolphind-paired-environment-options')
  const pairedEnvironments = createDolphindPairedEnvironmentOptions()
  const runtime = new DolphinRuntimeService(profileStore, stats, {
    // Persistent signatures let restarted runtimes adopt PTYs owned before restart.
    agentSessionClaimSigner: loadAgentSessionClaimSigner(runtimeUserDataPath, runtimeUserDataPath),
    getAdditionalAiVaultCodexHomePaths: () => [
      ...codexAccountHomes.listSessionHomes(),
      ...(accountLaunch?.listCodexSessionHomes() ?? [])
    ],
    // WSL must retain desktop-pushed CODEX_HOME instead of host-selected resolvers.
    ...accountLaunch?.runtimeDeps,
    ...agentHookRuntimeDeps(agentHookServer, observedPaneIdentities, () =>
      profileStore.getSettings()
    ),
    // Resolve lazily because daemon swaps replace the provider after construction.
    getLocalProvider: () => getLocalPtyProvider(),
    ...pairedEnvironments.runtimeOptions,
    // Read current daemon ownership; failed/degraded launch cannot claim fresh PTY persistence.
    canRecoverPersistentLocalPtys: () => daemonOwnsFreshPersistentPtys(),
    // Node hosts cannot promote into desktop windows; override the constructor’s openable default.
    getDesktopWindowStatus: () => 'blocked',
    // No renderer reveals from this model; it keeps the daemon's live window, which deeper snapshot reads ask first.
    headlessTerminalScrollbackRows: resolveDaemonSessionScrollbackRows(),
    // Unchanged settings would reconstruct a healthy search index; deduplicate before apply.
    applySessionSearchSettings: (before, after) => {
      const next = changedAiVaultSearchSettings(before, after)
      if (next) {
        sessionSearch?.apply(next)
      }
    }
  })
  paneGridsForShutdown = runtime

  accountLaunch?.attachToRuntime(runtime)
  const { wireGitHubIssueLinkTitleFill } = await import('../github/github-issue-link-title-wiring')
  registerCleanup(wireGitHubIssueLinkTitleFill(profileStore, runtime))
  const { installDolphindEmulatorBridge } = await import('./dolphind-emulator-bridge')
  installDolphindEmulatorBridge(runtime, registerCleanup)

  // Restore prior desktop-pushed account selection before automations or CLI launches.
  const { restoreDolphindHostAccountLaunchEnv } = await import('./dolphind-host-account-launch-env-store')
  restoreDolphindHostAccountLaunchEnv(runtime, runtimeUserDataPath)
  featureReadiness.open('accounts')

  const { installDolphindSessionSearchService } = await import('./dolphind-session-search')
  sessionSearch = await installDolphindSessionSearchService({
    userDataPath: runtimeUserDataPath,
    getSettings: () => profileStore.getSettings()
  })
  getAppEnvironment().onWillQuit(() => sessionSearch?.dispose())
  featureReadiness.open('sessionSearch')

  const { startAgentStateRulesLiveUpdates } =
    await import('../runtime/agent-state-rules/agent-state-rules-live-update')
  startAgentStateRulesLiveUpdates(profileStore, (rules) =>
    console.info(`[dolphind] agent state rules ${rules.version} (${rules.source})`)
  )
  // Paired phones dictate through this host; keep its model loaded the same way the desktop does.
  const { startSpeechModelWarmup } = await import('../speech/speech-model-warmup')
  startSpeechModelWarmup(profileStore)
  if (DOLPHIN_LAYOUT_OWNER_IS_MAIN) {
    const { repairDuplicatePtyPanesOnStart } =
      await import('../runtime/terminal/identity/moved-pane-owner-rekey')
    // Wait behind earlier writes and persist repair before reconciliation/RPC admission.
    await repairDuplicatePtyPanesOnStart(profileStore, runtime)
  }

  // Status changes must republish session.tabs to paired clients.
  uninstallHookStatusRepublish = installHookStatusSessionTabsRepublish(
    agentHookServer,
    () => runtime
  )
  registerCleanup(runtime.attachAgentStatusStore(agentHookServer))

  // Headless registration threads Store into persistence; account homes prefer client then host selection.
  // WSL has no host selection and keeps the desktop-prepared environment.
  await registerHeadlessPtyRuntime(
    runtime,
    async (target, launchEnv, context) =>
      (await codexAccountHomes.selectLaunchHome(target, launchEnv, context)) ??
      (accountLaunch ? accountLaunch.prepareCodexHome(target, launchEnv, context) : null),
    () => profileStore.getSettings(),
    accountLaunch?.prepareClaudeAuth,
    profileStore,
    accountLaunch?.prepareCodexSessionResume
  )

  // Recover browser/orchestration authority before clients attach to the runtime graph.
  runtime.rehydrateClientHostedBrowserPages()

  await restoreDolphindTerminalAuthority(runtime, timed, featureReadiness)
  runtime.agentTransitions.seedRestoredRows()
  void runtime.sidebarFacts?.reconcileSortStampTiers(getLocalPtyProvider())

  // Run after RPC stops; later dismissal records save synchronously until exit.
  registerCleanup(() => runtime.closeNotificationDismissals())
  // Stop recovery retries before final profile flush.
  registerCleanup(() => runtime.stopLegacyWorkerTerminalRecovery())

  // Recovery establishes terminal/dispatch identities before fencing observations.
  observedStatusCapture.attach(runtime)
  agentHookServer.setCliWriterExecutionMatcher(observedPaneIdentities, runtime)
  agentHookServer.setClaudePermissionHolds(runtime.terminalWorkerApprovals)
  // First RPC clients must see a fully published graph.
  const { publishHeadlessRuntimeGraph } =
    await import('../runtime/session-graph/headless-runtime-graph')
  publishHeadlessRuntimeGraph(runtime)
  // Only the runtime can identify running shells and install deferred migrated history.
  void runtime.installPendingDolphindMigrationShellHistory().catch((error: unknown) => {
    console.error('[dolphind-migration] installing pending shell history failed:', error)
  })

  const bindHost = resolveDolphindBindHost(options.bind, {
    allowPublicNetwork: options.exposeToPublicNetwork
  })
  bindDolphindStopTerminalAdmission(runtime.terminalUpdateAdmission)
  const rpc = new DolphinRuntimeRpcServer({
    runtime,
    userDataPath: runtimeUserDataPath,
    enableWebSocket: true,
    // Pin operator exposure across restarts; pairing must not silently widen a loopback bind.
    pinnedBindHost: bindHost,
    serveNetworkSources: {
      allowPublic: options.allowPublic === true,
      refusePublic: options.refusePublic === true,
      pairingAddress: options.pairingAddress ?? null
    },
    webClientRoot: resolveDolphindWebClientRoot(options.webClientRoot),
    ...dolphindWsPortOptions(options.port)
  })
  pairedEnvironments.bindRpc(rpc)
  runtime.setAgentSenderPeerKey(() => rpc.getE2EEPublicKey())
  // Stop RPC before cleanup can tear down writers and runtime state.
  registerCleanup(() => rpc.stop())
  await timed('rpc', () => rpc.start())
  // The daemon has no window to wait for; its CI-line watches start with the runtime.
  runtime.startPullRequestWatches()
  startDolphindAutomations(runtime, profileStore, registerCleanup)
  const gatewayUrl = resolvePushGatewayOrigin(process.env, getAppEnvironment().isPackaged())
  const pushService = gatewayUrl
    ? DesktopPushService.create({ runtime, runtimeRpc: rpc, gatewayUrl })
    : null
  pushService?.start()
  getAppEnvironment().onWillQuit(() => pushService?.stop())
  console.error(`[dolphind] ${describeDolphindBindExposure(bindHost)}`)

  const readiness = await buildDolphindServeReadiness({
    options,
    runtimeId: runtime.getRuntimeId(),
    rpc,
    collectHealth: () =>
      collectDolphindHealth(
        getAppEnvironment().getVersion(),
        profileStateAuthority,
        idleExitStartup.previousIdleStop
      )
  })

  await new ServeReadinessPublisher().publish(readiness, servePublishMode(options))
  reportStartupTiming()
  managedAgentHooks.readinessPublished()

  await idleExitStartup.start({
    rpc,
    agentStates: () => agentHookServer.getStatusSnapshot(),
    hasStagedMigration: () => profileStore.hasStagedDolphindMigrationCatalog(),
    automationsBusy: () => dolphindAutomationsKeepHostBusy(profileStore),
    emulatorsBusy: async () =>
      (await runtime.getEmulatorBridge()?.hasLiveManagedSessions()) ?? false,
    registerCleanup
  })
  return { readiness }
}
