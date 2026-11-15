import { getAppEnvironment } from '../../shared/app-environment'
import type { RuntimeRpcClientActivity } from '../runtime/rpc/server/runtime-rpc'
import type { DolphindIdleExitEvidence } from './dolphind-idle-exit-monitor'
import {
  activationFenceExists,
  createDolphindIdleProbes,
  installDolphindManagedIdleExit,
  resolveDolphindManagedIdleExit,
  type DolphindManagedIdleExitConfig,
  type DolphindManagedIdleExitPorts
} from './dolphind-managed-idle-exit'
import type { DolphindDaemonRetirement } from './dolphind-daemon-retirement'
import { recoverDaemonAfterCancelledIdleStop } from './dolphind-idle-stop-daemon-recovery'
import {
  consumeDolphindIdleStopRecord,
  discardDolphindIdleStopRecord,
  writeDolphindIdleStopRecord
} from './dolphind-idle-stop-record'
import type { DolphindShutdownTrigger } from './dolphind-lifecycle'
import {
  idleStopMayReleaseWslHolder,
  requestDolphindWslHolderRelease,
  withdrawDolphindWslHolderRelease
} from './dolphind-wsl-holder-release'
import type { DolphindIdleStopRecord } from '../../shared/dolphind-idle-exit'
import { getStructuredAgentSessionHost } from '../native-chat/agent-session-wire/host/structured-agent-session-registry'

let requestIdleShutdown: DolphindShutdownTrigger | null = null

/** Signal handling binds later; the quiet period must outlast the startup gap. */
export function bindDolphindIdleShutdown(request: DolphindShutdownTrigger): void {
  requestIdleShutdown = request
}

type DolphindIdleExitRuntimePorts = {
  rpc: { readClientActivity(): RuntimeRpcClientActivity }
  agentStates: () => readonly { state: string }[]
  hasStagedMigration: () => boolean
  automationsBusy: () => boolean
  emulatorsBusy: () => Promise<boolean>
  /** Stop the monitor before recording signal-driven shutdown. */
  registerCleanup: (cleanup: () => void) => void
}

/** Under the startup lock, consume previous idle-stop evidence before this run can overwrite it. */
export function beginDolphindIdleExit(userDataPath: string): {
  previousIdleStop: DolphindIdleStopRecord | null | undefined
  start: (ports: DolphindIdleExitRuntimePorts) => Promise<void>
} {
  withdrawDolphindWslHolderRelease(userDataPath)
  const config = resolveDolphindManagedIdleExit(process.env)
  if (!config) {
    return { previousIdleStop: undefined, start: async () => {} }
  }
  const previousIdleStop = consumeDolphindIdleStopRecord(userDataPath)
  if (previousIdleStop) {
    console.error(`[dolphind] the previous run stopped idle at ${previousIdleStop.stoppedAt}`)
  }
  const version = getAppEnvironment().getVersion()
  return {
    previousIdleStop,
    start: (ports) => startDolphindManagedIdleExit({ ...ports, config, userDataPath, version })
  }
}

