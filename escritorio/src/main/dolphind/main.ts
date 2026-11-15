import '../memory/host-malloc-tunables-claim'
import process from 'node:process'
import { main } from './dolphind-command-startup'
import { resolveDolphindExitCode } from './dolphind-exit-code'
import { reserveServeStdoutForReadiness } from '../server/serve-stdout-boundary'
import { runDolphindNativePreflightVerdict } from './dolphind-native-preflight'
import {
  DOLPHIND_PROFILE_PREFLIGHT_FLAG,
  DOLPHIND_STARTUP_PREFLIGHT_FLAG
} from '../../shared/dolphind-profile-preflight'
import { onNodePtyLoadFailure } from '../providers/node-pty-load-failure'
import {
  confirmBundledDolphindStartupQualified,
  discardBundledDolphindStartupQualification,
  forgetBundledDolphindStartupQualification,
  preflightBundledDolphindStartup,
  runDolphindProfilePreflight
} from './dolphind-profile-preflight'
import { assertDolphindServerRuntime } from './dolphind-bundled-runtime'
import {
  formatDolphindNativePreflightReport,
  DOLPHIND_NATIVE_PREFLIGHT_FLAG
} from '../../shared/dolphind-native-preflight-report'
import {
  DOLPHIND_CANCEL_MANAGED_STOP_FLAG,
  DOLPHIND_COMPLETE_MANAGED_STOP_FLAG
} from '../../shared/dolphind-stop-request'
import {
  DOLPHIND_WINDOWS_BREAKAWAY_CONTRACT,
  WINDOWS_BREAKAWAY_LAUNCH_FLAG
} from '../../shared/windows-breakaway-launch'
import { runWindowsBreakawayLaunchIfRequested } from '../../shared/windows-breakaway-launcher'
import { parseArgs } from './dolphind-command-arguments'
import { DOLPHIND_RECLAIM_STALE_LOCK_FLAG } from '../../shared/dolphind-stale-lock-reclaim'

// A resolved plain-Node module graph proves the build guard; skip probes, ports and data-root locks.
if (process.argv.includes('--dolphind-smoke-load-check')) {
  process.exit(0)
}

function failStartup(error: unknown): void {
  console.error('dolphind: failed to start:', error)
  // Distinguish configuration refusals so supervisors cannot restart-spin on them.
  process.exit(resolveDolphindExitCode(error))
}

// One-shot launch and stop commands must skip server startup and preflights.
if (process.argv[2] === '--dolphind-structured-provider-load-check') {
  void import('./dolphind-structured-provider-smoke')
    .then(({ smokeLoadDolphindStructuredProviders }) => smokeLoadDolphindStructuredProviders())
    .then(() => process.exit(0))
    .catch(failStartup)
} else if (process.argv[2] === WINDOWS_BREAKAWAY_LAUNCH_FLAG) {
  runWindowsBreakawayLaunchIfRequested(DOLPHIND_WINDOWS_BREAKAWAY_CONTRACT, process.argv)
} else if (
  process.argv[2] === DOLPHIND_COMPLETE_MANAGED_STOP_FLAG ||
  process.argv[2] === DOLPHIND_CANCEL_MANAGED_STOP_FLAG
) {
  void import('./dolphind-managed-stop-command').then(({ runDolphindManagedStopCommandAndExit }) =>
    runDolphindManagedStopCommandAndExit(process.argv.slice(2))
  )
} else if (process.argv[2] === DOLPHIND_RECLAIM_STALE_LOCK_FLAG) {
  void import('./dolphind-stale-lock-reclaim').then(({ runDolphindStaleLockReclaimCommandAndExit }) =>
    runDolphindStaleLockReclaimCommandAndExit(process.argv.slice(2))
  )
} else {
  startDolphindProcess()
}

function startDolphindProcess(): void {
  try {
    const argv = process.argv.slice(2)
    if ((argv.includes('--help') || argv.includes('-h')) && parseArgs(argv).help) {
      void main(argv).catch(failStartup)
      return
    }
    assertDolphindServerRuntime()
    const flag = process.argv[2]
    if (flag === DOLPHIND_NATIVE_PREFLIGHT_FLAG && process.argv.length === 3) {
      void import('./node-pty-precondition').then(({ checkNodePtyPrecondition }) => {
        const verdict = checkNodePtyPrecondition()
        const report = formatDolphindNativePreflightReport(verdict.status, verdict.reason ?? null)
        process.stdout.write(`${report}\n`, () => process.exit(0))
      }, failStartup)
    } else if (
      (flag === DOLPHIND_STARTUP_PREFLIGHT_FLAG && process.argv.length === 4) ||
      (flag === DOLPHIND_PROFILE_PREFLIGHT_FLAG &&
        (process.argv.length === 4 || process.argv.length === 5))
    ) {
      void runDolphindProfilePreflight(process.argv[3], {
        nativeFeatures: flag === DOLPHIND_PROFILE_PREFLIGHT_FLAG,
        servedUserDataPath: process.argv[4]
      })
        // The owner reads EOF; lingering native handles must not keep this probe alive.
        .then(() => process.stdout.write('', () => process.exit(0)))
        .catch(failStartup)
    } else {
      // Stdout is the readiness API; send incidental diagnostics to stderr.
      reserveServeStdoutForReadiness()
      void preflightBundledDolphindStartup()
        .then((qualified) => {
          onNodePtyLoadFailure(() => void discardBundledDolphindStartupQualification())
          // Probe before deferred node-pty loading can crash this process; a slot qualified on this
          // unchanged host passed it on its last launch.
          if (runDolphindNativePreflightVerdict({ qualified }) !== 'ok') {
            forgetBundledDolphindStartupQualification()
          }
          return main()
        })
        .then(confirmBundledDolphindStartupQualified)
        .catch(failStartup)
    }
  } catch (error) {
    failStartup(error)
  }
}
