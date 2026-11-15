import { startDolphind } from './dolphind-entry'
import process from 'node:process'
import { resolveDolphindInstallRoot } from './dolphind-app-paths'
import { DOLPHIND_USAGE, parseArgs } from './dolphind-command-arguments'
import { installDolphindShutdownSignals, type DolphindShutdownTrigger } from './dolphind-lifecycle'
import { installDolphindProcessErrorGuards } from './dolphind-process-error-guards'
import { installDolphindStopRequestListeners } from './dolphind-stop-request-listener'
import { prepareDolphindManagedStop } from './dolphind-managed-stop-admission'
import { bindDolphindIdleShutdown } from './dolphind-managed-idle-exit-host'

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const options = parseArgs(argv)
  if (options.help) {
    console.log(DOLPHIND_USAGE)
    return
  }
  let shutdownTrigger: DolphindShutdownTrigger | null = null
  // Fire-and-forget startup work can reject before its first await completes.
  installDolphindProcessErrorGuards(() => shutdownTrigger)
  const startup = startDolphind(options)
  const requestShutdown = installDolphindShutdownSignals(async () => (await startup).stop())
  shutdownTrigger = requestShutdown
  const handle = await startup
  // Stop requests must name the runtime/instance established by startup.
  installDolphindStopRequestListeners(() => requestShutdown('stop request'), {
    installRoot: resolveDolphindInstallRoot(),
    managedStop: handle.managedStop,
    beforeManagedStop: prepareDolphindManagedStop
  })
  bindDolphindIdleShutdown(requestShutdown)
}
