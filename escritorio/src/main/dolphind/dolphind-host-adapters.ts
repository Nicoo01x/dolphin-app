import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { DOLPHIND_CLI_PACKAGE_FILENAME } from '../../shared/dolphind-artifacts'
import { setAppEnvironment, type AppEnvironment } from '../../shared/app-environment'
import { setSecretStore } from '../../shared/secret-store'
import { resolveDolphindInstallRoot, resolveDolphindPath } from './dolphind-app-paths'
import { getDolphindCliLauncherPath } from './dolphind-cli-launcher'
import { createDolphindSecretStore, type DolphindSecretStore } from './dolphind-secret-store'
import { setSpeechServiceFactories } from '../speech/speech-runtime-service'
import { dolphindSpeechServiceFactories } from './dolphind-speech-services'

let quitRegisteredHandlers = (): void => {}

export function runDolphindQuitHandlers(): void {
  quitRegisteredHandlers()
}

function createNodeAppEnvironment(): AppEnvironment {
  const quitHandlers: (() => void)[] = []
  // Synchronous quit handlers must not preempt the signal handler’s awaited runtime/browser teardown.
  quitRegisteredHandlers = (): void => {
    const errors: unknown[] = []
    for (const handler of quitHandlers.splice(0)) {
      try {
        handler()
      } catch (error) {
        errors.push(error)
      }
    }
    // Failed handlers may leave writers running and keep the instance lock held.
    if (errors.length > 0) {
      throw new AggregateError(errors, 'dolphind_quit_handlers_failed')
    }
  }
  return {
    getPath: resolveDolphindPath,
    getAppPath: () => resolveDolphindInstallRoot(),
    getVersion: () => process.env.DOLPHIN_VERSION ?? '0.0.0-dolphind',
    // Packaged gates production HTTPS/CLI/PATH policy; layout callers must inspect asar separately.
    isPackaged: () => true,
    getCliLauncherPath: getDolphindCliLauncherPath,
    onWillQuit: (handler) => quitHandlers.push(handler),
    exit: (code = 0) => process.exit(code),
    getAppMetrics: () => []
  }
}

let dolphindSecretStore: DolphindSecretStore | null = null

export async function prepareDolphindSecretStore(
  keyDir: string,
  userDataPath: string
): Promise<boolean> {
  if (!dolphindSecretStore) {
    throw new Error(
      'dolphind_secret_store_not_installed — call installDolphindHostAdapters() first'
    )
  }
  return dolphindSecretStore.prepare({ keyDir, userDataPath })
}

/** Stamp the bundle’s own release so inherited desktop versions cannot misidentify this server. */
export function stampDolphindAppVersion(installRoot: () => string = resolveDolphindInstallRoot): void {
  let version: unknown
  try {
    const path = join(installRoot(), ...DOLPHIND_CLI_PACKAGE_FILENAME.split('/'))
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    version = parsed && typeof parsed === 'object' && 'version' in parsed ? parsed.version : null
  } catch {
    return
  }
  if (typeof version === 'string' && version.length > 0) {
    process.env.DOLPHIN_APP_VERSION = version
  }
}

export function installDolphindHostAdapters(): void {
  stampDolphindAppVersion()
  setAppEnvironment(createNodeAppEnvironment())
  dolphindSecretStore = createDolphindSecretStore()
  setSecretStore(dolphindSecretStore)
  setSpeechServiceFactories(dolphindSpeechServiceFactories)
}