async function startDolphindManagedIdleExit(
  input: DolphindIdleExitRuntimePorts & {
    config: DolphindManagedIdleExitConfig
    userDataPath: string
    version: string
  }
): Promise<void> {
  const { getLocalPtyProvider } = await import('../ipc/pty/provider/registry')
  const { getCurrentDaemonPid, getDaemonEndpointFacts, isDaemonTerminalAdmissionClosed } =
    await import('../daemon/providers/lifecycle/daemon-provider-state')
  const { countLiveDolphindDaemonSessions, retireDolphindDaemonIfIdle } =
    await import('./dolphind-daemon-retirement')
  const idleRecord = createIdleStopRecordOwnership(input.userDataPath)
  const hasChatProviders = (): boolean =>
    getStructuredAgentSessionHost()?.hasLoadedProviders() ?? false
  const ports: DolphindManagedIdleExitPorts = {
    readClientActivity: () => input.rpc.readClientActivity(),
    listTerminals: () => getLocalPtyProvider().listProcesses(),
    countDaemonSessions: countLiveDolphindDaemonSessions,
    hasDaemon: () => getDaemonEndpointFacts() !== null,
    agentStates: input.agentStates,
    hasChatProviders,
    hasStagedMigration: input.hasStagedMigration,
    automationsBusy: input.automationsBusy,
    emulatorsBusy: input.emulatorsBusy,
    activationFenceExists
  }
  // Client/terminal evidence is already checked; recheck other work exit would destroy.
  const nonTerminalWorkProbes = createDolphindIdleProbes(input.config, ports).filter(
    (probe) => probe.name !== 'clients' && probe.name !== 'terminals'
  )
  const hasNonTerminalWork = async (): Promise<boolean> => {
    for (const probe of nonTerminalWorkProbes) {
      if (
        (await Promise.resolve()
          .then(probe.read)
          .catch(() => 'unverifiable')) !== 'idle'
      ) {
        return true
      }
    }
    return false
  }
  const dispose = installDolphindManagedIdleExit({
    config: input.config,
    ports,
    stop: async (evidence) => {
      // Replacement must target only the daemon incarnation that agreed to retire.
      const retiringPid = getCurrentDaemonPid()
      const outcome = await stopForIdle(input, evidence, retireDolphindDaemonIfIdle)
      // Clients/providers can return while the retirement reply is pending.
      const activity = input.rpc.readClientActivity()
      if (
        hasChatProviders() ||
        activity.openConnections > 0 ||
        activity.requestsInFlight > 0 ||
        activity.lastRequestAt > evidence.quietSince
      ) {
        discardDolphindIdleStopRecord(input.userDataPath)
        const daemon = await recoverDaemonAfterCancelledIdleStop(outcome, {
          admissionClosed: isDaemonTerminalAdmissionClosed,
          retireAgain: () => retireDolphindDaemonIfIdle(),
          replaceDaemon: async () => {
            if (retiringPid === null) {
              throw new Error('the retiring daemon never identified itself')
            }
            const { restartDaemon } =
              await import('../daemon/providers/lifecycle/daemon-provider-restart')
            await restartDaemon({ expectedDaemonPid: retiringPid, endpointMayBeGone: true })
          }
        })
        if (daemon === 'serving' || (await hasNonTerminalWork())) {
          return false
        }
        idleRecord.requestShutdown(requestIdleShutdown)
        return true
      }
      if (idleStopMayReleaseWslHolder(process.env, outcome)) {
        try {
          requestDolphindWslHolderRelease(input.userDataPath)
        } catch (error) {
          console.error('[dolphind] could not release the WSL distro holder:', error)
        }
      }
      idleRecord.requestShutdown(requestIdleShutdown)
      return true
    }
  })
  input.registerCleanup(() => {
    dispose()
    idleRecord.onShutdown()
  })
}

/** Discard failed, overdue and externally superseded idle stops, including cleanup before request completion. */
export function createIdleStopRecordOwnership(userDataPath: string): {
  requestShutdown(request: DolphindShutdownTrigger | null): void
  onShutdown(): void
} {
  let idleOwnsStop = false
  // The holder release rides on the idle stop: a stop that is not idle must not end the distro.
  const discard = (): void => {
    discardDolphindIdleStopRecord(userDataPath)
    withdrawDolphindWslHolderRelease(userDataPath)
  }
  return {
    requestShutdown: (request) => {
      // Cleanup may run before the trigger returns, so establish ownership first.
      idleOwnsStop = true
      if (request?.('idle', discard) !== true) {
        idleOwnsStop = false
        discard()
      }
    },
    onShutdown: () => {
      if (!idleOwnsStop) {
        discard()
      }
    }
  }
}

async function stopForIdle(
  input: { userDataPath: string; version: string },
  evidence: DolphindIdleExitEvidence,
  retireDaemon: () => Promise<DolphindDaemonRetirement>
): Promise<DolphindDaemonRetirement> {
  console.error(`[dolphind] stopping: no client, terminal or job for ${evidence.timeoutMs}ms`)
  try {
    writeDolphindIdleStopRecord(input.userDataPath, evidence, input.version)
  } catch (error) {
    console.error('[dolphind] could not record the idle stop:', error)
  }
  // Only the daemon’s atomic empty census can authorize retirement.
  const outcome = await retireDaemon().catch((error: unknown): DolphindDaemonRetirement => ({
    retirement: 'unverifiable',
    liveSessions: null,
    reason: String(error)
  }))
  console.error(
    `[dolphind] terminal daemon on idle stop: ${outcome.retirement}${outcome.reason ? ` (${outcome.reason})` : ''}`
  )
  return outcome
}
